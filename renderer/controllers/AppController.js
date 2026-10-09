/**
 * Top-level renderer controller — owns the four-view flow (upload / analyze /
 * processing / compare) and the TagWriteQueue. start() wires every event the
 * app reacts to:
 *
 *   • upload / drop → importFile → analyze view
 *   • change file → re-open dialog → importFile
 *   • tag blur → enqueue write (queue defers while audio plays)
 *   • playback play/pause → toggle queue blocked state
 *   • process → processing view (dedicated loading screen) → flush queue →
 *     core processes → tag the output → populate + reveal compare view
 *     (or back to analyze on error)
 *   • export → copy temp to user location → reset to upload
 *   • restart (always-visible button, any screen) → flush + reset to upload,
 *     discarding any in-flight processing result via the operation id
 *   • quit flush request → pause, snapshot form, drain, notify main
 *
 * Compare's content is only populated once the processing screen is showing
 * — never while `#view-compare` itself is hidden — so the waveform players
 * inside it always initialize against a laid-out, visible container.
 *
 * _pauseAndFlushTags() is the single chokepoint used by importFile,
 * processCurrentFile, and the quit handler; see its comment.
 */
import { BaseController } from '../base/BaseController.js';
import { TagWriteQueue } from '../services/TagWriteQueue.js';

export class AppController extends BaseController {
  constructor({
    api,
    logger,
    router,
    state,
    uploadView,
    analyzeView,
    compareView,
    headerEl,
    restartBtn,
    wavMetadataService,
  }) {
    super();
    this.api = api;
    this.logger = logger;
    this.router = router;
    this.state = state;
    this.uploadView = uploadView;
    this.analyzeView = analyzeView;
    this.compareView = compareView;
    this.headerEl = headerEl;
    this.restartBtn = restartBtn;
    this.wavMetadataService = wavMetadataService;

    this._originalBasicInfo = null;
    this._processedBasicInfo = null;

    // Bumped on every processCurrentFile() call and on restart(); a
    // processCurrentFile() run checks this after each await and bails if it
    // no longer matches, so a restart mid-processing can't have its (now
    // irrelevant) result land on top of the reset UI. The in-flight core
    // call itself isn't cancelled — there's no cancellation IPC — this just
    // makes the renderer ignore the stale result when it eventually arrives.
    this._activeOperationId = 0;

    // Serialised, blockable queue for auto-saving tag edits. Blocked while
    // the audio element is streaming a file; flushed on quit.
    this._tagQueue = new TagWriteQueue({
      writeFn: (filePath, tags) => this.api.writeTags(filePath, tags),
      onError: (err) => this.logger?.log?.(`Auto-save tags failed: ${err}`),
    });

    this._onGlobalDragOver = this._onGlobalDragOver.bind(this);
    this._onGlobalDrop = this._onGlobalDrop.bind(this);
  }

  start() {
    super.start();
    this.uploadView.mount();
    this.track(() => this.uploadView.unmount());

    this.analyzeView.mount();
    this.track(() => this.analyzeView.unmount());

    this.compareView.mount();
    this.track(() => this.compareView.unmount());

    this.router.show('upload');
    this._setHeaderVisible(true);

    this.uploadView.onFileImported((filePath, sourceLabel) => {
      this.importFile(filePath, sourceLabel);
    });

    this.analyzeView.onChangeFile(async () => {
      try {
        this.logger?.setStatus?.('Opening file dialog...');
        const filePath = await this.api.openFile(this.state.lastImportedFilePath);
        if (!filePath) {
          this.logger?.log?.('No file selected');
          this.logger?.setStatus?.('Import canceled');
          return;
        }
        this.importFile(filePath, 'Selected');
      } catch (err) {
        this.logger?.error?.(`Import failed: ${err}`);
      }
    });

    this.analyzeView.onProcess(() => this.processCurrentFile());

    // Each blur snapshots the current tags + file path into the queue.
    // The queue defers the write while audio is playing (see below) and
    // serialises writes so concurrent calls can't corrupt the file.
    this.analyzeView.onTagBlur((tags) => {
      const filePath = this.state.currentFilePath;
      if (filePath) this._tagQueue.enqueue(filePath, tags);
    });

    // Block the queue while audio is playing, unblock on pause/end so any
    // queued snapshot flushes immediately when the user stops playback.
    this.analyzeView.onPlaybackStateChange((isPlaying) => {
      this._tagQueue.setBlocked(isPlaying);
    });

    this.compareView.onExport(() => this.exportProcessedFile());

    if (this.restartBtn) {
      const onRestart = () => this.restart();
      this.restartBtn.addEventListener('click', onRestart);
      this.track(() => this.restartBtn.removeEventListener('click', onRestart));
    }

    // Before the app quits: pause playback, drain the queue, signal main.
    window.dissonance.onAppFlushRequest(async () => {
      await this._pauseAndFlushTags();
      window.dissonance.notifyFlushDone();
    });

    // Prevent the browser/Electron from navigating to the dropped file.
    window.addEventListener('dragover', this._onGlobalDragOver);
    window.addEventListener('drop', this._onGlobalDrop);
    this.track(() => window.removeEventListener('dragover', this._onGlobalDragOver));
    this.track(() => window.removeEventListener('drop', this._onGlobalDrop));

    // Listen for core status events from main via preload bridge
    const unsubscribe = this.api.onCoreStatus((data) => {
      const msg = data && data.message ? data.message : JSON.stringify(data);
      this.logger?.log?.(`core:status — ${msg}`);
    });
    if (typeof unsubscribe === 'function') {
      this.track(unsubscribe);
    }

    this._syncButtons();
    this.logger?.setStatus?.('Ready');
  }

  /**
   * Handle a new source file selected by the user (dropped or picked).
   * @param {string} filePath       absolute path of the WAV
   * @param {string} sourceLabel    'Dropped' or 'Selected' — for logging only
   */
  async importFile(filePath, sourceLabel) {
    // Capture any tag edits for the OLD file and flush them safely before we
    // touch anything. Also waits for in-flight writes so readMetadata below
    // sees fresh values (matters when reimporting the same file).
    await this._pauseAndFlushTags();

    if (this.state.processedFilePath) {
      // Best-effort cleanup of the previous processed temp file.
      this.api.cleanupProcessedFile(this.state.processedFilePath).catch(() => {});
    }

    this.state.setCurrentFilePath(filePath);
    this._originalBasicInfo = this.wavMetadataService.toBasicInfo(filePath, null);
    this._processedBasicInfo = null;

    this.compareView.clearAudioPreviews?.();

    this.analyzeView.setSelectedFile(filePath);
    this.analyzeView.setBasicWavInfo(this._originalBasicInfo);
    this.analyzeView.setAudioPreviewFile(filePath);
    this.analyzeView.setProcessEnabled(true);

    this.logger?.log?.(`${sourceLabel} file: ${filePath}`);
    this.logger?.setStatus?.('File imported');

    this._showAnalyze();

    // Read WAV metadata immediately so the user can view and edit fields before processing.
    this._readFileMetadata(filePath);
  }

  async _readFileMetadata(filePath) {
    if (!filePath) return;
    try {
      this.logger?.setStatus?.('Reading metadata…');
      const resp = await this.api.readFileMetadata(filePath);
      if (resp && resp.ok && resp.audio) {
        this._originalBasicInfo = this.wavMetadataService.toBasicInfoFromMetadata(filePath, resp);
        this.analyzeView.setBasicWavInfo(this._originalBasicInfo);
        this.logger?.setStatus?.('Ready');
        return;
      }
      const errMsg = resp && resp.error ? resp.error : 'Unknown error';
      this.logger?.setStatus?.(`Metadata failed: ${errMsg}`, true);
    } catch (err) {
      this.logger?.error?.(`Metadata failed: ${err}`);
    }
  }

  async processCurrentFile() {
    if (!this.state.currentFilePath) {
      this.logger?.setStatus?.('No file to process', true);
      return;
    }

    const operationId = ++this._activeOperationId;

    try {
      this.logger?.setStatus?.('Processing...');
      this.logger?.log?.('Sending processing request to dissonance-core');

      // Navigate to a dedicated loading screen immediately instead of making
      // the user wait on Analyze — the core call below can take a few
      // seconds and staring at an unchanged screen feels broken. Compare
      // itself isn't shown until its content is populated below, so the
      // waveform players never initialize against a hidden (zero-size)
      // container.
      this._showProcessing();

      // Pause playback + capture any unsaved tag edits + drain the queue
      // before the core reads the input file.
      await this._pauseAndFlushTags();

      const modes = this.analyzeView.getProcessingModes?.() ?? [];
      const sliderValue = this.analyzeView.getProtectionStrength();

      let options;
      if (modes.length > 0) {
        options = { modes, perturbation: 0.5 };
      } else if (sliderValue > 0) {
        const stacked = ['white_noise'];
        if (sliderValue > 0.25) stacked.push('phase_distortion');
        if (sliderValue > 0.5) stacked.push('spectral_gate');
        if (sliderValue > 0.75) stacked.push('pink_noise');
        options = { modes: stacked, perturbation: sliderValue };
      } else {
        options = {};
      }
      const resp = await this.api.processFile(this.state.currentFilePath, options);

      if (operationId !== this._activeOperationId) {
        // The app was restarted while this request was in flight — the core
        // can't be cancelled mid-run, so just ignore the now-stale result.
        this.logger?.log?.('Discarding processing result — app was restarted');
        return;
      }

      if (resp && resp.ok && resp.processedPath) {
        // Write the user's edited metadata tags into the processed file.
        const editedTags = this.analyzeView.getMetadataTags?.() ?? {};
        this._tagQueue.enqueue(resp.processedPath, editedTags);
        await this._tagQueue.flush();

        this.state.setProcessedFilePath(resp.processedPath);

        const processedMeta = await this.api.readFileMetadata(resp.processedPath).catch(() => null);
        this._processedBasicInfo = this.wavMetadataService.toBasicInfoFromMetadata(
          resp.processedPath,
          processedMeta && processedMeta.ok ? processedMeta : {}
        );

        this.compareView.setOriginalInfo(this._originalBasicInfo);
        this.compareView.setProcessedInfo(this._processedBasicInfo);
        this.compareView.setAudioPreviewFiles?.({
          originalPath: this.state.currentFilePath,
          processedPath: this.state.processedFilePath,
        });
        this.compareView.setExportEnabled(true);

        this.logger?.setStatus?.('Processed');
        this.logger?.log?.(`Processing complete: ${resp.processedPath}`);
        this._syncButtons();

        this._showCompare();
        return;
      }

      const errMsg = resp && resp.error ? resp.error : 'Unknown error';
      this.logger?.setStatus?.(`Processing failed: ${errMsg}`, true);
      this.logger?.log?.(`Processing failed: ${errMsg}`);
      this._showAnalyze();
    } catch (err) {
      if (operationId !== this._activeOperationId) return; // restarted mid-flight; ignore
      this.logger?.error?.(`Processing failed: ${err}`);
      this._showAnalyze();
    }
  }

  async exportProcessedFile() {
    if (!this.state.processedFilePath) {
      this.logger?.setStatus?.('No processed file to export', true);
      return;
    }

    try {
      this.logger?.setStatus?.('Exporting...');
      this.logger?.log?.('Triggering export dialog');

      const resp = await this.api.exportFile(this.state.processedFilePath);
      if (resp && resp.ok && resp.exportedPath) {
        // After export, the main process cleans up the temp processed file.
        this.state.setProcessedFilePath(null);
        this._syncButtons();
        this.logger?.setStatus?.('Exported');
        this.logger?.log?.(`Exported to: ${resp.exportedPath}`);

        this._resetToUpload();
        return;
      }

      const errMsg = resp && resp.error ? resp.error : 'Unknown error';
      this.logger?.setStatus?.(`Export failed: ${errMsg}`, true);
      this.logger?.log?.(`Export failed: ${errMsg}`);
    } catch (err) {
      this.logger?.error?.(`Export failed: ${err}`);
    }
  }

  /**
   * Abandon whatever's in progress and go back to Upload, from any screen.
   * Doesn't cancel an in-flight core call (no cancellation IPC exists) —
   * invalidating the operation id just makes processCurrentFile() discard
   * that result when it eventually arrives instead of acting on it.
   */
  async restart() {
    this._activeOperationId++;
    this.logger?.log?.('Restarting');

    await this._pauseAndFlushTags().catch(() => {});

    if (this.state.processedFilePath) {
      this.api.cleanupProcessedFile(this.state.processedFilePath).catch(() => {});
    }

    this._resetToUpload();
    this.logger?.setStatus?.('Ready');
  }

  _syncButtons() {
    this.analyzeView.setProcessEnabled(this.state.hasCurrentFile());
    this.compareView.setExportEnabled(this.state.hasProcessedFile());
  }

  /**
   * Safe-flush the tag queue:
   *   1. Pause every audio preview (analyze + both compare players) so no
   *      audio element is streaming the file we're about to rewrite.
   *   2. Snapshot the current form into the queue for the current file path
   *      so any tag edit that didn't fire blur (native dialog stealing focus,
   *      Cmd+Q with focus in an input, clicking Process from an input, etc.)
   *      is captured.
   *   3. Await the queue draining all pending + in-flight writes.
   *
   * Called from importFile, processCurrentFile, and the quit flush handler.
   */
  async _pauseAndFlushTags() {
    this.analyzeView.pauseAudioPreview();
    this.compareView.pauseAudioPreviews?.();

    if (this.state.currentFilePath) {
      this._tagQueue.enqueue(this.state.currentFilePath, this.analyzeView.getMetadataTags());
    }

    await this._tagQueue.flush();
  }

  _showAnalyze() {
    this.router.show('analyze');
    this._setHeaderVisible(false);
    this._syncButtons();
  }

  _showCompare() {
    this.analyzeView.pauseAudioPreview();
    this.router.show('compare');
    this._setHeaderVisible(false);
    this._syncButtons();
  }

  _showProcessing() {
    this.analyzeView.pauseAudioPreview();
    this.router.show('processing');
    this._setHeaderVisible(false);
  }

  _resetToUpload() {
    this.analyzeView.pauseAudioPreview();
    this.compareView.pauseAudioPreviews?.();
    this.state.setCurrentFilePath(null);
    this._originalBasicInfo = null;
    this._processedBasicInfo = null;
    this.analyzeView.setSelectedFile(null);
    this.analyzeView.setBasicWavInfo(null);
    this.analyzeView.clearAudioPreview();
    this.compareView.setOriginalInfo(null);
    this.compareView.setProcessedInfo(null);
    this.compareView.clearAudioPreviews?.();
    this.router.show('upload');
    this._setHeaderVisible(true);
    this._syncButtons();
  }

  _setHeaderVisible(visible) {
    if (!this.headerEl) return;
    this.headerEl.hidden = !visible;
  }

  _onGlobalDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  _onGlobalDrop(e) {
    e.preventDefault();

    // Allow dropping anywhere in the window (useful after you are on the main view).
    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    const file = dt.files[0];
    const filePath = this.api?.getPathForFile ? this.api.getPathForFile(file) : file.path || null;
    if (!filePath) return;

    this.importFile(filePath, 'Dropped');
  }
}
