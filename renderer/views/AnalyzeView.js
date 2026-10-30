/**
 * Second screen after a file is imported. Shows:
 *   • the selected file name + a "Change file" button
 *   • basic WAV info (filename, duration, sample rate, channels)
 *   • a WaveformPreview (single player)
 *   • the editable metadata form (title, artist, date, genre, comment,
 *     copyright, software) — TAG_FIELDS is the single source of truth
 *   • the Process button
 *
 * Pure presentational concerns only — the queue/write logic lives in
 * AppController via onTagBlur + onPlaybackStateChange callbacks.
 */
import { BaseComponent } from '../base/BaseComponent.js';
import { WaveformPreview } from '../components/WaveformPreview.js';
import { renderWavInfo } from './renderWavInfo.js';
import { basename } from '../utils/pathUtils.js';
import { canProcess } from '../utils/processingOptions.js';

// Single source of truth for editable metadata fields.
const TAG_FIELDS = ['title', 'artist', 'date', 'genre', 'comment', 'copyright', 'software'];

export class AnalyzeView extends BaseComponent {
  constructor({
    selectedFileEl,
    changeFileBtn,
    metaDurationEl,
    metaSampleRateEl,
    metaChannelsEl,
    waveformEl,
    tagTitleEl,
    tagArtistEl,
    tagDateEl,
    tagGenreEl,
    tagCommentEl,
    tagCopyrightEl,
    tagSoftwareEl,
    processingModeEls,
    processingModeLabelEl,
    processBtn,
  }) {
    super();
    this.selectedFileEl = selectedFileEl;
    this.changeFileBtn = changeFileBtn;
    this.metaDurationEl = metaDurationEl;
    this.metaSampleRateEl = metaSampleRateEl;
    this.metaChannelsEl = metaChannelsEl;
    this.processingModeEls = Array.from(processingModeEls || []);
    this.processingModeLabelEl = processingModeLabelEl;
    this.processBtn = processBtn;
    this._processEnabled = false;

    // Editable tag inputs, keyed by field name.
    this._tagEls = {
      title: tagTitleEl,
      artist: tagArtistEl,
      date: tagDateEl,
      genre: tagGenreEl,
      comment: tagCommentEl,
      copyright: tagCopyrightEl,
      software: tagSoftwareEl,
    };

    this._preview = new WaveformPreview({ containerEl: waveformEl, height: 164 });
  }

  mount() {
    super.mount();
    this._preview.mount();
    this.track(() => this._preview.unmount());

    if (this.processingModeEls.length > 0) {
      const sync = () => this._syncProcessingControls();
      this.processingModeEls.forEach((el) => this.listen(el, 'change', sync));
      this._syncProcessingControls();
    }
  }

  // ---------------------------------------------------------------------------
  // File / waveform
  // ---------------------------------------------------------------------------

  setAudioPreviewFile(filePath) {
    this._preview.setFile(filePath);
  }

  pauseAudioPreview() {
    this._preview.pause();
  }

  clearAudioPreview() {
    this._preview.clear();
  }

  /**
   * Forward the underlying audio element's play/pause/ended events to a
   * callback. Delegates to WaveformPreview, which keeps the same audio
   * element across theme changes (the waveform is repainted in place).
   */
  onPlaybackStateChange(cb) {
    this._preview.setOnPlaybackStateChange(cb);
  }

  // ---------------------------------------------------------------------------
  // File chip + WAV info
  // ---------------------------------------------------------------------------

  setSelectedFile(filePath) {
    if (!this.selectedFileEl) return;
    // Show only the filename; hover (`title` attr) reveals the full path.
    this.selectedFileEl.textContent = filePath ? basename(filePath) : 'No file selected';
    this.selectedFileEl.title = filePath || '';
  }

  /**
   * Populate the info panel + (optionally) the editable tag inputs.
   * Pass `null` or `{}` to render placeholders ("—") for the read-only
   * fields without touching the tag inputs.
   * @param {{filename?: string, durationSec?: number, sampleRate?: number,
   *          channels?: number, tags?: object}|null} basicInfo
   */
  setBasicWavInfo(basicInfo) {
    renderWavInfo(
      {
        durationEl: this.metaDurationEl,
        sampleRateEl: this.metaSampleRateEl,
        channelsEl: this.metaChannelsEl,
      },
      basicInfo
    );

    const tags = basicInfo && basicInfo.tags;
    if (tags) this.setMetadataTags(tags);
  }

  // ---------------------------------------------------------------------------
  // Editable tag fields
  // ---------------------------------------------------------------------------

  setMetadataTags(tags = {}) {
    for (const name of TAG_FIELDS) {
      const el = this._tagEls[name];
      if (el) el.value = tags[name] || '';
    }
  }

  /**
   * Snapshot the current form. Always returns the full TAG_FIELDS shape,
   * with missing inputs reported as empty strings — so writeTags receives
   * a complete tag set every time and can drop empty fields cleanly.
   */
  getMetadataTags() {
    const out = {};
    for (const name of TAG_FIELDS) {
      const el = this._tagEls[name];
      out[name] = el ? el.value.trim() : '';
    }
    return out;
  }

  /**
   * Fire `cb(tags)` every time the user finishes editing a field.
   * The controller decides whether to write immediately, queue, or block
   * (via TagWriteQueue) — this view just reports the event.
   */
  onTagBlur(cb) {
    for (const name of TAG_FIELDS) {
      const el = this._tagEls[name];
      if (!el) continue;
      this.listen(el, 'blur', () => cb(this.getMetadataTags()));
    }
  }

  // ---------------------------------------------------------------------------
  // Buttons
  // ---------------------------------------------------------------------------

  getProcessingModes() {
    return this.processingModeEls.filter((el) => el.checked).map((el) => el.value);
  }

  setProcessEnabled(enabled) {
    this._processEnabled = Boolean(enabled);
    this._syncProcessingControls();
  }

  onChangeFile(cb) {
    if (this.changeFileBtn) this.listen(this.changeFileBtn, 'click', cb);
  }

  onProcess(cb) {
    if (this.processBtn) this.listen(this.processBtn, 'click', cb);
  }

  _getSelectedModeLabels() {
    return this.processingModeEls
      .filter((el) => el.checked)
      .map((el) => el.getAttribute('data-label') || el.value);
  }

  _syncProcessingControls() {
    const selectedLabels = this._getSelectedModeLabels();
    if (this.processingModeLabelEl) {
      if (selectedLabels.length === 0) {
        this.processingModeLabelEl.textContent = 'Select modes';
      } else if (selectedLabels.length === 1) {
        this.processingModeLabelEl.textContent = selectedLabels[0];
      } else {
        this.processingModeLabelEl.textContent = `${selectedLabels.length} selected`;
      }
    }

    if (this.processBtn) {
      this.processBtn.disabled = !canProcess(this._processEnabled, selectedLabels);
    }
  }
}
