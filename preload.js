const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded (ui/preload.js)');

contextBridge.exposeInMainWorld('dissonance', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  getFileStats: (filePath) => ipcRenderer.invoke('file:getStats', filePath),
  processFile: (filePath) => ipcRenderer.invoke('core:process', filePath),
  exportFile: (processedPath) => ipcRenderer.invoke('core:export', processedPath),
  onCoreStatus: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('core:status', handler);
    return () => ipcRenderer.removeListener('core:status', handler);
  }
});

