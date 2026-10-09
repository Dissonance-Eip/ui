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
  onAppFlushRequest: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:flushRequest', handler);
    return () => ipcRenderer.removeListener('app:flushRequest', handler);
  },
  notifyFlushDone: () => ipcRenderer.send('app:flushDone'),
  logToMain: (level, message) => ipcRenderer.send('ui:log', { level, message }),
  onCoreStatus: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('core:status', handler);
    return () => ipcRenderer.removeListener('core:status', handler);
  },
  onSystemTheme: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('ui:systemTheme', handler);
    return () => ipcRenderer.removeListener('ui:systemTheme', handler);
  },
});
