const POSIX_SEPARATOR = '/';
const WINDOWS_SEPARATORS = /[\\/]/;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH = /^\\\\[^\\/]/;
const UNC_PREFIX_LENGTH = 2; // the leading `\\`

/**
 * Turn an absolute local path into a `file://` URL the renderer can load.
 *
 * The renderer can't use Node's `url.pathToFileURL`, and building the URL by
 * string concatenation (`'file://' + path`) breaks on names containing `#`,
 * `?` or `%`: they are read as fragment, query or escape (ui#113). Instead,
 * every path segment is percent-encoded on its own.
 *
 * Accepts POSIX paths (`/a/b`), Windows drive paths (`C:\a\b`) and Windows
 * UNC paths (`\\server\share\a`). On POSIX a backslash is a legal filename
 * character, so it is encoded rather than treated as a separator.
 *
 * @param {string | null | undefined} filePath
 * @returns {string | null} the file URL, or null when the path is not absolute
 */
export function toFileUrl(filePath) {
  if (!filePath) return null;
  const path = String(filePath);

  if (WINDOWS_DRIVE_PATH.test(path)) {
    const [drive, ...segments] = path.split(WINDOWS_SEPARATORS);
    return `file:///${drive}/${encodeSegments(segments)}`;
  }
  if (WINDOWS_UNC_PATH.test(path)) {
    const [host, ...segments] = path.slice(UNC_PREFIX_LENGTH).split(WINDOWS_SEPARATORS);
    return `file://${host}/${encodeSegments(segments)}`;
  }
  if (path.startsWith(POSIX_SEPARATOR)) {
    return `file://${encodeSegments(path.split(POSIX_SEPARATOR))}`;
  }
  return null;
}

function encodeSegments(segments) {
  return segments.map(encodeURIComponent).join('/');
}
