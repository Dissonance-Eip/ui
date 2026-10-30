/**
 * IPC handlers for everything that touches the dissonance_core addon.
 *
 *   core:process          → run the audio pipeline on a WAV, output to temp
 *   core:readMetadata     → header + LIST/INFO tag parse (no audio decode)
 *   core:writeTags        → write LIST/INFO tags into an existing WAV
 *   core:export           → copy a tracked temp file to a path picked in the save dialog
 *   core:cleanupProcessed → unlink a tracked temp file
 *
 * One method per channel. Constructed once by coreSetup.js with the loaded
 * addon (or null plus the loader's error), a shared TempFileManager, the
 * per-file lock and the TagWriteCoordinator injected, and registered once
 * for all windows. Status events ("processing", "processed", "error",
 * "exported") go back on `core:status` to the window that made the request
 * (`event.sender`), never to a fixed window.
 *
 * Every payload is type-checked first (corePayloads.js; core:export uses
 * exportPaths.js). When the engine is unavailable, the addon-backed channels reply with
 * `code: ENGINE_UNAVAILABLE` and the loader's `reason`, so the UI can say so.
 */
const electron = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { senderOf, sendToRenderer } = require('../rendererMessaging');
const { IpcChannels } = require('../ipcChannels');
const { logger: mainLogger } = require('../../main/logger');
const { checkExportSource, checkExportDestination } = require('./exportPaths');
const {
  checkFilePath,
  checkProcessedPath,
  checkProcessOptions,
  checkTags,
} = require('./corePayloads');

const STATUS_CHANNEL = IpcChannels.CORE_STATUS;
const ENGINE_UNAVAILABLE = 'ENGINE_UNAVAILABLE';

/** `core:cleanupProcessed` takes a bare path or `{ processedPath }`. */
function processedPathOf(payload) {
  return typeof payload === 'string' ? payload : (payload && payload.processedPath) || null;
}

/** The first failed check's `{ ok: false, error }` reply, or null when all pass. */
function firstInvalid(...errors) {
  const error = errors.find(Boolean);
  return error ? { ok: false, error } : null;
}

class CoreIpcHandlers {
  /**
   * @param {object} opts
   * @param {object|null} opts.coreAddon       the loaded addon, or null
   * @param {Error|null} [opts.coreLoadError]   why the loader found no addon
   * @param {import('./TempFileManager').TempFileManager} opts.tempFileManager
   * @param {import('./FileLock').FileLock} opts.fileLock
   * @param {import('./TagWriteCoordinator').TagWriteCoordinator} opts.tagWriteCoordinator
   * @param {{handle: Function}} [opts.ipc]  defaults to Electron's ipcMain; tests pass a double
   * @param {object} [opts.dialog]          defaults to Electron's dialog
   */
  constructor({
    coreAddon,
    coreLoadError = null,
    tempFileManager,
    fileLock,
    tagWriteCoordinator,
    ipc = electron.ipcMain,
    dialog = electron.dialog,
    logger = mainLogger,
  }) {
    this.coreAddon = coreAddon;
    this.coreLoadError = coreLoadError;
    this.tempFileManager = tempFileManager;
    this.fileLock = fileLock;
    this.tagWriteCoordinator = tagWriteCoordinator;
    this.ipc = ipc;
    this.dialog = dialog;
    this.logger = logger;
  }

  register() {
    const handlers = {
      [IpcChannels.CORE_CLEANUP_PROCESSED]: this.cleanupProcessed,
      [IpcChannels.CORE_PROCESS]: this.process,
      [IpcChannels.CORE_READ_METADATA]: this.readMetadata,
      [IpcChannels.CORE_WRITE_TAGS]: this.writeTags,
      [IpcChannels.CORE_EXPORT]: this.export,
    };
    Object.entries(handlers).forEach(([channel, handler]) =>
      this.ipc.handle(channel, handler.bind(this))
    );
  }

  async cleanupProcessed(_event, payload) {
    const processedPath = processedPathOf(payload);
    const invalid = firstInvalid(checkProcessedPath(processedPath));
    if (invalid) return invalid;

    const error = await this._deleteTempFile(() =>
      this.tempFileManager.cleanupTempFile(processedPath)
    );
    return error ? { ok: false, error: String(error) } : { ok: true };
  }

  async process(event, payload) {
    const filePath = payload?.filePath ?? null;
    const userOptions = payload?.options ?? {};
    const { sender, senderId } = senderOf(event);

    const invalid = firstInvalid(checkFilePath(filePath), checkProcessOptions(userOptions));
    if (invalid) return invalid;
    const unavailable = this._requireAddonFn('process', 'Core addon not available');
    if (unavailable) return unavailable;

    // A leftover that can't be deleted must not block a new run.
    if (senderId) await this._deleteTempFile(() => this.tempFileManager.cleanupForSender(senderId));

    // Generate a temp output path so processed files don't land next to
    // the user's input (which would also surprise-delete them on cleanup).
    // userOptions can carry caller-supplied perturbation etc.; outputPath is
    // forced here so the renderer can't redirect output to arbitrary paths.
    await this.tempFileManager.ensureRootDir();
    const outputPath = this.tempFileManager.makeTempProcessedPath(filePath);
    const addonOptions = { ...userOptions, outputPath };

    sendToRenderer(sender, STATUS_CHANNEL, {
      status: 'processing',
      message: 'Processing started',
    });

    try {
      // Under the file lock so another window can't rewrite the input's tags mid-read.
      const result = await this.fileLock.runExclusive(filePath, () =>
        this.coreAddon.process(filePath, addonOptions)
      );
      const processedPath = result?.processedPath ?? outputPath;
      this.tempFileManager.registerForSender(senderId, processedPath);

      sendToRenderer(sender, STATUS_CHANNEL, {
        status: 'processed',
        message: 'Processing complete',
        processedPath,
      });
      return { ok: true, processedPath };
    } catch (err) {
      this.logger.error('Core addon processing error', err);
      sendToRenderer(sender, STATUS_CHANNEL, {
        status: 'error',
        message: 'Processing failed',
        error: String(err),
      });
      return { ok: false, error: String(err) };
    }
  }

  async readMetadata(event, filePath) {
    const invalid = firstInvalid(checkFilePath(filePath));
    if (invalid) return invalid;
    const unavailable = this._requireAddonFn('readMetadata');
    if (unavailable) return unavailable;
    try {
      return await this.tagWriteCoordinator.readMetadata(senderOf(event).senderId, filePath);
    } catch (err) {
      this.logger.error('core:readMetadata error', err);
      return { ok: false, error: String(err) };
    }
  }

  async writeTags(event, payload) {
    const filePath = payload && payload.filePath ? payload.filePath : null;
    const tags = payload && payload.tags ? payload.tags : {};

    const invalid = firstInvalid(checkFilePath(filePath), checkTags(tags));
    if (invalid) return invalid;
    const unavailable = this._requireAddonFn('writeTags');
    if (unavailable) return unavailable;

    try {
      return await this.tagWriteCoordinator.writeTags(senderOf(event).senderId, filePath, tags);
    } catch (err) {
      this.logger.error('core:writeTags error', err);
      return { ok: false, error: String(err) };
    }
  }

  async export(event, processedPath) {
    // The source must be a temp file this app created; checked before any dialog opens.
    const sourceError = await checkExportSource(this.tempFileManager, processedPath);
    if (sourceError) return { ok: false, error: sourceError };
    const { sender } = senderOf(event);

    try {
      // The destination only ever comes from the save dialog, never the renderer.
      const { canceled, filePath } = await this.dialog.showSaveDialog({
        title: 'Export processed file',
        defaultPath: path.basename(processedPath),
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }],
      });
      if (canceled || !filePath) return { ok: false, error: 'Export canceled' };

      const destinationError = checkExportDestination(this.tempFileManager, filePath);
      if (destinationError) return { ok: false, error: destinationError };

      await fs.copyFile(processedPath, filePath);

      // The export succeeded; a temp file that can't be deleted is only logged.
      await this._deleteTempFile(() => this.tempFileManager.cleanupTempFile(processedPath));

      sendToRenderer(sender, STATUS_CHANNEL, {
        status: 'exported',
        message: `Exported to ${filePath}`,
        exportedPath: filePath,
      });

      return { ok: true, exportedPath: filePath };
    } catch (err) {
      this.logger.error('Export error', err);
      sendToRenderer(sender, STATUS_CHANNEL, { status: 'error', message: 'Export failed' });
      return { ok: false, error: String(err) };
    }
  }

  /**
   * @param {string} name     the addon function the channel needs
   * @param {string} [error]  the reply's error text (kept as the renderer knows it)
   * @returns {object|null}   null when `coreAddon[name]` is callable, else the
   *                          `{ ok: false, code: ENGINE_UNAVAILABLE }` reply
   */
  /**
   * Runs a temp-file cleanup. A failure (EPERM, EBUSY, ...) is logged and
   * returned instead of thrown, so it never aborts the flow around it.
   * @returns {Promise<Error|null>}
   */
  async _deleteTempFile(cleanup) {
    try {
      await cleanup();
      return null;
    } catch (err) {
      this.logger.error('Could not delete a processed temp file', err);
      return err;
    }
  }

  _requireAddonFn(name, error = `Core addon ${name} not available`) {
    if (this.coreAddon && typeof this.coreAddon[name] === 'function') return null;
    return {
      ok: false,
      error,
      code: ENGINE_UNAVAILABLE,
      reason: this.coreLoadError ? this.coreLoadError.message : null,
    };
  }
}

module.exports = { CoreIpcHandlers, ENGINE_UNAVAILABLE };
