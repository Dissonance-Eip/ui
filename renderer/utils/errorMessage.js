// "Error invoking remote method '<channel>': " (a rejected IPC call), then any "Error: " / "TypeError: ".
const WRAPPER_PREFIX = /^(Error invoking remote method '[^']*':\s*)?(\w*Error:\s*)*/;

/**
 * The reason behind a failure, as text fit to show the user. Main replies
 * with `String(err)` ("Error: Failed to read audio data") and a rejected
 * IPC call wraps it again: both prefixes are dropped, and only the first
 * line is kept so a stack trace never reaches the screen.
 * @param {unknown} error  an error reply's `error` string, or a thrown value
 * @returns {string}
 */
export function userErrorReason(error) {
  const text = String(error?.message ?? error ?? '').split('\n')[0];
  return text.replace(WRAPPER_PREFIX, '').trim() || 'Unknown error';
}
