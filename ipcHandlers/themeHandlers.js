/**
 * Theme IPC: exposes the current OS light/dark mode to the renderer and
 * pushes updates over `ui:systemTheme` when the OS preference changes.
 * The renderer's SystemThemeWatcher toggles the `dark` Tailwind class on
 * <html> based on these signals.
 *
 * The mode comes from theme/systemThemeMode.js: nativeTheme on macOS and
 * Windows, the desktop's gsettings on Linux (Cinnamon/GNOME), where those
 * settings are also watched because nativeTheme doesn't track them reliably.
 */
const { ipcMain, nativeTheme } = require('electron');
const { execFile, spawn } = require('child_process');

const { getSystemThemeMode, LINUX_PLATFORM } = require('./theme/systemThemeMode');
const { watchLinuxThemeSettings } = require('./theme/linuxDesktopTheme');
const { createThemeForwarder } = require('./theme/themeForwarder');

function currentThemeMode() {
  return getSystemThemeMode({
    platform: process.platform,
    env: process.env,
    execFile,
    nativeTheme,
  });
}

function startLinuxWatcher(onChange) {
  if (process.platform !== LINUX_PLATFORM) return () => {};
  return watchLinuxThemeSettings({ env: process.env, spawn, onChange });
}

function registerThemeHandlers(mainWindow) {
  try {
    ipcMain.removeHandler('ui:getSystemTheme');
  } catch (_e) {
    // ignore
  }

  ipcMain.handle('ui:getSystemTheme', async () => {
    return { mode: await currentThemeMode() };
  });

  const forwardTheme = createThemeForwarder({ mainWindow, resolveMode: currentThemeMode });
  nativeTheme.on('updated', forwardTheme);
  const stopLinuxWatcher = startLinuxWatcher(forwardTheme);

  if (mainWindow && typeof mainWindow.on === 'function') {
    mainWindow.on('closed', () => {
      try {
        nativeTheme.removeListener('updated', forwardTheme);
        stopLinuxWatcher();
      } catch (_e) {
        // ignore
      }
    });
  }
}

module.exports = { registerThemeHandlers };
