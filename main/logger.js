/**
 * Main-process logger: the one place main and ipcHandlers code writes to
 * the terminal (ESLint's no-console allows console only here and in the
 * renderer's TerminalLogger). Looks console up on every call, so tests can
 * spy on console as before.
 *
 * Every warn and error line starts with whether the error was handled:
 *   [handled]   — warn() / error(): code caught it and carried on
 *   [unhandled] — unhandled(): nothing caught it (see logUnhandledErrors)
 */
const LEVELS = Object.freeze(['log', 'warn', 'error', 'unhandled']);
// Node sets this exit code for an unhandled rejection in Electron's mode.
const UNHANDLED_REJECTION_EXIT_CODE = 1;

const logger = Object.freeze({
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn('[handled]', ...args),
  error: (...args) => console.error('[handled]', ...args),
  unhandled: (...args) => console.error('[unhandled]', ...args),
  /** Logs at `level`, falling back to `log` for an unknown level. */
  at: (level, ...args) => (LEVELS.includes(level) ? logger[level] : logger.log)(...args),
});

/**
 * An error's stack (its message and frames) as text. Never its other fields,
 * which may carry file data, and never throws, whatever was thrown.
 */
function describeError(error) {
  try {
    return error?.stack || String(error);
  } catch {
    return '(unprintable)';
  }
}

/**
 * Logs main's uncaught exceptions and unhandled rejections as [unhandled]
 * without changing what happens next. Call once per process, never per
 * window (main.js does).
 */
function logUnhandledErrors(proc = process) {
  // The monitor only watches: an uncaughtException listener would turn off
  // Electron's own handler (error dialog, app keeps running).
  proc.on('uncaughtExceptionMonitor', (error) =>
    logger.unhandled('Uncaught exception:', describeError(error))
  );
  proc.on('unhandledRejection', (reason) => {
    logger.unhandled('Unhandled rejection:', describeError(reason));
    // Listening stops Node's warn-with-error-code mode, which Electron uses
    // in main, from setting the exit code itself.
    proc.exitCode = UNHANDLED_REJECTION_EXIT_CODE;
  });
}

module.exports = { LEVELS, logger, logUnhandledErrors };
