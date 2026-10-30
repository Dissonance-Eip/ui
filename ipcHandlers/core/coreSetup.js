/**
 * Singleton wiring for the core addon side of the app.
 * Loads the native addon (or keeps why it couldn't), creates the shared TempFileManager, the per-file
 * lock and the TagWriteCoordinator, and constructs the CoreIpcHandlers
 * instance — all at module-load time.
 * Exposes `registerCoreHandlers()` (once per app, shared by every window),
 * `releaseCoreWindow(id)` for a closed window and `cleanupAllTempFiles()`
 * for the will-quit hook.
 */
const { BrowserWindow, ipcMain } = require('electron');
const { CoreAddonLoader } = require('./CoreAddonLoader');
const { TempFileManager } = require('./TempFileManager');
const { CoreIpcHandlers } = require('./CoreIpcHandlers');
const { FileLock } = require('./FileLock');
const { TagWriteCoordinator } = require('./TagWriteCoordinator');
const { createOtherWindowsNotifier } = require('./OtherWindowsNotifier');

const tempFileManager = new TempFileManager();
const { addon: coreAddon, error: coreLoadError } = new CoreAddonLoader().load();
const fileLock = new FileLock();
const tagWriteCoordinator = new TagWriteCoordinator({
  coreAddon,
  fileLock,
  notifier: createOtherWindowsNotifier({
    ipc: ipcMain,
    listWebContents: () => BrowserWindow.getAllWindows().map((win) => win.webContents),
  }),
});
const coreIpcHandlers = new CoreIpcHandlers({
  coreAddon,
  coreLoadError,
  tempFileManager,
  fileLock,
  tagWriteCoordinator,
});

function registerCoreHandlers() {
  coreIpcHandlers.register();
}

/** Forget what a closed window had read; its webContents id is never reused. */
function releaseCoreWindow(webContentsId) {
  tagWriteCoordinator.forgetSender(webContentsId);
}

async function cleanupAllTempFiles() {
  await tempFileManager.cleanupAll();
}

module.exports = { registerCoreHandlers, releaseCoreWindow, cleanupAllTempFiles };
