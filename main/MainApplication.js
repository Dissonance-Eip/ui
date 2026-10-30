/**
 * Top-level Electron lifecycle controller.
 *
 * Owns:
 *   - The MainWindowManager and the single-instance routing: launching the
 *     app again opens another window in THIS process (main/singleInstance.js)
 *     so every window shares one main process and its coordination.
 *   - The quit/close flush dance: before a window is destroyed (X button)
 *     or the app exits (Cmd+Q), each renderer is asked to drain its
 *     tag-write queue (main/windowFlush.js), with a 3s safety timeout per
 *     window so an unresponsive renderer can never hang quit.
 *   - Final temp-file cleanup on `will-quit` (exactly once per session).
 *
 * Electron and the IPC wiring are injectable so tests can pass doubles; the
 * defaults are the real modules.
 */
const electron = require('electron');
const path = require('path');
const fs = require('fs');

const { MainWindowManager } = require('./MainWindowManager');
const { routeLaunchesToFirstInstance } = require('./singleInstance');
const { flushWindow, flushWindows, attachCloseFlush } = require('./windowFlush');
const fileHandlers = require('../ipcHandlers/fileHandlers');
const coreSetup = require('../ipcHandlers/core/coreSetup');

class MainApplication {
  /**
   * @param {object} [opts]
   * @param {string} [opts.uiRoot]
   * @param {object} [opts.app]                 defaults to Electron's app
   * @param {object} [opts.ipc]                 defaults to Electron's ipcMain
   * @param {Function} [opts.BrowserWindowClass] defaults to Electron's BrowserWindow
   * @param {string} [opts.platform]
   * @param {Function} [opts.registerFileHandlers]
   * @param {Function} [opts.registerWindowHandlers]
   * @param {Function} [opts.cleanupAllTempFiles]
   */
  constructor({
    uiRoot = path.join(__dirname, '..'),
    app = electron.app,
    ipc = electron.ipcMain,
    BrowserWindowClass,
    platform = process.platform,
    registerFileHandlers = fileHandlers.registerFileHandlers,
    registerWindowHandlers = fileHandlers.registerWindowHandlers,
    cleanupAllTempFiles = coreSetup.cleanupAllTempFiles,
  } = {}) {
    this.app = app;
    this.ipc = ipc;
    this.platform = platform;
    this.deps = { registerFileHandlers, registerWindowHandlers, cleanupAllTempFiles };
    this.uiRoot = uiRoot;
    this.iconPath = path.join(this.uiRoot, 'resources', 'icon.png');
    this.indexPath = path.join(this.uiRoot, 'index.html');
    this.windowManager = new MainWindowManager({
      preloadPath: path.join(this.uiRoot, 'preload.js'),
      iconPath: this.iconPath,
      indexPath: this.indexPath,
      // Unpacked (`npm start`) = development; packaged builds are not.
      isDevelopment: !app.isPackaged,
      BrowserWindowClass,
    });

    // Lifecycle flag: before-quit already flushed every window.
    this._readyToQuit = false;
  }

  run() {
    const { app } = this;
    // Dev-mode (unpacked) name — packaged builds get their name from the
    // electron-builder `productName` config instead. Must be set before
    // whenReady() for the Dock/menu bar to pick it up.
    app.setName('Dissonance');

    const isPrimary = routeLaunchesToFirstInstance({
      app,
      openWindow: () => app.whenReady().then(() => this._createAndInitWindow()),
    });
    if (!isPrimary) return;

    app.whenReady().then(() => {
      this.deps.registerFileHandlers();
      this._createAndInitWindow();
      this._applyDockIcon();

      app.on('activate', () => {
        if (this.windowManager.getWindows().length === 0) {
          this._createAndInitWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      // On macOS we'd typically keep the app alive after closing the last
      // window, but for the beta we quit on all platforms.
      app.quit();
    });

    app.on('before-quit', (event) => {
      if (this._readyToQuit) return;

      const openWindows = this.windowManager.getWindows();
      if (openWindows.length === 0) {
        // No window to flush through (all closed via X already, in which
        // case each close-handler did its flush). Just exit.
        this._readyToQuit = true;
        app.quit();
        return;
      }

      event.preventDefault();
      flushWindows(this.ipc, openWindows).then(() => {
        this._readyToQuit = true;
        app.quit();
      });
    });

    // Final cleanup runs exactly once, just before the app actually exits.
    app.on('will-quit', () => this._cleanup());
  }

  /**
   * Dev-mode (unpacked) Dock icon on macOS — BrowserWindow's `icon` option
   * is a Windows/Linux thing and is ignored for the app icon on macOS, so
   * this is the only way to override it there before packaging exists.
   * A no-op until resources/icon.png is actually added.
   */
  _applyDockIcon() {
    const { app } = this;
    if (this.platform !== 'darwin' || !app.dock) return;
    if (!fs.existsSync(this.iconPath)) return;
    try {
      app.dock.setIcon(this.iconPath);
    } catch (_e) {
      // ignore — cosmetic only
    }
  }

  _createAndInitWindow() {
    const win = this.windowManager.createWindow({});

    // Flush this window's pending tag writes BEFORE it is destroyed
    // (otherwise edits are lost on Win/Linux, where clicking the X is the
    // most common quit path). Each window tracks its own flush.
    attachCloseFlush({
      win,
      flush: (target) => flushWindow(this.ipc, target),
      isQuitting: () => this._readyToQuit,
    });

    win.loadFile(this.indexPath).catch((e) => {
      console.error('Failed to load index.html:', e);
    });
    this.deps.registerWindowHandlers(win);

    return win;
  }

  _cleanup() {
    Promise.resolve(this.deps.cleanupAllTempFiles()).catch(() => {});
  }
}

module.exports = { MainApplication };
