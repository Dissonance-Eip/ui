/**
 * Bridges the OS-level dark/light preference into the renderer.
 * On start(): asks main for the current mode, then subscribes for updates.
 * Toggles the `dark` class on <html> (Tailwind variant) and dispatches a
 * `dissonance:theme` window event so WaveformPreview can repaint its
 * canvas in place with theme-appropriate colours (playback continues).
 */
export class SystemThemeWatcher {
  constructor({ api, rootEl } = {}) {
    this.api = api;
    this.rootEl = rootEl || document.documentElement;
    this._unsubscribe = null;
    this._onTheme = this._onTheme.bind(this);
  }

  /**
   * Apply the OS theme NOW (one-shot fetch) and subscribe for changes.
   * Returns no value but stores the unsubscribe in `_unsubscribe` for stop().
   * Errors from either call are swallowed — theme is non-critical.
   */
  async start() {
    if (!this.api) return;

    try {
      const initial = await this.api.getSystemTheme?.();
      this._onTheme(initial);
    } catch (_e) {
      // ignore
    }

    try {
      const unsub = this.api.onSystemTheme?.(this._onTheme);
      this._unsubscribe = typeof unsub === 'function' ? unsub : null;
    } catch (_e) {
      // ignore
    }
  }

  stop() {
    try {
      this._unsubscribe?.();
    } catch (_e) {
      // ignore
    }
    this._unsubscribe = null;
  }

  _onTheme(data) {
    const mode = data && data.mode ? String(data.mode) : 'light';
    const isDark = mode === 'dark';
    try {
      this.rootEl.classList.toggle('dark', isDark);
    } catch (_e) {
      // ignore
    }

    try {
      window.dispatchEvent(new CustomEvent('dissonance:theme', { detail: { mode } }));
    } catch (_e) {
      // ignore
    }
  }
}
