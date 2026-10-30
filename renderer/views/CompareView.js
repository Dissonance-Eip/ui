/**
 * Third screen after processing: side-by-side comparison of the original
 * and the processed WAV. Hosts two independent WaveformPreview instances
 * + an info panel each (rendered by renderWavInfo) + a single Export button.
 */
import { BaseComponent } from '../base/BaseComponent.js';
import { WaveformPreview } from '../components/WaveformPreview.js';
import { renderWavInfo } from './renderWavInfo.js';

export class CompareView extends BaseComponent {
  constructor({
    origFilenameEl,
    origDurationEl,
    origSampleRateEl,
    origChannelsEl,
    origWaveformEl,
    procFilenameEl,
    procDurationEl,
    procSampleRateEl,
    procChannelsEl,
    procWaveformEl,
    exportBtn,
  }) {
    super();
    this.origFilenameEl = origFilenameEl;
    this.origDurationEl = origDurationEl;
    this.origSampleRateEl = origSampleRateEl;
    this.origChannelsEl = origChannelsEl;

    this.procFilenameEl = procFilenameEl;
    this.procDurationEl = procDurationEl;
    this.procSampleRateEl = procSampleRateEl;
    this.procChannelsEl = procChannelsEl;

    this.exportBtn = exportBtn;

    this._origPreview = new WaveformPreview({ containerEl: origWaveformEl, height: 140 });
    this._procPreview = new WaveformPreview({ containerEl: procWaveformEl, height: 140 });
  }

  mount() {
    super.mount();
    this._origPreview.mount();
    this._procPreview.mount();
    this.track(() => this._origPreview.unmount());
    this.track(() => this._procPreview.unmount());
  }

  // ---------------------------------------------------------------------------
  // Waveform previews
  // ---------------------------------------------------------------------------

  setAudioPreviewFiles({ originalPath, processedPath }) {
    this._origPreview.setFile(originalPath);
    this._procPreview.setFile(processedPath);
  }

  setOriginalAudioPreviewFile(filePath) {
    this._origPreview.setFile(filePath);
  }

  pauseAudioPreviews() {
    this._origPreview.pause();
    this._procPreview.pause();
  }

  clearAudioPreviews() {
    this._origPreview.clear();
    this._procPreview.clear();
  }

  // ---------------------------------------------------------------------------
  // Info panels
  // ---------------------------------------------------------------------------

  setOriginalInfo(basicInfo) {
    renderWavInfo(
      {
        filenameEl: this.origFilenameEl,
        durationEl: this.origDurationEl,
        sampleRateEl: this.origSampleRateEl,
        channelsEl: this.origChannelsEl,
      },
      basicInfo
    );
  }

  setProcessedInfo(basicInfo) {
    renderWavInfo(
      {
        filenameEl: this.procFilenameEl,
        durationEl: this.procDurationEl,
        sampleRateEl: this.procSampleRateEl,
        channelsEl: this.procChannelsEl,
      },
      basicInfo
    );
  }

  // ---------------------------------------------------------------------------
  // Buttons
  // ---------------------------------------------------------------------------

  setExportEnabled(enabled) {
    if (this.exportBtn) this.exportBtn.disabled = !enabled;
  }

  onExport(cb) {
    if (this.exportBtn) this.listen(this.exportBtn, 'click', cb);
  }
}
