import { TerminalLogger } from './TerminalLogger.js';

/**
 * Bridges the OS-level dark/light preference into the renderer.
 * On start(): asks main for the current mode, then subscribes for updates.
 * Toggles the `dark` class on <html> (Tailwind variant) and dispatches a
 * `dissonance:theme` window event so WaveformPreview can repaint its
 * canvas in place with theme-appropriate colours (playback continues).
 */
export class SystemThemeWatcher {
  constructor({ api, rootEl, logger = new TerminalLogger() } = {}) {
    this.api = api;
    this.logger = logger;
    this.rootEl = rootEl || document.documentElement;
    this._unsubscribe = null;
    this._onTheme = this._onTheme.bind(this);
  }

  /**
   * Apply the OS theme NOW (one-shot fetch) and subscribe for changes.
   * Returns no value but stores the unsubscribe in `_unsubscribe` for stop().
   * Errors from either call are logged, not thrown — theme is non-critical.
   */
  async start() {
    if (!this.api) return;

    try {
      const initial = await this.api.getSystemTheme?.();
      this._onTheme(initial);
    } catch (e) {
      this.logger.error(`Could not read the system theme: ${e}`);
    }

    try {
      const unsub = this.api.onSystemTheme?.(this._onTheme);
      this._unsubscribe = typeof unsub === 'function' ? unsub : null;
    } catch (e) {
      this.logger.error(`Could not subscribe to system theme changes: ${e}`);
    }
  }

  stop() {
    try {
      this._unsubscribe?.();
    } catch (e) {
      this.logger.error(`Could not unsubscribe from system theme changes: ${e}`);
    }
    this._unsubscribe = null;
  }

  _onTheme(data) {
    const mode = data && data.mode ? String(data.mode) : 'light';
    const isDark = mode === 'dark';
    try {
      this.rootEl.classList.toggle('dark', isDark);
    } catch (e) {
      this.logger.error(`Could not apply the ${mode} theme: ${e}`);
    }

    try {
      window.dispatchEvent(new CustomEvent('dissonance:theme', { detail: { mode } }));
    } catch (e) {
      this.logger.error(`Could not announce the ${mode} theme: ${e}`);
    }
  }
}
