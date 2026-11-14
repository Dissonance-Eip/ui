/**
 * Tells the OTHER windows when one window rewrites a file's tags.
 *
 *   beforeWrite – ask each other window to pause any player on that file and
 *                 wait for its answer (bounded by pauseTimeoutMs). The core
 *                 truncates and rewrites the WAV, which breaks an <audio>
 *                 element that is streaming it.
 *   afterWrite  – push the file path so those windows re-read the tags and
 *                 reload their player (the audio data may have moved).
 *
 * Each renderer decides whether the file is the one it shows. Electron-free:
 * ipcMain and the window list are injected.
 */
const { sendToRenderer, requestRendererAck } = require('../rendererMessaging');
const { IpcChannels } = require('../ipcChannels');

const PAUSE_FILE_REQUEST_CHANNEL = IpcChannels.PLAYER_PAUSE_FILE_REQUEST;
const PAUSE_FILE_DONE_CHANNEL = IpcChannels.PLAYER_PAUSE_FILE_DONE;
const TAGS_WRITTEN_ELSEWHERE_CHANNEL = IpcChannels.TAGS_WRITTEN_ELSEWHERE;
const PAUSE_TIMEOUT_MS = 1000;

/**
 * @param {object} opts
 * @param {import('events').EventEmitter} opts.ipc
 * @param {() => object[]} opts.listWebContents  every window's webContents
 * @param {number} [opts.pauseTimeoutMs]
 */
function createOtherWindowsNotifier({ ipc, listWebContents, pauseTimeoutMs = PAUSE_TIMEOUT_MS }) {
  const others = (senderId) => listWebContents().filter((wc) => wc && wc.id !== senderId);

  return Object.freeze({
    async beforeWrite(senderId, filePath) {
      const requests = others(senderId).map((webContents) =>
        requestRendererAck({
          ipc,
          webContents,
          requestChannel: PAUSE_FILE_REQUEST_CHANNEL,
          doneChannel: PAUSE_FILE_DONE_CHANNEL,
          payload: { filePath },
          timeoutMs: pauseTimeoutMs,
        })
      );
      await Promise.all(requests);
    },

    afterWrite(senderId, filePath) {
      others(senderId).forEach((webContents) =>
        sendToRenderer(webContents, TAGS_WRITTEN_ELSEWHERE_CHANNEL, { filePath })
      );
    },
  });
}

module.exports = {
  PAUSE_FILE_REQUEST_CHANNEL,
  PAUSE_FILE_DONE_CHANNEL,
  TAGS_WRITTEN_ELSEWHERE_CHANNEL,
  createOtherWindowsNotifier,
};
