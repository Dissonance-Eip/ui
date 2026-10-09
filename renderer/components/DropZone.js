/**
 * Drag-and-drop / click-to-browse file picker component shown in UploadView.
 * Resolves a dropped file to an absolute path via webUtils.getPathForFile()
 * (exposed through the preload bridge) and emits it via setOnFileSelected().
 * Falls back to the native dialog if the dropped file has no resolvable path.
 */
import { BaseComponent } from '../base/BaseComponent.js';

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
    try {
      this.logger?.setStatus('Opening file dialog...');
      const filePath = await this.api.openFile(this.getLastFilePath?.());
      if (!filePath) {
        this.logger?.log('No file selected');
        this.logger?.setStatus('Import canceled');
        return;
      }
      this.onFileSelected?.(filePath, 'Selected');
    } catch (err) {
      this.logger?.error(`Import failed: ${err}`);
    }
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
   * Browsers don't expose the absolute path of a dropped file directly —
   * Electron's `webUtils.getPathForFile` (proxied through the preload
   * bridge) is the only way. If that fails (e.g. on a non-Electron build,
   * or for a synthetic drop without a backing file), fall back to opening
   * the native file picker rather than silently dropping the gesture.
   */
  _onDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) {
      this.logger?.log('Drop: no files');
      return;
    }

    const file = dt.files[0];
    const filePath = this.api?.getPathForFile ? this.api.getPathForFile(file) : file.path || null;
    if (!filePath) {
      this.logger?.log('Drop: file has no path (falling back to file picker)');
      this._onClick();
      return;
    }

    this.onFileSelected?.(filePath, 'Dropped');
  }
}
