/**
 * Tiny renderer-side path helpers. The renderer can't `require('path')`,
 * so this stand-in handles the one bit we actually need — extracting the
 * final path segment from absolute paths on either Unix or Windows.
 */
export function basename(filePath) {
  if (!filePath) return null;
  return String(filePath).split(/[/\\]/).pop() || null;
}
