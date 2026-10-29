import { BaseComponent } from '../base/BaseComponent.js';
import { getWaveformColors } from '../utils/waveformColors.js';

/**
 * Reusable waveform preview built on the third-party WaveformPlayer.
 *
 * Encapsulates:
 *   - Player create / loadTrack / destroy lifecycle
 *   - Suppression of WaveformPlayer's unconditional auto-play in loadTrack()
 *   - file:// URL conversion for absolute paths
 *   - In-place theme repaint on `dissonance:theme` event (the player and
 *     its audio element are kept, so playback is never interrupted)
 *   - Audio play/pause/ended event forwarding via onPlaybackStateChange
 *
 * Used by AnalyzeView (one instance) and CompareView (two instances).
 */
export class WaveformPreview extends BaseComponent {
  constructor({ containerEl, height = 164, onPlaybackStateChange = null } = {}) {
    super();
    this.containerEl = containerEl;
    this.height = height;
    this._onPlaybackStateChange = onPlaybackStateChange;

    this._player = null;
    this._currentFilePath = null;
    this._themeMode = null;
    this._listenersAttachedTo = null; // HTMLAudioElement we last wired
    this._removeAudioListeners = null;

    this._onThemeChanged = this._onThemeChanged.bind(this);
  }

  mount() {
    super.mount();
    this.track(() => this.clear());
    this.listen(window, 'dissonance:theme', this._onThemeChanged);
  }

  /** Register / replace the play/pause/ended forwarding callback. */
  setOnPlaybackStateChange(cb) {
    this._onPlaybackStateChange = cb;
    this._attachAudioListeners(); // wire to current player if any
  }

  /**
   * Load a file into the preview. Switching from one file to another reuses
   * the player to avoid re-parsing / visual flash. The first-load and the
   * loadTrack path both stay paused (no auto-play).
   */
  setFile(filePath) {
    if (!this.containerEl) return;
    if (!filePath) {
      this._currentFilePath = null;
      this.clear();
      return;
    }
    this._currentFilePath = filePath;

    const url = WaveformPreview._toFileUrl(filePath);
    if (!url) {
      this.clear();
      return;
    }

    // Reuse existing player when possible — preserves waveform state.
    if (this._player?.loadTrack) {
      // loadTrack() unconditionally calls play() at the end; replace play
      // with a no-op for the duration of the call, then restore.
      const originalPlay = this._player.play.bind(this._player);
      this._player.play = () => Promise.resolve();
      this._player.loadTrack(url).finally(() => {
        if (this._player) this._player.play = originalPlay;
      });
      return;
    }

    this.clear();

    const WaveformPlayer = window.WaveformPlayer;
    if (typeof WaveformPlayer !== 'function') return;

    this.containerEl.innerHTML = '';
    this._player = new WaveformPlayer(this.containerEl, {
      url,
      autoplay: false,
      waveformStyle: 'mirror',
      height: this.height,
      // Default is 200; bumping to 400 gives a denser, smoother-looking
      // waveform on wider displays without noticeable cost on small files.
      samples: 400,
      showInfo: false,
      showTime: false,
      showBPM: false,
      showPlaybackSpeed: false,
      showHoverTime: true,
      ...getWaveformColors(this._themeMode ?? WaveformPreview._readDocumentThemeMode()),
    });

    // Wire audio event listeners to the new audio element. The same element
    // is reused across loadTrack() calls and theme changes, so this is only
    // needed once per fresh player.
    this._attachAudioListeners();

    // The library only ships click-to-seek; add drag-to-scrub on top so
    // users can hold and drag the playhead to land precisely where they want.
    this._attachDragScrub();
  }

  pause() {
    try {
      this._player?.pause?.();
    } catch (_e) {}
  }

  clear() {
    this._detachAudioListeners();
    this._detachDragScrub();
    try {
      this._player?.pause?.();
      this._player?.destroy?.();
    } catch (_e) {}
    this._player = null;
    if (this.containerEl) this.containerEl.innerHTML = '';
  }

  get audio() {
    return this._player?.audio ?? null;
  }

  get isPlaying() {
    return !!this._player?.isPlaying;
  }

  _attachAudioListeners() {
    const audio = this._player?.audio;
    if (!audio || !this._onPlaybackStateChange) return;
    if (this._listenersAttachedTo === audio) return; // already wired

    this._detachAudioListeners();
    this._listenersAttachedTo = audio;

    const fire = () => this._onPlaybackStateChange(this.isPlaying);
    audio.addEventListener('play', fire);
    audio.addEventListener('pause', fire);
    audio.addEventListener('ended', fire);

    this._removeAudioListeners = () => {
      audio.removeEventListener('play', fire);
      audio.removeEventListener('pause', fire);
      audio.removeEventListener('ended', fire);
    };
  }

  _detachAudioListeners() {
    try {
      this._removeAudioListeners?.();
    } catch (_e) {}
    this._removeAudioListeners = null;
    this._listenersAttachedTo = null;
  }

  /**
   * Hold + drag on the waveform canvas to scrub through the track. The
   * library only ships click-to-seek, so we listen for pointerdown on the
   * canvas and then mirror pointermove on the window (so dragging keeps
   * working even if the cursor leaves the canvas). Pointer-up anywhere
   * ends the drag.
   */
  _attachDragScrub() {
    const canvas = this._player?.canvas;
    if (!canvas || this._dragAttachedTo === canvas) return;
    this._detachDragScrub();
    this._dragAttachedTo = canvas;

    let dragging = false;

    const seekFrom = (clientX) => {
      const player = this._player;
      if (!player?.audio?.duration) return;
      const rect = canvas.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      player.seekToPercent?.(pct);
    };

    const onDown = (e) => {
      // Left mouse / primary touch only.
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      seekFrom(e.clientX);
      // Prevent text/canvas selection while dragging.
      e.preventDefault();
    };
    const onMove = (e) => {
      if (dragging) seekFrom(e.clientX);
    };
    const onUp = () => {
      dragging = false;
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    this._removeDragScrub = () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }

  _detachDragScrub() {
    try {
      this._removeDragScrub?.();
    } catch (_e) {}
    this._removeDragScrub = null;
    this._dragAttachedTo = null;
  }

  _onThemeChanged(e) {
    const mode = e?.detail?.mode ? String(e.detail.mode) : null;
    if (!mode || mode === this._themeMode) return;
    this._themeMode = mode;
    this._repaintPlayer(getWaveformColors(mode));
  }

  /**
   * Apply new colours to the live player and redraw its canvas. Rebuilding
   * the player instead would create a new audio element and re-decode the
   * whole file — a visible freeze, and playback restarting.
   */
  _repaintPlayer(colors) {
    const player = this._player;
    if (!player) return;
    try {
      player.options = { ...player.options, ...colors };
      const buttonStyle = player.playBtn?.style;
      if (buttonStyle) {
        buttonStyle.borderColor = colors.buttonColor;
        buttonStyle.color = colors.buttonColor;
      }
      player.drawWaveform?.();
    } catch (_e) {
      // ignore — cosmetic only
    }
  }

  static _toFileUrl(filePath) {
    try {
      return new URL(`file://${filePath}`).toString();
    } catch (_e) {
      return null;
    }
  }

  /** Fallback for a player created before the first theme event arrived. */
  static _readDocumentThemeMode() {
    const isDark = !!globalThis.document?.documentElement?.classList?.contains('dark');
    return isDark ? 'dark' : 'light';
  }
}
