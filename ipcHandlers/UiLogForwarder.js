/**
 * Pipes renderer-side log lines back to the main-process console so they
 * show up in the terminal you launched the app from. Listens on `ui:log`
 * and prefixes everything with `[UI]`.
 */
const { ipcMain } = require('electron');
const { IpcChannels } = require('./ipcChannels');
const { logger } = require('../main/logger');

class UiLogForwarder {
  /** @param {{ipc?: import('events').EventEmitter}} [opts] ipc defaults to ipcMain; tests pass a double */
  constructor({ ipc = ipcMain } = {}) {
    this.ipc = ipc;
  }

  register() {
    this.ipc.on(IpcChannels.UI_LOG, (_event, payload) => {
      try {
        const level = payload && payload.level ? String(payload.level) : 'log';
        const message = payload && payload.message != null ? String(payload.message) : '';
        logger.at(level, `[UI] ${message}`);
      } catch (e) {
        logger.error('[UI] (log forwarding failed)', e);
      }
    });
  }
}

module.exports = { UiLogForwarder };
