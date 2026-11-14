import { Logger } from '../base/Logger.js';

/**
 * Logger that forwards every line over the preload bridge (`ui:log` IPC)
 * so messages show up in the main-process terminal. Falls back to
 * console.* if the bridge is missing (e.g. running outside Electron).
 * setStatus() prefixes messages with STATUS / STATUS(ERROR), the latter at
 * error level. Main marks error lines [handled] and unhandled() lines
 * [unhandled].
 */
export class TerminalLogger extends Logger {
  constructor(bridge) {
    super();
    this.bridge = bridge;
  }

  _send(level, message) {
    try {
      if (this.bridge && typeof this.bridge.logToMain === 'function') {
        this.bridge.logToMain(level, String(message));
        return;
      }
    } catch (e) {
      console.error('logToMain failed, logging here instead', e);
    }

    // `unhandled` is not a console method: it prints as an error.
    const fn = console && typeof console[level] === 'function' ? console[level] : console.error;
    fn(String(message));
  }

  log(message) {
    this._send('log', message);
  }

  error(message) {
    this._send('error', message);
  }

  unhandled(message) {
    this._send('unhandled', message);
  }

  setStatus(message, isError = false) {
    const prefix = isError ? 'STATUS(ERROR)' : 'STATUS';
    this._send(isError ? 'error' : 'log', `${prefix}: ${message}`);
  }
}
