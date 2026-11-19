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
    // False once main says the native engine could not be loaded (#148).
    this.engineAvailable = true;
  }

  setEngineUnavailable() {
    this.engineAvailable = false;
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

  /** A file is shown and the engine can process it. */
  canProcess() {
    return this.hasCurrentFile() && this.engineAvailable;
  }

  hasProcessedFile() {
    return !!this.processedFilePath;
  }
}
