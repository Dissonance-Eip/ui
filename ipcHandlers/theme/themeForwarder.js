/**
 * Pushes the OS theme to every open window over `ui:systemTheme`.
 *
 * Several signals can fire for one theme switch (nativeTheme 'updated' plus
 * one or more gsettings monitors on Linux), so only actual mode changes are
 * sent. `getWindows` and `resolveMode` are injected to keep this free of the
 * `electron` import; delivery goes through the shared sendToRenderer().
 */
const { sendToRenderer } = require('../rendererMessaging');

const SYSTEM_THEME_CHANNEL = 'ui:systemTheme';

/**
 * @param {{ getWindows: () => object[], resolveMode: () => Promise<string> }} deps
 * @returns {() => Promise<void>} call on every OS theme signal; never rejects.
 */
function createThemeForwarder({ getWindows, resolveMode }) {
  let lastSentMode = null;
  return async () => {
    let mode;
    try {
      mode = await resolveMode();
    } catch (e) {
      console.error('Failed to resolve the system theme', e);
      return;
    }
    if (mode === lastSentMode) return;
    lastSentMode = mode;
    getWindows().forEach((win) => sendToRenderer(win.webContents, SYSTEM_THEME_CHANNEL, { mode }));
  };
}

module.exports = { createThemeForwarder, SYSTEM_THEME_CHANNEL };
