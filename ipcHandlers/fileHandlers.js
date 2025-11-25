const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

function registerFileHandlers(mainWindow) {
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] },
      ],
    });
    if (canceled || !filePaths || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('file:getStats', async (_event, filePath) => {
    try {
      const stats = await fs.stat(filePath);
      return { name: path.basename(filePath), size: stats.size, mtimeMs: stats.mtimeMs };
    } catch (err) {
      console.error('Failed to get file stats:', err);
      return null;
    }
  });

  // Delegate core processing/export handlers to a single module so it's easy to swap in the
  // real native addon later. The module handles loading the addon and falling back to simulation.
  try {
    const { registerCoreHandlers } = require('./dissonanceCore');
    registerCoreHandlers(mainWindow);
  } catch (err) {
    console.error('Failed to register core handlers:', err);
  }
}

module.exports = { registerFileHandlers };
