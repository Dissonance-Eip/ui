/**
 * Drag-and-drop / click-to-browse file picker component shown in UploadView.
 * Resolves a dropped file to an absolute path (services/fileSelection.js)
 * and emits it via setOnFileSelected().
 * Falls back to the native dialog if the dropped file has no resolvable path.
 */
import { BaseComponent } from '../base/BaseComponent.js';
import { hasDroppedFiles, promptForFile, resolveDroppedPath } from '../services/fileSelection.js';

const DRAGOVER_CLASSES = ['border-amber-400', 'bg-amber-50', 'dark:bg-amber-950/30'];

export class DropZone extends BaseComponent {
  constructor({ el, api, logger, getLastFilePath }) {
    super();
    this.el = el;
    this.api = api;
    this.logger = logger;
    this.getLastFilePath = getLastFilePath;
    this.onFileSelected = null;

    this._onClick = this._onClick.bind(this);
    this._onDragEnterOver = this._onDragEnterOver.bind(this);
    this._onDragLeaveDrop = this._onDragLeaveDrop.bind(this);
    this._onDrop = this._onDrop.bind(this);
  }

  mount() {
    super.mount();
    if (!this.el) return;

    this.listen(this.el, 'click', this._onClick);

    ['dragenter', 'dragover'].forEach((evt) => {
      this.listen(this.el, evt, this._onDragEnterOver);
    });

    ['dragleave', 'drop'].forEach((evt) => {
      this.listen(this.el, evt, this._onDragLeaveDrop);
    });

    this.listen(this.el, 'drop', this._onDrop);
  }

  setOnFileSelected(cb) {
    this.onFileSelected = cb;
  }

  async _onClick() {
    const filePath = await promptForFile({
      api: this.api,
      logger: this.logger,
      lastFilePath: this.getLastFilePath?.(),
    });
    if (filePath) this.onFileSelected?.(filePath, 'Selected');
  }

  _onDragEnterOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.el.classList.add(...DRAGOVER_CLASSES);
  }

  _onDragLeaveDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.el.classList.remove(...DRAGOVER_CLASSES);
  }

  /**
   * If the dropped file has no resolvable path (e.g. a synthetic drop
   * without a backing file), fall back to opening the native file picker
   * rather than silently dropping the gesture.
   */
  _onDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!hasDroppedFiles(e.dataTransfer)) {
      this.logger?.log('Drop: no files');
      return;
    }

    const filePath = resolveDroppedPath(e.dataTransfer, this.api);
    if (!filePath) {
      this.logger?.log('Drop: file has no path (falling back to file picker)');
      this._onClick();
      return;
    }

    this.onFileSelected?.(filePath, 'Dropped');
  }
}
