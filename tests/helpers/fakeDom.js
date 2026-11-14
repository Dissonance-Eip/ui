/**
 * Minimal DOM stand-ins for view tests under plain Node: an element that
 * holds text, a value and attributes, and dispatches real events.
 */
export class FakeElement extends EventTarget {
  constructor(attributes = {}) {
    super();
    this.textContent = '';
    this.title = '';
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this._attributes = { ...attributes };
  }

  getAttribute(name) {
    return Object.hasOwn(this._attributes, name) ? this._attributes[name] : null;
  }

  fire(type) {
    this.dispatchEvent(new Event(type));
  }
}
