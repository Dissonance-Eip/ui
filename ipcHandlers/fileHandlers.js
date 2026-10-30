/**
 * Composition root for all IPC handler registration on the main side.
 *
 * registerFileHandlers() runs ONCE per app (ipcMain.handle throws on a
 * second registration) and serves every window; handlers reply to
 * `event.sender`:
 *   UiLogForwarder      — `ui:log` channel for renderer console forwarding
 *   FileDialogHandlers  — `dialog:openFile`
 *   themeHandlers       — `ui:getSystemTheme` + `ui:systemTheme` push to every window
 *   coreSetup           — `core:*` handlers (process, readMetadata, writeTags, export, cleanup)
 *
 * registerWindowHandlers(win) runs for each new window:
 *   releaseCoreWindow   — drop the window's tag baselines once it is closed
 *
 * Both take optional doubles for tests; the defaults are the real modules.
 */
const { UiLogForwarder } = require('./UiLogForwarder');
const { FileDialogHandlers } = require('./FileDialogHandlers');
const { registerThemeHandlers } = require('./themeHandlers');
const coreSetup = require('./core/coreSetup');

/**
 * @param {object} [deps]
 * @param {object} [deps.ipc]     defaults to Electron's ipcMain
 * @param {object} [deps.dialog]  defaults to Electron's dialog
 * @param {Function} [deps.registerTheme]
 * @param {Function} [deps.registerCore]
 */
function registerFileHandlers({
  ipc,
  dialog,
  registerTheme = registerThemeHandlers,
  registerCore = coreSetup.registerCoreHandlers,
} = {}) {
  new UiLogForwarder({ ipc }).register();
  new FileDialogHandlers({ ipc, dialog }).register();
  registerTheme();
  registerCore();
}

/** @param {{releaseCoreWindow?: Function}} [deps] */
function registerWindowHandlers(win, { releaseCoreWindow = coreSetup.releaseCoreWindow } = {}) {
  const webContentsId = win.webContents.id;
  win.on('closed', () => releaseCoreWindow(webContentsId));
}

module.exports = { registerFileHandlers, registerWindowHandlers };
