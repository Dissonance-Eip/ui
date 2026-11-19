/**
 * The app-wide on-screen message (`#appAlert`, role="alert", above every
 * screen). Shows one line a user must read, such as why a file was refused;
 * screen readers announce it when it appears.
 */
export class AlertMessage {
  /** @param {HTMLElement|null} el */
  constructor(el) {
    this.el = el;
  }

  /** @param {string} message plain text, never HTML */
  show(message) {
    if (!this.el) return;
    this.el.textContent = message;
    this.el.hidden = false;
  }

  clear() {
    if (!this.el) return;
    this.el.textContent = '';
    this.el.hidden = true;
  }
}
