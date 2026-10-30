/**
 * Getting a source file onto the Analyze screen:
 *
 *   • importFile → flush the old file's tag edits → show the new file →
 *     read its metadata into the tag form
 *   • changeFile → open dialog → importFile
 *   • a drop anywhere in the window → importFile (and never let Electron
 *     navigate to the dropped file)
 *
 * A metadata reply is dropped when another read started since, or another
 * file is shown now, so a late reply can't fill the form with the wrong
 * file's tags (#111).
 */
import { promptForFile, resolveDroppedPath } from '../services/fileSelection.js';

export class FileImportFlow {
  /**
   * @param {{ api: object, logger?: object, state: object, analyzeView: object,
   *   compareView: object, wavMetadataService: object, tags: object,
   *   screens: object, discardProcessedFile: () => void }} deps
   *   tags — the TagEditSession; screens — the ScreenNavigator;
   *   discardProcessedFile — drops the previous processed temp file.
   */
  constructor(deps) {
    this.api = deps.api;
    this.logger = deps.logger;
    this.state = deps.state;
    this.analyzeView = deps.analyzeView;
    this.compareView = deps.compareView;
    this.wavMetadataService = deps.wavMetadataService;
    this.tags = deps.tags;
    this.screens = deps.screens;
    this.discardProcessedFile = deps.discardProcessedFile;

    // Basic info of the shown source file; Compare shows it next to the output.
    this.originalInfo = null;

    // Bumped on every metadata read; a reply whose id no longer matches is ignored.
    this._metadataReadId = 0;
  }

  /**
   * Handle a new source file selected by the user (dropped or picked).
   * @param {string} filePath       absolute path of the WAV
   * @param {string} sourceLabel    'Dropped' or 'Selected' — for logging only
   */
  async importFile(filePath, sourceLabel) {
    // Capture any tag edits for the OLD file and flush them safely before we
    // touch anything. Also waits for in-flight writes so the read below
    // sees fresh values (matters when reimporting the same file).
    await this.tags.pauseAndFlush();
    this.discardProcessedFile();

    this.state.setCurrentFilePath(filePath);
    this._showUnreadFile(filePath);

    this.logger?.log?.(`${sourceLabel} file: ${filePath}`);
    this.logger?.setStatus?.('File imported');
    this.screens.showAnalyze();

    // Read WAV metadata immediately so the user can view and edit fields before processing.
    this.readFileMetadata(filePath);
  }

  /** Show `filePath` with placeholder info until its metadata arrives. */
  _showUnreadFile(filePath) {
    this.originalInfo = this.wavMetadataService.toBasicInfo(filePath, null);
    this.tags.setFormFill(filePath, { loaded: false, tags: this.originalInfo.tags });

    this.compareView.clearAudioPreviews?.();
    this.analyzeView.setSelectedFile(filePath);
    this.analyzeView.setBasicWavInfo(this.originalInfo);
    this.analyzeView.setAudioPreviewFile(filePath);
    this.analyzeView.setProcessEnabled(true);
  }

  /** Read `filePath`'s metadata into the form, unless another file is shown by then. */
  async readFileMetadata(filePath) {
    if (!filePath) return;
    const readId = ++this._metadataReadId;
    try {
      this.logger?.setStatus?.('Reading metadata…');
      const resp = await this.api.readFileMetadata(filePath);
      if (!this._isCurrentRead(readId, filePath)) {
        this.logger?.log?.(`Ignoring metadata for ${filePath} — another file is shown now`);
        return;
      }
      if (resp && resp.ok && resp.audio) {
        this._showReadMetadata(filePath, resp);
        return;
      }
      const errMsg = resp && resp.error ? resp.error : 'Unknown error';
      this.logger?.setStatus?.(`Metadata failed: ${errMsg}`, true);
    } catch (err) {
      if (!this._isCurrentRead(readId, filePath)) return;
      this.logger?.error?.(`Metadata failed: ${err}`);
    }
  }

  _showReadMetadata(filePath, resp) {
    this.originalInfo = this.wavMetadataService.toBasicInfoFromMetadata(filePath, resp);
    this.analyzeView.setBasicWavInfo(this.originalInfo);
    this.tags.setFormFill(filePath, { loaded: true, tags: this.originalInfo.tags });
    this.logger?.setStatus?.('Ready');
  }

  _isCurrentRead(readId, filePath) {
    return readId === this._metadataReadId && filePath === this.state.currentFilePath;
  }

  /** "Change file" on Analyze: pick another file in the dialog. */
  async changeFile() {
    const filePath = await promptForFile({
      api: this.api,
      logger: this.logger,
      lastFilePath: this.state.lastImportedFilePath,
    });
    if (filePath) this.importFile(filePath, 'Selected');
  }

  /** Forget the shown file's info (back to Upload). */
  clear() {
    this.originalInfo = null;
  }

  /** Window-level dragover: allow the drop and show the copy cursor. */
  handleWindowDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  /** Window-level drop: import the file instead of navigating to it. */
  handleWindowDrop(e) {
    e.preventDefault();
    const filePath = resolveDroppedPath(e.dataTransfer, this.api);
    if (!filePath) return;
    this.importFile(filePath, 'Dropped');
  }
}
