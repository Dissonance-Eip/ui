/**
 * Main-process logger: the one place main and ipcHandlers code writes to
 * the terminal (ESLint's no-console allows console only here and in the
 * renderer's TerminalLogger). Looks console up on every call, so tests can
 * spy on console as before.
 */
const LEVELS = Object.freeze(['log', 'warn', 'error']);

const logger = Object.freeze({
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  /** Logs at `level`, falling back to `log` for an unknown level. */
  at: (level, ...args) => (LEVELS.includes(level) ? logger[level] : logger.log)(...args),
});

module.exports = { logger };
