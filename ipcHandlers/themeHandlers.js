/**
 * Theme IPC, registered ONCE per app and shared by every window:
 *   - `ui:getSystemTheme` answers the current OS light/dark mode (each new
 *     window asks on start, via SystemThemeWatcher);
 *   - one nativeTheme listener plus, on Linux, one gsettings watcher push
 *     changes over `ui:systemTheme` to every open window.
 * The renderer's SystemThemeWatcher toggles the `dark` Tailwind class on
 * <html> based on these signals.
 *
 * The mode comes from theme/systemThemeMode.js: nativeTheme on macOS and
 * Windows, the desktop's gsettings on Linux (Cinnamon/GNOME), where those
 * settings are also watched because nativeTheme doesn't track them reliably.
 * The watcher and listener are released on app `will-quit`.
 */
const electron = require('electron');
const childProcess = require('child_process');

const { getSystemThemeMode, LINUX_PLATFORM } = require('./theme/systemThemeMode');
const { watchLinuxThemeSettings } = require('./theme/linuxDesktopTheme');
const { createThemeForwarder } = require('./theme/themeForwarder');
const { IpcChannels } = require('./ipcChannels');

const GET_SYSTEM_THEME_CHANNEL = IpcChannels.UI_GET_SYSTEM_THEME;
const NATIVE_THEME_UPDATED_EVENT = 'updated';

function electronDeps() {
  return {
    ipc: electron.ipcMain,
    nativeTheme: electron.nativeTheme,
    app: electron.app,
    getWindows: () => electron.BrowserWindow.getAllWindows(),
    platform: process.platform,
    env: process.env,
    execFile: childProcess.execFile,
    spawn: childProcess.spawn,
  };
}

function startLinuxWatcher({ platform, env, spawn }, onChange) {
  if (platform !== LINUX_PLATFORM) return () => {};
  return watchLinuxThemeSettings({ env, spawn, onChange });
}

/**
 * Call once per app (ipcMain.handle throws on a second registration).
 * @param {object} [overrides] Electron/child_process doubles for tests.
 */
function registerThemeHandlers(overrides = {}) {
  const deps = { ...electronDeps(), ...overrides };
  const { ipc, nativeTheme, app, getWindows, platform, env, execFile } = deps;
  const resolveMode = () => getSystemThemeMode({ platform, env, execFile, nativeTheme });

  ipc.handle(GET_SYSTEM_THEME_CHANNEL, async () => ({ mode: await resolveMode() }));

  const forwardTheme = createThemeForwarder({ getWindows, resolveMode });
  nativeTheme.on(NATIVE_THEME_UPDATED_EVENT, forwardTheme);
  const stopLinuxWatcher = startLinuxWatcher(deps, forwardTheme);

  app.once('will-quit', () => {
    nativeTheme.removeListener(NATIVE_THEME_UPDATED_EVENT, forwardTheme);
    stopLinuxWatcher();
  });
}

module.exports = { registerThemeHandlers };
