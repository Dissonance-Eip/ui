/**
 * Singleton wiring for the core addon side of the app.
 * Loads the native addon (or keeps why it couldn't), creates the shared TempFileManager, the per-file
 * lock and the TagWriteCoordinator, and constructs the CoreIpcHandlers
 * instance — all at module-load time.
 * Exposes `registerCoreHandlers()` (once per app, shared by every window),
 * `releaseCoreWindow(id)` for a closed window and `cleanupAllTempFiles()`
 * for the will-quit hook.
 * `createCoreSetup()` builds the same wiring from injected parts; the
 * module-level instance uses the real ones.
 */
const { BrowserWindow, ipcMain } = require('electron');
const { CoreAddonLoader } = require('./CoreAddonLoader');
const { TempFileManager } = require('./TempFileManager');
const { CoreIpcHandlers } = require('./CoreIpcHandlers');
const { FileLock } = require('./FileLock');
const { TagWriteCoordinator } = require('./TagWriteCoordinator');
const { createOtherWindowsNotifier } = require('./OtherWindowsNotifier');

/**
 * @param {object} [deps] injectable for tests; defaults are the real ones
 * @param {object} [deps.ipc]                  defaults to Electron's ipcMain
 * @param {() => object[]} [deps.getWindows]   every open BrowserWindow
 * @param {object} [deps.dialog]               defaults to Electron's dialog
 * @param {TempFileManager} [deps.tempFileManager]
 * @param {{load: Function}} [deps.addonLoader]
 */
function createCoreSetup({
  ipc = ipcMain,
  getWindows = () => BrowserWindow.getAllWindows(),
  dialog,
  tempFileManager = new TempFileManager(),
  addonLoader = new CoreAddonLoader(),
} = {}) {
  const { addon: coreAddon, error: coreLoadError } = addonLoader.load();
  const fileLock = new FileLock();
  const tagWriteCoordinator = new TagWriteCoordinator({
    coreAddon,
    fileLock,
    notifier: createOtherWindowsNotifier({
      ipc,
      listWebContents: () => getWindows().map((win) => win.webContents),
    }),
  });
  const coreIpcHandlers = new CoreIpcHandlers({
    coreAddon,
    coreLoadError,
    tempFileManager,
    fileLock,
    tagWriteCoordinator,
    ipc,
    dialog,
  });

  return {
    registerCoreHandlers() {
      coreIpcHandlers.register();
    },

    /** Forget what a closed window had read; its webContents id is never reused. */
    releaseCoreWindow(webContentsId) {
      tagWriteCoordinator.forgetSender(webContentsId);
    },

    async cleanupAllTempFiles() {
      await tempFileManager.cleanupAll();
    },
  };
}

const { registerCoreHandlers, releaseCoreWindow, cleanupAllTempFiles } = createCoreSetup();

module.exports = { createCoreSetup, registerCoreHandlers, releaseCoreWindow, cleanupAllTempFiles };
