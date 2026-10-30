import { Logger } from '../base/Logger.js';

/**
 * Logger that forwards every line over the preload bridge (`ui:log` IPC)
 * so messages show up in the main-process terminal. Falls back to
 * console.* if the bridge is missing (e.g. running outside Electron).
 * setStatus() prefixes messages with STATUS / STATUS(ERROR).
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

    const fn = console && typeof console[level] === 'function' ? console[level] : console.log;
    fn(String(message));
  }

  log(message) {
    this._send('log', message);
  }

  error(message) {
    this._send('error', message);
  }

  setStatus(message, isError = false) {
    const prefix = isError ? 'STATUS(ERROR)' : 'STATUS';
    this._send('log', `${prefix}: ${message}`);
  }
}
