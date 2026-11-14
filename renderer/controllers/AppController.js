/**
 * Top-level renderer controller: a thin coordinator that builds the
 * renderer's flows and wires view, window and main-process events to them.
 *
 *   • TagEditSession   — tag auto-save queue, form fill (#111), pause + flush
 *   • ScreenNavigator  — upload / analyze / processing / compare, header, buttons
 *   • FileImportFlow   — upload, change file, drop anywhere → Analyze + metadata
 *   • ProcessingFlow   — process → Compare, export, restart, operation id
 *
 * Also handles the multi-window events: another window about to rewrite the
 * shown file → pause its players; another window rewrote it → save own
 * edits, re-read tags, reload the players (the audio data may have moved).
 * The quit/close flush request pauses playback and drains the tag queue; the
 * preload answers main once that settles.
 */
import { BaseController } from '../base/BaseController.js';
import { FileImportFlow } from './FileImportFlow.js';
import { ProcessingFlow } from './ProcessingFlow.js';
import { ScreenNavigator } from './ScreenNavigator.js';
import { TagEditSession } from './TagEditSession.js';

export class AppController extends BaseController {
  /**
   * @param {object} deps the views, api, logger, router, state, headerEl,
   *   restartBtn and wavMetadataService built by bootstrap.js.
   *   eventTarget — where window-level drops are caught (default `window`).
   */
  constructor(deps) {
    super();
    this.api = deps.api;
    this.logger = deps.logger;
    this.state = deps.state;
    this.uploadView = deps.uploadView;
    this.analyzeView = deps.analyzeView;
    this.compareView = deps.compareView;
    this.restartBtn = deps.restartBtn;
    this.eventTarget = deps.eventTarget;

    this.screens = new ScreenNavigator(deps);
    this.tags = new TagEditSession({
      ...deps,
      pausePreviews: () => this.screens.pauseAllPreviews(),
    });
    this.processing = new ProcessingFlow({
      ...deps,
      tags: this.tags,
      screens: this.screens,
      getOriginalInfo: () => this.importer.originalInfo,
      resetToUpload: () => this._resetToUpload(),
    });
    this.importer = new FileImportFlow({
      ...deps,
      tags: this.tags,
      screens: this.screens,
      discardProcessedFile: () => this.processing.discardProcessedFile(),
    });
  }

  start() {
    super.start();
    this._mountViews();
    this.screens.showUpload();
    this._wireImport();
    this._wireTags();
    this._wireProcessing();
    this._wireAppEvents();
    this.screens.syncButtons();
    this.logger?.setStatus?.('Ready');
  }

  _mountViews() {
    for (const view of [this.uploadView, this.analyzeView, this.compareView]) {
      view.mount();
      this.track(() => view.unmount());
    }
  }

  _wireImport() {
    this.uploadView.onFileImported((filePath, sourceLabel) => {
      this.importFile(filePath, sourceLabel);
    });
    this.analyzeView.onChangeFile(() => this.importer.changeFile());

    // Prevent the browser/Electron from navigating to the dropped file.
    const target = this.eventTarget ?? window;
    const onDragOver = (e) => this.importer.handleWindowDragOver(e);
    const onDrop = (e) => this.importer.handleWindowDrop(e);
    target.addEventListener('dragover', onDragOver);
    target.addEventListener('drop', onDrop);
    this.track(() => target.removeEventListener('dragover', onDragOver));
    this.track(() => target.removeEventListener('drop', onDrop));
  }

  _wireTags() {
    // Each blur snapshots the form into the queue, which defers the write
    // while audio plays and serialises writes so they can't corrupt the file.
    this.analyzeView.onTagBlur((tags) => this.tags.saveBlurredForm(tags));
    this.analyzeView.onPlaybackStateChange((isPlaying) => this.tags.setPlaying(isPlaying));
  }

  _wireProcessing() {
    this.analyzeView.onProcess(() => this.processCurrentFile());
    this.compareView.onExport(() => this.exportProcessedFile());
    if (!this.restartBtn) return;
    const onRestart = () => this.restart();
    this.restartBtn.addEventListener('click', onRestart);
    this.track(() => this.restartBtn.removeEventListener('click', onRestart));
  }

  _wireAppEvents() {
    // Before this window closes or the app quits: pause playback and drain the queue.
    this.track(this.api.onAppFlushRequest(() => this._pauseAndFlushTags()));
    // Another window is rewriting the tags of a file (see TagWriteCoordinator).
    this.track(this.api.onPauseFileRequest((request) => this.pauseIfShowing(request?.filePath)));
    this.track(
      this.api.onTagsWrittenElsewhere((event) => this.refreshAfterWriteElsewhere(event?.filePath))
    );
    this.track(
      this.api.onCoreStatus((data) => {
        const msg = data && data.message ? data.message : JSON.stringify(data);
        this.logger?.log?.(`core:status — ${msg}`);
      })
    );
  }

  importFile(filePath, sourceLabel) {
    return this.importer.importFile(filePath, sourceLabel);
  }

  processCurrentFile() {
    return this.processing.process();
  }

  exportProcessedFile() {
    return this.processing.exportResult();
  }

  restart() {
    return this.processing.restart();
  }

  /** The one tag-flush chokepoint; see TagEditSession.pauseAndFlush. */
  _pauseAndFlushTags() {
    return this.tags.pauseAndFlush();
  }

  _readFileMetadata(filePath) {
    return this.importer.readFileMetadata(filePath);
  }

  /**
   * Another window is about to rewrite `filePath`. Pause every player
   * streaming it here — the core truncates and rewrites the WAV, the same
   * reason the tag queue never writes while this window plays. Synchronous
   * so main can write as soon as the preload answers.
   */
  pauseIfShowing(filePath) {
    if (!filePath || filePath !== this.state.currentFilePath) return;
    this.screens.pauseAllPreviews();
  }

  /**
   * Another window rewrote `filePath`. Save this window's own edits first
   * (main merges them field by field), then show the file's current tags
   * and reload the players so they re-read the rewritten file.
   */
  async refreshAfterWriteElsewhere(filePath) {
    if (!filePath || filePath !== this.state.currentFilePath) return;
    try {
      await this._pauseAndFlushTags();
      await this._readFileMetadata(filePath);
      this.analyzeView.setAudioPreviewFile(filePath);
      if (this.state.hasProcessedFile()) this.compareView.setOriginalAudioPreviewFile(filePath);
    } catch (err) {
      this.logger?.error?.(`Refreshing after another window's edit failed: ${err}`);
    }
  }

  _resetToUpload() {
    this.screens.pauseAllPreviews();
    this.state.setCurrentFilePath(null);
    this.tags.clearFormFill();
    this.importer.clear();
    this.screens.clearFileScreens();
    this.screens.showUpload();
  }
}
