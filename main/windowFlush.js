/**
 * Per-window "drain your tag-write queue" handshake used on close and quit.
 *
 * Each window is flushed on its own: closing window A never marks window B
 * as flushed, and B's answer can never complete A's request (see
 * requestRendererAck). Every wait is bounded by FLUSH_TIMEOUT_MS so an
 * unresponsive renderer can never hang close or quit.
 */
const { requestRendererAck } = require('../ipcHandlers/rendererMessaging');
const { IpcChannels } = require('../ipcHandlers/ipcChannels');

const FLUSH_REQUEST_CHANNEL = IpcChannels.APP_FLUSH_REQUEST;
const FLUSH_DONE_CHANNEL = IpcChannels.APP_FLUSH_DONE;
const FLUSH_TIMEOUT_MS = 3000;

const CloseFlushState = Object.freeze({ IDLE: 'idle', PENDING: 'pending', DONE: 'done' });

function flushWindow(ipc, win) {
  return requestRendererAck({
    ipc,
    webContents: win.webContents,
    requestChannel: FLUSH_REQUEST_CHANNEL,
    doneChannel: FLUSH_DONE_CHANNEL,
    timeoutMs: FLUSH_TIMEOUT_MS,
  });
}

/** Flush every window that is still open; resolves once all have answered or timed out. */
function flushWindows(ipc, windows) {
  const open = windows.filter((win) => win && !win.isDestroyed());
  return Promise.all(open.map((win) => flushWindow(ipc, win)));
}

/**
 * Hold the window's close until its renderer has drained pending tag writes
 * (otherwise edits are lost on Win/Linux, where the X button is the usual
 * way out). Skipped once the app is quitting: before-quit already flushed.
 *
 * @param {object} opts
 * @param {object} opts.win
 * @param {(win: object) => Promise<unknown>} opts.flush
 * @param {() => boolean} opts.isQuitting
 */
function attachCloseFlush({ win, flush, isQuitting }) {
  let state = CloseFlushState.IDLE;

  win.on('close', (event) => {
    if (isQuitting() || state !== CloseFlushState.IDLE) return;
    event.preventDefault();
    state = CloseFlushState.PENDING;
    flush(win).finally(() => {
      state = CloseFlushState.DONE;
      if (!win.isDestroyed()) win.close();
    });
  });
}

module.exports = {
  FLUSH_REQUEST_CHANNEL,
  FLUSH_DONE_CHANNEL,
  FLUSH_TIMEOUT_MS,
  flushWindow,
  flushWindows,
  attachCloseFlush,
};
