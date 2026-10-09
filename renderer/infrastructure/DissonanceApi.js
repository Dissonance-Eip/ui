import { BaseApi } from '../base/BaseApi.js';

/**
 * Typed-ish facade over the preload bridge (`window.dissonance`).
 * Each method delegates to a bridge function, which in turn maps to an
 * `ipcRenderer.invoke` (request/response) or `ipcRenderer.on` (subscription)
 * channel handled by the main process.
 */
export class DissonanceApi extends BaseApi {
  async openFile(lastFilePath) {
    return this._call('openFile', lastFilePath);
  }

  async getSystemTheme() {
    return this._call('getSystemTheme');
  }

  getPathForFile(file) {
    return this._call('getPathForFile', file);
  }

  async readFileMetadata(filePath) {
    return this._call('readFileMetadata', filePath);
  }

  async cleanupProcessedFile(processedPath) {
    return this._call('cleanupProcessedFile', processedPath);
  }

  async processFile(filePath, options) {
    return this._call('processFile', filePath, options);
  }

  async writeTags(filePath, tags) {
    return this._call('writeTags', filePath, tags);
  }

  async exportFile(processedPath) {
    return this._call('exportFile', processedPath);
  }

  onCoreStatus(cb) {
    return this._call('onCoreStatus', cb);
  }

  onSystemTheme(cb) {
    return this._call('onSystemTheme', cb);
  }
}
