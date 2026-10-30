/**
 * From the shown source file to an exported result:
 *
 *   • process → processing screen → flush tag edits → core processes → tag
 *     the output → populate + reveal Compare (or back to Analyze on error)
 *   • export → copy the temp output to a user-picked location → Upload
 *   • restart (any screen) → flush + reset to Upload, discarding any
 *     in-flight processing result via the operation id
 *
 * Compare's content is only populated once the processing screen is
 * showing — never while `#view-compare` itself is hidden — so the waveform
 * players inside it always initialize against a laid-out, visible container.
 */
import { buildProcessingOptions } from '../utils/processingOptions.js';

const errorOf = (resp) => (resp && resp.error ? resp.error : 'Unknown error');

export class ProcessingFlow {
  /**
   * @param {{ api: object, logger?: object, state: object, analyzeView: object,
   *   compareView: object, wavMetadataService: object, tags: object,
   *   screens: object, getOriginalInfo: () => object|null,
   *   resetToUpload: () => void }} deps
   *   tags — the TagEditSession; screens — the ScreenNavigator;
   *   getOriginalInfo — basic info of the source file, for Compare.
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
    this.getOriginalInfo = deps.getOriginalInfo;
    this.resetToUpload = deps.resetToUpload;

    // Bumped on every process() call and on restart(); process() checks it
    // once the core answers and bails if it no longer matches, so a restart
    // mid-processing can't have its (now irrelevant) result land on top of
    // the reset UI. The in-flight core call itself isn't cancelled — there's
    // no cancellation IPC — the renderer just ignores the stale result.
    this._activeOperationId = 0;
  }

  async process() {
    if (!this.state.currentFilePath) {
      this.logger?.setStatus?.('No file to process', true);
      return;
    }
    const options = buildProcessingOptions(this.analyzeView.getProcessingModes?.() ?? []);
    if (!options) {
      this.logger?.setStatus?.('Select at least one processing mode');
      return;
    }
    const operationId = ++this._activeOperationId;
    try {
      await this._runCore(operationId, options);
    } catch (err) {
      if (operationId !== this._activeOperationId) return; // restarted mid-flight; ignore
      this.logger?.error?.(`Processing failed: ${err}`);
      this.screens.showAnalyze();
    }
  }

  async _runCore(operationId, options) {
    this.logger?.setStatus?.('Processing...');
    this.logger?.log?.('Sending processing request to dissonance-core');

    // Show the loading screen right away: the core call can take a few
    // seconds, and an unchanged Analyze screen feels broken meanwhile.
    this.screens.showProcessing();

    // Pause playback + capture unsaved tag edits + drain the queue before
    // the core reads the input file.
    await this.tags.pauseAndFlush();

    const resp = await this.api.processFile(this.state.currentFilePath, options);
    if (operationId !== this._activeOperationId) {
      this.logger?.log?.('Discarding processing result — app was restarted');
      return;
    }
    if (resp && resp.ok && resp.processedPath) {
      await this._showResult(resp.processedPath);
      return;
    }
    const errMsg = errorOf(resp);
    this.logger?.setStatus?.(`Processing failed: ${errMsg}`, true);
    this.logger?.log?.(`Processing failed: ${errMsg}`);
    this.screens.showAnalyze();
  }

  /** Tag the output with the user's edits, then populate and reveal Compare. */
  async _showResult(processedPath) {
    this.tags.copyFormTo(processedPath);
    await this.tags.flush();
    this.state.setProcessedFilePath(processedPath);

    const processedMeta = await this.api.readFileMetadata(processedPath).catch(() => null);
    const processedInfo = this.wavMetadataService.toBasicInfoFromMetadata(
      processedPath,
      processedMeta && processedMeta.ok ? processedMeta : {}
    );

    this.compareView.setOriginalInfo(this.getOriginalInfo());
    this.compareView.setProcessedInfo(processedInfo);
    this.compareView.setAudioPreviewFiles?.({
      originalPath: this.state.currentFilePath,
      processedPath: this.state.processedFilePath,
    });
    this.compareView.setExportEnabled(true);

    this.logger?.setStatus?.('Processed');
    this.logger?.log?.(`Processing complete: ${processedPath}`);
    this.screens.syncButtons();
    this.screens.showCompare();
  }

  async exportResult() {
    if (!this.state.processedFilePath) {
      this.logger?.setStatus?.('No processed file to export', true);
      return;
    }
    try {
      this.logger?.setStatus?.('Exporting...');
      this.logger?.log?.('Triggering export dialog');
      const resp = await this.api.exportFile(this.state.processedFilePath);
      if (resp && resp.ok && resp.exportedPath) {
        this._finishExport(resp.exportedPath);
        return;
      }
      const errMsg = errorOf(resp);
      this.logger?.setStatus?.(`Export failed: ${errMsg}`, true);
      this.logger?.log?.(`Export failed: ${errMsg}`);
    } catch (err) {
      this.logger?.error?.(`Export failed: ${err}`);
    }
  }

  _finishExport(exportedPath) {
    // After export, the main process cleans up the temp processed file.
    this.state.setProcessedFilePath(null);
    this.screens.syncButtons();
    this.logger?.setStatus?.('Exported');
    this.logger?.log?.(`Exported to: ${exportedPath}`);
    this.resetToUpload();
  }

  /**
   * Abandon whatever's in progress and go back to Upload, from any screen.
   * Doesn't cancel an in-flight core call (no cancellation IPC exists) —
   * invalidating the operation id just makes process() discard that result
   * when it eventually arrives instead of acting on it.
   */
  async restart() {
    this._activeOperationId++;
    this.logger?.log?.('Restarting');
    await this.tags.pauseAndFlush().catch(() => {});
    this.discardProcessedFile();
    this.resetToUpload();
    this.logger?.setStatus?.('Ready');
  }

  /** Best-effort removal of the current processed temp file, if any. */
  discardProcessedFile() {
    if (!this.state.processedFilePath) return;
    this.api.cleanupProcessedFile(this.state.processedFilePath).catch(() => {});
  }
}
