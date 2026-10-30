import { Disposable } from './Disposable.js';

/**
 * Base class for views and reusable UI components.
 *
 * Adds mount/unmount lifecycle on top of Disposable, plus listen() — a
 * tracked addEventListener that auto-removes on unmount. There is no
 * separate "BaseView": a view is just a component that owns a screen.
 */
export class BaseComponent extends Disposable {
  mount() {}

  unmount() {
    this.dispose();
  }

  listen(el, eventName, handler, options) {
    if (!el || typeof el.addEventListener !== 'function') return null;
    el.addEventListener(eventName, handler, options);
    this.track(() => {
      try {
        el.removeEventListener(eventName, handler, options);
      } catch (_e) {
        // ignore
      }
    });
    return handler;
  }
}
