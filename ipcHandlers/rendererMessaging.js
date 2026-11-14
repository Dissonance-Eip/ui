/**
 * Main → renderer messaging shared by every window.
 *
 *   senderOf()           – the webContents (and its id) behind an IPC event
 *   sendToRenderer()     – fire-and-forget push that tolerates closed windows
 *   requestRendererAck() – push a request and wait until THAT window answers
 *                          with the same requestId (or a timeout passes)
 *
 * Answers are matched on both the sending webContents and a per-request id,
 * so with several windows open one window's answer can never complete a
 * request that was sent to another. The preload side echoes `requestId`.
 */
const { randomUUID } = require('crypto');
const { logger } = require('../main/logger');

function isLive(webContents) {
  return !!webContents && !(webContents.isDestroyed && webContents.isDestroyed());
}

/**
 * @param {{sender?: object}|undefined} event  an ipcMain event
 * @returns {{sender: object|null, senderId: number|null}}
 */
function senderOf(event) {
  const sender = (event && event.sender) || null;
  return { sender, senderId: sender ? sender.id : null };
}

/** @returns {boolean} true if the message was handed to the renderer */
function sendToRenderer(webContents, channel, payload) {
  if (!isLive(webContents)) return false;
  try {
    webContents.send(channel, payload);
    return true;
  } catch (e) {
    logger.error('Failed to send', channel, e);
    return false;
  }
}

/**
 * @param {object} opts
 * @param {import('events').EventEmitter} opts.ipc  ipcMain (or a test double)
 * @param {object} opts.webContents                  the window to ask
 * @param {string} opts.requestChannel
 * @param {string} opts.doneChannel
 * @param {object} [opts.payload]
 * @param {number} opts.timeoutMs
 * @returns {Promise<boolean>} true when answered, false on timeout or a gone window.
 *          Never rejects, so callers (quit, close, tag writes) can't hang on it.
 */
function requestRendererAck({ ipc, webContents, requestChannel, doneChannel, payload, timeoutMs }) {
  return new Promise((resolve) => {
    const requestId = randomUUID();
    let timer = null;

    const onDone = (event, reply) => {
      if (event?.sender !== webContents || reply?.requestId !== requestId) return;
      settle(true);
    };
    const settle = (answered) => {
      clearTimeout(timer);
      ipc.removeListener(doneChannel, onDone);
      resolve(answered);
    };

    ipc.on(doneChannel, onDone);
    timer = setTimeout(() => settle(false), timeoutMs);
    if (!sendToRenderer(webContents, requestChannel, { ...payload, requestId })) settle(false);
  });
}

module.exports = { senderOf, sendToRenderer, requestRendererAck };
