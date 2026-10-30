/**
 * The two ways a user picks a source file — the native open dialog and a
 * drag-and-drop — shared by the upload DropZone and the controller's
 * "change file" / drop-anywhere handlers. Every import goes through one of
 * these, so a file-type check belongs here (see ui#82).
 */

/**
 * Show the native open dialog and report progress through `logger`.
 * @param {{ api: { openFile: Function }, logger?: object, lastFilePath?: string|null }} deps
 *   lastFilePath — the dialog opens in that file's folder.
 * @returns {Promise<string|null>} the picked path, or null when cancelled or failed (logged)
 */
export async function promptForFile({ api, logger, lastFilePath }) {
  try {
    logger?.setStatus?.('Opening file dialog...');
    const filePath = await api.openFile(lastFilePath);
    if (!filePath) {
      logger?.log?.('No file selected');
      logger?.setStatus?.('Import canceled');
      return null;
    }
    return filePath;
  } catch (err) {
    logger?.error?.(`Import failed: ${err}`);
    return null;
  }
}

/** @returns {boolean} whether the drag event carries at least one file */
export function hasDroppedFiles(dataTransfer) {
  return !!(dataTransfer && dataTransfer.files && dataTransfer.files.length > 0);
}

/**
 * Absolute path of the first dropped file. Browsers hide it; Electron's
 * `webUtils.getPathForFile`, proxied by the preload bridge, is the only way
 * to get it (`File.path` was removed in Electron 32).
 * @param {DataTransfer|null|undefined} dataTransfer
 * @param {{ getPathForFile: Function }} api
 * @returns {string|null} null when nothing was dropped or the file has no path
 */
export function resolveDroppedPath(dataTransfer, api) {
  if (!hasDroppedFiles(dataTransfer)) return null;
  return api.getPathForFile(dataTransfer.files[0]) || null;
}
