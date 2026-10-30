/**
 * IPC handlers for everything that touches the dissonance_core addon.
 *
 *   core:process          → run the audio pipeline on a WAV, output to temp
 *   core:readMetadata     → header + LIST/INFO tag parse (no audio decode)
 *   core:writeTags        → write LIST/INFO tags into an existing WAV
 *   core:export           → copy a processed temp file to a user-chosen path
 *   core:cleanupProcessed → unlink a tracked temp file
 *
 * Constructed once by coreSetup.js with the loaded addon, a shared
 * TempFileManager, the per-file lock and the TagWriteCoordinator injected,
 * and registered once for all windows. Status events ("processing",
 * "processed", "error", "exported") go back on `core:status` to the window
 * that made the request (`event.sender`), never to a fixed window.
 */
const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { senderOf, sendToRenderer } = require('../rendererMessaging');

const STATUS_CHANNEL = 'core:status';

class CoreIpcHandlers {
  constructor({ coreAddon, tempFileManager, fileLock, tagWriteCoordinator }) {
    this.coreAddon = coreAddon;
    this.tempFileManager = tempFileManager;
    this.fileLock = fileLock;
    this.tagWriteCoordinator = tagWriteCoordinator;
  }

  register() {
    ipcMain.handle('core:cleanupProcessed', async (_event, payload) => {
      const processedPath =
        typeof payload === 'string' ? payload : (payload && payload.processedPath) || null;
      if (!processedPath) return { ok: false, error: 'No processed file path' };

      await this.tempFileManager.cleanupTempFile(processedPath);
      return { ok: true };
    });

    ipcMain.handle('core:process', async (event, payload) => {
      const filePath = payload?.filePath ?? null;
      const userOptions = payload?.options ?? {};
      const { sender, senderId } = senderOf(event);

      if (!filePath || typeof filePath !== 'string')
        return { ok: false, error: 'No file path provided' };
      if (!this.coreAddon || typeof this.coreAddon.process !== 'function')
        return { ok: false, error: 'Core addon not available' };

      if (senderId) await this.tempFileManager.cleanupForSender(senderId);

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
        console.error('Core addon processing error', err);
        sendToRenderer(sender, STATUS_CHANNEL, {
          status: 'error',
          message: 'Processing failed',
          error: String(err),
        });
        return { ok: false, error: String(err) };
      }
    });

    ipcMain.handle('core:readMetadata', async (event, filePath) => {
      if (!filePath || typeof filePath !== 'string')
        return { ok: false, error: 'No file path provided' };
      if (!this.coreAddon || typeof this.coreAddon.readMetadata !== 'function')
        return { ok: false, error: 'Core addon readMetadata not available' };
      try {
        return await this.tagWriteCoordinator.readMetadata(senderOf(event).senderId, filePath);
      } catch (err) {
        console.error('core:readMetadata error', err);
        return { ok: false, error: String(err) };
      }
    });

    ipcMain.handle('core:writeTags', async (event, payload) => {
      const filePath = payload && payload.filePath ? payload.filePath : null;
      const tags = payload && payload.tags ? payload.tags : {};

      if (!filePath) return { ok: false, error: 'No file path provided' };
      if (!this.coreAddon || typeof this.coreAddon.writeTags !== 'function')
        return { ok: false, error: 'Core addon writeTags not available' };

      try {
        return await this.tagWriteCoordinator.writeTags(senderOf(event).senderId, filePath, tags);
      } catch (err) {
        console.error('core:writeTags error', err);
        return { ok: false, error: String(err) };
      }
    });

    ipcMain.handle('core:export', async (event, payload) => {
      const processedPathStr =
        typeof payload === 'string' ? payload : (payload && payload.processedPath) || null;
      const destPath = (payload && payload.destPath) || null;

      if (!processedPathStr) return { ok: false, error: 'No processed file path' };
      const { sender } = senderOf(event);

      try {
        let canceled = false;
        let filePath;
        if (destPath) {
          filePath = destPath;
        } else {
          const result = await dialog.showSaveDialog({
            title: 'Export processed file',
            defaultPath: path.basename(processedPathStr),
            filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }],
          });
          canceled = result.canceled;
          filePath = result.filePath;
        }

        if (canceled || !filePath) {
          return { ok: false, error: 'Export canceled' };
        }

        await fs.copyFile(processedPathStr, filePath);

        await this.tempFileManager.cleanupTempFile(processedPathStr);

        sendToRenderer(sender, STATUS_CHANNEL, {
          status: 'exported',
          message: `Exported to ${filePath}`,
          exportedPath: filePath,
        });

        return { ok: true, exportedPath: filePath };
      } catch (err) {
        console.error('Export error', err);
        sendToRenderer(sender, STATUS_CHANNEL, { status: 'error', message: 'Export failed' });
        return { ok: false, error: String(err) };
      }
    });
  }
}

module.exports = { CoreIpcHandlers };
