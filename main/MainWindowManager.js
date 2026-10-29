/**
 * Creates and tracks the application BrowserWindows.
 * Holds the configured preload path, creates a new window on every request
 * (a second launch opens a second window, see main/singleInstance.js), and
 * exposes `getWindows()` so other modules don't have to track lifecycle.
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
    this._windows = [];
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

    this._windows = [...this._windows, win];

    win.once('ready-to-show', () => {
      try {
        win.show();
      } catch (_e) {
        // ignore
      }
    });

    win.on('closed', () => {
      this._windows = this._windows.filter((w) => w !== win);
    });

    return win;
  }

  /** Open windows, oldest first. Returns a copy. */
  getWindows() {
    return [...this._windows];
  }
}

module.exports = { MainWindowManager };
