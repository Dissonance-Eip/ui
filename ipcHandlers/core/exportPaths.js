/**
 * Checks for core:export, which copies a file chosen by the renderer to a
 * path on disk. A compromised renderer must not be able to use it to copy
 * an arbitrary file anywhere, so:
 *
 *   checkExportSource()      – the source must be a temp file the app itself
 *                              created and still tracks, and must be a regular
 *                              file (not a symlink swapped in, not a directory)
 *   checkExportDestination() – the destination comes only from the save
 *                              dialog and must be absolute and outside the
 *                              temp root (where a later cleanup would delete it)
 *
 * Both return `null` when the path is acceptable, or an error message.
 */
const fs = require('fs').promises;
const path = require('path');

const INVALID_SOURCE = 'Not a processed file';
const INVALID_DESTINATION = 'Invalid export destination';

/**
 * @param {import('./TempFileManager').TempFileManager} tempFileManager
 * @param {unknown} processedPath  straight from the renderer
 * @returns {Promise<string|null>}
 */
async function checkExportSource(tempFileManager, processedPath) {
  if (typeof processedPath !== 'string' || !processedPath) return 'No processed file path';
  if (!tempFileManager.isTracked(processedPath)) return INVALID_SOURCE;

  try {
    // lstat doesn't follow symlinks, so a tracked path replaced by a link fails here.
    const stats = await fs.lstat(processedPath);
    return stats.isFile() ? null : INVALID_SOURCE;
  } catch (_err) {
    return INVALID_SOURCE;
  }
}

/**
 * @param {import('./TempFileManager').TempFileManager} tempFileManager
 * @param {unknown} destPath  the save dialog's filePath
 * @returns {string|null}
 */
function checkExportDestination(tempFileManager, destPath) {
  if (typeof destPath !== 'string' || !path.isAbsolute(destPath)) return INVALID_DESTINATION;
  if (tempFileManager.isUnderRoot(destPath)) return INVALID_DESTINATION;
  return null;
}

module.exports = { checkExportSource, checkExportDestination };
