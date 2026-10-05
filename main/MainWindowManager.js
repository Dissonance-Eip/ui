/**
 * Wraps the single application BrowserWindow.
 * Holds the configured preload path, creates the window on first request,
 * and exposes `getWindow()` so other modules don't have to track lifecycle.
 * contextIsolation is on / nodeIntegration is off (renderer security).
 */
const { BrowserWindow } = require('electron');
const fs = require('fs');

const MIN_WINDOW_WIDTH = 560;
const MIN_WINDOW_HEIGHT = 680;

class MainWindowManager {
  constructor({ preloadPath, iconPath }) {
    this.preloadPath = preloadPath;
    this.iconPath = iconPath;
    this._window = null;
  }

  createWindow({ width = 800, height = 700 } = {}) {
    if (this._window) return this._window;

    // Only Windows/Linux respect this for the app icon — macOS uses the
    // Dock icon set separately (see MainApplication#_applyDockIcon). Guard
    // on existence so a missing resources/icon.png doesn't error out.
    const hasIcon = this.iconPath && fs.existsSync(this.iconPath);

    this._window = new BrowserWindow({
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

    this._window.once('ready-to-show', () => {
      try {
        this._window.show();
      } catch (_e) {
        // ignore
      }
    });

    this._window.on('closed', () => {
      this._window = null;
    });

    return this._window;
  }

  getWindow() {
    return this._window;
  }
}

module.exports = { MainWindowManager };
