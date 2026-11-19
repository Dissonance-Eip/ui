/**
 * First screen — owns a DropZone and re-emits its file-selected event up
 * to the controller via onFileImported(cb), plus an error alert
 * (showError / clearError, same API as AnalyzeView's) for a refused file,
 * and a separate, never-cleared alert for an engine that did not load.
 * Intentionally tiny; all the drag/drop wiring lives in DropZone.
 */
import { DropZone } from '../components/DropZone.js';
import { BaseComponent } from '../base/BaseComponent.js';

export class UploadView extends BaseComponent {
  constructor({ dropZoneEl, api, logger, getLastFilePath, errorEl, engineErrorEl }) {
    super();
    this.dropZone = new DropZone({ el: dropZoneEl, api, logger, getLastFilePath });
    this.errorEl = errorEl;
    this.engineErrorEl = engineErrorEl;
  }

  /** Show `message` in the alert (role="alert"). Pass text already fit for the user. */
  showError(message) {
    if (!this.errorEl) return;
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
  }

  clearError() {
    if (!this.errorEl) return;
    this.errorEl.textContent = '';
    this.errorEl.hidden = true;
  }

  /** Show `message` in the engine alert (role="alert"); it stays for the session. */
  showEngineError(message) {
    if (!this.engineErrorEl) return;
    this.engineErrorEl.textContent = message;
    this.engineErrorEl.hidden = false;
  }

  onFileImported(cb) {
    this.dropZone.setOnFileSelected(cb);
  }

  mount() {
    super.mount();
    this.dropZone.mount();
    this.track(() => this.dropZone.unmount());
  }
}
