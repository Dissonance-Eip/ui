/**
 * Minimal session state for the active file and its processed temp output.
 * setCurrentFilePath() clears processedFilePath as a deliberate side effect
 * — switching the source invalidates any previously processed result.
 * lastImportedFilePath survives a reset to null, so the file dialog can
 * reopen in the same folder for the rest of the session.
 */
export class AppState {
  constructor() {
    this.currentFilePath = null;
    this.processedFilePath = null;
    this.lastImportedFilePath = null;
  }

  /**
   * @param {string|null} filePath
   * Side effect: clears `processedFilePath`. Any previously processed result
   * belongs to the OLD source file and is invalid once the source changes.
   */
  setCurrentFilePath(filePath) {
    this.currentFilePath = filePath;
    this.processedFilePath = null;
    if (filePath) this.lastImportedFilePath = filePath;
  }

  setProcessedFilePath(filePath) {
    this.processedFilePath = filePath;
  }

  hasCurrentFile() {
    return !!this.currentFilePath;
  }

  hasProcessedFile() {
    return !!this.processedFilePath;
  }
}
