/**
 * Thin wrapper over a preload-exposed bridge object.
 * Subclasses (e.g. DissonanceApi) add typed-ish methods that delegate to
 * `_call(name, ...args)`, which checks the bridge is present and the
 * named method exists before invoking it.
 */
export class BaseApi {
  constructor(bridge) {
    this.bridge = bridge;
  }

  isAvailable() {
    return !!this.bridge;
  }

  _call(methodName, ...args) {
    if (!this.bridge) {
      throw new Error('API bridge is not available');
    }
    const fn = this.bridge[methodName];
    if (typeof fn !== 'function') {
      throw new Error(`API method not available: ${methodName}`);
    }
    return fn(...args);
  }
}
