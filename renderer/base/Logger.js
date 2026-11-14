/**
 * Documentation-only interface for the renderer Logger contract.
 * Concrete impls (e.g. TerminalLogger) override these. Subclasses can be
 * swapped without touching call sites (controllers, views).
 */
export class Logger {
  log(_message) {}
  /** An error the code caught and dealt with. */
  error(_message) {}
  /** An error nothing caught (window `error` / `unhandledrejection`). */
  unhandled(_message) {}
  setStatus(_message, _isError = false) {}
}
