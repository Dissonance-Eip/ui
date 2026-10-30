/**
 * Composition root for all IPC handler registration on the main side.
 *
 * registerFileHandlers() runs ONCE per app (ipcMain.handle throws on a
 * second registration) and serves every window; handlers reply to
 * `event.sender`:
 *   UiLogForwarder      — `ui:log` channel for renderer console forwarding
 *   FileDialogHandlers  — `dialog:openFile`
 *   coreSetup           — `core:*` handlers (process, readMetadata, writeTags, export, cleanup)
 *
 * registerWindowHandlers(win) runs for each new window:
 *   themeHandlers       — `ui:getSystemTheme` + `ui:systemTheme` push to that window
 *   releaseCoreWindow   — drop the window's tag baselines once it is closed
 */
const { UiLogForwarder } = require('./UiLogForwarder');
const { FileDialogHandlers } = require('./FileDialogHandlers');
const { registerThemeHandlers } = require('./themeHandlers');
const { registerCoreHandlers, releaseCoreWindow } = require('./core/coreSetup');

function registerFileHandlers() {
  new UiLogForwarder().register();
  new FileDialogHandlers().register();
  registerCoreHandlers();
}

function registerWindowHandlers(win) {
  registerThemeHandlers(win);
  const webContentsId = win.webContents.id;
  win.on('closed', () => releaseCoreWindow(webContentsId));
}

module.exports = { registerFileHandlers, registerWindowHandlers };
