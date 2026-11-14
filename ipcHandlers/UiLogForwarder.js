/**
 * Pipes renderer-side log lines back to the main-process console so they
 * show up in the terminal you launched the app from. Listens on `ui:log`
 * and prefixes everything with `[UI]`; main's logger then marks warn and
 * error lines [handled] and level `unhandled` lines [unhandled].
 *
 * The payload comes from the renderer, so nothing is trusted (like
 * core/corePayloads.js): `{ level, message }` with a known level and a text
 * message, or the line is dropped with a warning.
 */
const { ipcMain } = require('electron');
const { IpcChannels } = require('./ipcChannels');
const { LEVELS, logger } = require('../main/logger');

/** @param {unknown} payload @returns {boolean} */
const isLogPayload = (payload) =>
  LEVELS.includes(payload?.level) && typeof payload?.message === 'string';

class UiLogForwarder {
  /** @param {{ipc?: import('events').EventEmitter}} [opts] ipc defaults to ipcMain; tests pass a double */
  constructor({ ipc = ipcMain } = {}) {
    this.ipc = ipc;
  }

  register() {
    this.ipc.on(IpcChannels.UI_LOG, (_event, payload) => {
      if (!isLogPayload(payload)) {
        logger.warn('[UI] (invalid log payload dropped)');
        return;
      }
      logger.at(payload.level, `[UI] ${payload.message}`);
    });
  }
}

module.exports = { UiLogForwarder };
