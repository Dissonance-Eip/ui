/**
 * Resource-tracking base class.
 *
 * track(fn) registers a teardown callback; dispose() runs them all in LIFO
 * order exactly once. A teardown that throws doesn't stop the others; once
 * all have run, dispose() throws an AggregateError with every failure. Used by BaseComponent and BaseController to keep
 * event listeners + child disposables tidy when a view/controller unmounts.
 */
export class Disposable {
  constructor() {
    this._disposables = [];
    this._disposed = false;
  }

  track(disposeFn) {
    if (typeof disposeFn !== 'function') return disposeFn;
    if (this._disposed) {
      disposeFn();
      return disposeFn;
    }
    this._disposables.push(disposeFn);
    return disposeFn;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    // Dispose in LIFO order (mirrors typical resource acquisition order).
    const failures = [];
    for (let i = this._disposables.length - 1; i >= 0; i -= 1) {
      try {
        this._disposables[i]();
      } catch (e) {
        failures.push(e);
      }
    }

    this._disposables.length = 0;
    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} teardown callback(s) failed`);
    }
  }
}
