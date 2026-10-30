/**
 * Pipes renderer-side log lines back to the main-process console so they
 * show up in the terminal you launched the app from. Listens on `ui:log`
 * and prefixes everything with `[UI]`.
 */
const { ipcMain } = require('electron');
const { IpcChannels } = require('./ipcChannels');

class UiLogForwarder {
  /** @param {import('events').EventEmitter} [ipc] ipcMain, or a test double */
  register(ipc = ipcMain) {
    ipc.on(IpcChannels.UI_LOG, (_event, payload) => {
      try {
        const level = payload && payload.level ? String(payload.level) : 'log';
        const message = payload && payload.message != null ? String(payload.message) : '';
        const fn = typeof console[level] === 'function' ? console[level] : console.log;
        fn(`[UI] ${message}`);
      } catch (e) {
        console.log('[UI] (log forwarding failed)', e);
      }
    });
  }
}

module.exports = { UiLogForwarder };
