/**
 * First screen — owns a DropZone and re-emits its file-selected event up
 * to the controller via onFileImported(cb). Intentionally tiny; all the
 * drag/drop wiring lives in DropZone.
 */
import { DropZone } from '../components/DropZone.js';
import { BaseComponent } from '../base/BaseComponent.js';

export class UploadView extends BaseComponent {
  constructor({ dropZoneEl, api, logger, getLastFilePath }) {
    super();
    this.dropZone = new DropZone({ el: dropZoneEl, api, logger, getLastFilePath });
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
