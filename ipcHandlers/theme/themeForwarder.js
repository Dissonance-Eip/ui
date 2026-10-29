/**
 * Pushes the OS theme to the renderer over `ui:systemTheme`.
 *
 * Several signals can fire for one theme switch (nativeTheme 'updated' plus
 * one or more gsettings monitors on Linux), so only actual mode changes are
 * sent. `resolveMode` is injected to keep this free of the `electron` import.
 */
const SYSTEM_THEME_CHANNEL = 'ui:systemTheme';

/**
 * @param {{ mainWindow: object | null, resolveMode: () => Promise<string> }} deps
 * @returns {() => Promise<void>} call on every OS theme signal; never throws.
 */
function createThemeForwarder({ mainWindow, resolveMode }) {
  let lastSentMode = null;
  return async () => {
    try {
      const mode = await resolveMode();
      if (mode === lastSentMode) return;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      lastSentMode = mode;
      mainWindow.webContents.send(SYSTEM_THEME_CHANNEL, { mode });
    } catch (_e) {
      // ignore — theme is non-critical
    }
  };
}

module.exports = { createThemeForwarder };
