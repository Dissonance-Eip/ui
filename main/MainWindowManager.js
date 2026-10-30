/**
 * Creates the application BrowserWindows.
 * Holds the configured preload path, creates a new window on every request
 * (a second launch opens a second window, see main/singleInstance.js), and
 * exposes `getWindows()`: Electron's own list of open windows
 * (`BrowserWindow.getAllWindows()`), the single source for "open windows".
 * Every window is hardened the same way (main/windowSecurity.js): isolated,
 * sandboxed renderer, and it can only show the app's own page.
 */
const fs = require('fs');
const { pathToFileURL } = require('url');
const { secureWebPreferences, hardenNavigation } = require('./windowSecurity');
const { logger } = require('./logger');

const MIN_WINDOW_WIDTH = 560;
const MIN_WINDOW_HEIGHT = 680;

class MainWindowManager {
  /**
   * @param {object} opts
   * @param {string} opts.preloadPath
   * @param {string|null} opts.iconPath
   * @param {string} opts.indexPath      the app page; the only page a window may show
   * @param {boolean} [opts.isDevelopment] unpacked build: renderer exposes debug globals
   * @param {(url: string) => unknown} [opts.openExternal] opens a web link in the system browser
   * @param {Function} [opts.BrowserWindowClass]
   */
  constructor({
    preloadPath,
    iconPath,
    indexPath,
    isDevelopment = false,
    openExternal = (url) => require('electron').shell.openExternal(url),
    BrowserWindowClass = require('electron').BrowserWindow,
  }) {
    this.preloadPath = preloadPath;
    this.iconPath = iconPath;
    this.appUrl = pathToFileURL(indexPath).href;
    this.isDevelopment = isDevelopment;
    this._openExternal = openExternal;
    this._BrowserWindow = BrowserWindowClass;
  }

  createWindow({ width = 800, height = 700 } = {}) {
    // Only Windows/Linux respect this for the app icon — macOS uses the
    // Dock icon set separately (see MainApplication#_applyDockIcon). Guard
    // on existence so a missing resources/icon.png doesn't error out.
    const hasIcon = this.iconPath && fs.existsSync(this.iconPath);

    const win = new this._BrowserWindow({
      width,
      height,
      ...(hasIcon ? { icon: this.iconPath } : {}),
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      webPreferences: secureWebPreferences({
        preloadPath: this.preloadPath,
        isDevelopment: this.isDevelopment,
      }),
    });
    hardenNavigation(win, { appUrl: this.appUrl, openExternal: this._openExternal });

    win.once('ready-to-show', () => {
      try {
        win.show();
      } catch (e) {
        logger.error('Could not show the window', e);
      }
    });

    return win;
  }

  /** Open windows, as Electron lists them. Returns a new array on every call. */
  getWindows() {
    return this._BrowserWindow.getAllWindows();
  }
}

module.exports = { MainWindowManager };
