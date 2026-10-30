/**
 * Which screen is showing (upload / analyze / processing / compare), the
 * header that only Upload shows, and the Process / Export buttons that
 * follow the session state. Pure view switching: it never calls the api.
 */
export class ScreenNavigator {
  /** @param {{ router: object, state: object, analyzeView: object, compareView: object, headerEl?: HTMLElement|null }} deps */
  constructor({ router, state, analyzeView, compareView, headerEl }) {
    this.router = router;
    this.state = state;
    this.analyzeView = analyzeView;
    this.compareView = compareView;
    this.headerEl = headerEl;
  }

  showAnalyze() {
    this.router.show('analyze');
    this.setHeaderVisible(false);
    this.syncButtons();
  }

  /** Processing is a loading screen: Compare is only shown once populated. */
  showProcessing() {
    this.analyzeView.pauseAudioPreview();
    this.router.show('processing');
    this.setHeaderVisible(false);
  }

  showCompare() {
    this.analyzeView.pauseAudioPreview();
    this.router.show('compare');
    this.setHeaderVisible(false);
    this.syncButtons();
  }

  showUpload() {
    this.router.show('upload');
    this.setHeaderVisible(true);
    this.syncButtons();
  }

  /** Empty the Analyze and Compare screens of the last file. */
  clearFileScreens() {
    this.analyzeView.setSelectedFile(null);
    this.analyzeView.setBasicWavInfo(null);
    this.analyzeView.clearAudioPreview();
    this.compareView.setOriginalInfo(null);
    this.compareView.setProcessedInfo(null);
    this.compareView.clearAudioPreviews?.();
  }

  /** Pause every audio preview in this window (analyze + both compare players). */
  pauseAllPreviews() {
    this.analyzeView.pauseAudioPreview();
    this.compareView.pauseAudioPreviews?.();
  }

  syncButtons() {
    this.analyzeView.setProcessEnabled(this.state.hasCurrentFile());
    this.compareView.setExportEnabled(this.state.hasProcessedFile());
  }

  setHeaderVisible(visible) {
    if (!this.headerEl) return;
    this.headerEl.hidden = !visible;
  }
}
