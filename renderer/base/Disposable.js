/**
 * Resource-tracking base class.
 *
 * track(fn) registers a teardown callback; dispose() runs them all in LIFO
 * order exactly once. Used by BaseComponent and BaseController to keep
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
      try {
        disposeFn();
      } catch (_e) {
        // ignore
      }
      return disposeFn;
    }
    this._disposables.push(disposeFn);
    return disposeFn;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    // Dispose in LIFO order (mirrors typical resource acquisition order).
    for (let i = this._disposables.length - 1; i >= 0; i -= 1) {
      const fn = this._disposables[i];
      try {
        fn();
      } catch (_e) {
        // ignore
      }
    }

    this._disposables.length = 0;
  }
}
