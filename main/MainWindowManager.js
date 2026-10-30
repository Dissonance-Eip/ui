/**
 * Creates the application BrowserWindows.
 * Holds the configured preload path, creates a new window on every request
 * (a second launch opens a second window, see main/singleInstance.js), and
 * exposes `getWindows()`: Electron's own list of open windows
 * (`BrowserWindow.getAllWindows()`), the single source for "open windows".
 * contextIsolation is on / nodeIntegration is off (renderer security).
 */
const fs = require('fs');

const MIN_WINDOW_WIDTH = 560;
const MIN_WINDOW_HEIGHT = 680;

class MainWindowManager {
  constructor({ preloadPath, iconPath, BrowserWindowClass = require('electron').BrowserWindow }) {
    this.preloadPath = preloadPath;
    this.iconPath = iconPath;
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
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.once('ready-to-show', () => {
      try {
        win.show();
      } catch (_e) {
        // ignore
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
