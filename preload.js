/**
 * Preload script — bridges the sandboxed renderer to the main process.
 *
 * Everything the renderer can ask the OS / native code to do goes through
 * `window.dissonance.*` exposed here via contextBridge. Each method maps to
 * an ipcRenderer.invoke (request/response) or ipcRenderer.on (subscription
 * with an unsubscribe function returned).
 *
 * SECURITY: contextIsolation is on; node integration is off. The renderer
 * never sees `require`, `process`, or any Node API directly.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

console.log('Preload script loaded (ui/preload.js)');

/**
 * Subscribe `cb` to a main → renderer request. Once `cb` settles, answer on
 * `doneChannel` with the request's id so main knows THIS window is done
 * (see ipcHandlers/rendererMessaging.js). Returns an unsubscribe function.
 */
function answerRequests(requestChannel, doneChannel, cb) {
  const handler = async (_event, request) => {
    try {
      await cb(request);
    } catch (e) {
      console.error(`${requestChannel} handler failed`, e);
    } finally {
      ipcRenderer.send(doneChannel, { requestId: request && request.requestId });
    }
  };
  ipcRenderer.on(requestChannel, handler);
  return () => ipcRenderer.removeListener(requestChannel, handler);
}

function subscribe(channel, cb) {
  const handler = (_event, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('dissonance', {
  openFile: (lastFilePath) => ipcRenderer.invoke('dialog:openFile', lastFilePath),
  getSystemTheme: () => ipcRenderer.invoke('ui:getSystemTheme'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_e) {
      return null;
    }
  },
  readFileMetadata: (filePath) => ipcRenderer.invoke('core:readMetadata', filePath),
  processFile: (filePath, options) => ipcRenderer.invoke('core:process', { filePath, options }),
  writeTags: (filePath, tags) => ipcRenderer.invoke('core:writeTags', { filePath, tags }),
  exportFile: (processedPath) => ipcRenderer.invoke('core:export', processedPath),
  cleanupProcessedFile: (processedPath) =>
    ipcRenderer.invoke('core:cleanupProcessed', processedPath),
  onAppFlushRequest: (cb) => answerRequests('app:flushRequest', 'app:flushDone', () => cb()),
  onPauseFileRequest: (cb) =>
    answerRequests('player:pauseFileRequest', 'player:pauseFileDone', (request) =>
      cb({ filePath: request && request.filePath })
    ),
  onTagsWrittenElsewhere: (cb) => subscribe('tags:writtenElsewhere', cb),
  logToMain: (level, message) => ipcRenderer.send('ui:log', { level, message }),
  onCoreStatus: (cb) => subscribe('core:status', cb),
  onSystemTheme: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('ui:systemTheme', handler);
    return () => ipcRenderer.removeListener('ui:systemTheme', handler);
  },
});
