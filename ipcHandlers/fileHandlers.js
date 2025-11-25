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

  ipcMain.handle('core:process', async (_event, filePath) => {
    console.log('core:process called with:', filePath);
    if (!mainWindow) return { ok: false, error: 'No main window' };
    try {
      mainWindow.webContents.send('core:status', { status: 'imported', message: 'File imported to UI' });

      mainWindow.webContents.send('core:status', { status: 'sending', message: 'Sending to dissonance-core (simulated)...' });
      await new Promise((r) => setTimeout(r, 500));

      mainWindow.webContents.send('core:status', { status: 'processing', message: 'Processing started' });
      for (let p = 10; p <= 100; p += 30) {
        await new Promise((r) => setTimeout(r, 500));
        mainWindow.webContents.send('core:status', { status: 'processing', message: `Processing: ${p}%` });
      }

      const ext = path.extname(filePath) || '.wav';
      const base = path.basename(filePath, ext);
      const tmpDir = path.join(os.tmpdir(), 'dissonance');
      await fs.mkdir(tmpDir, { recursive: true });
      const processedPath = path.join(tmpDir, `${base}-processed${ext}`);
      await fs.copyFile(filePath, processedPath);

      mainWindow.webContents.send('core:status', { status: 'processed', message: 'Processing complete', processedPath });

      return { ok: true, processedPath };
    } catch (err) {
      console.error('Processing error', err);
      if (mainWindow) mainWindow.webContents.send('core:status', { status: 'error', message: 'Processing failed' });
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('core:export', async (_event, processedPath) => {
    if (!processedPath) return { ok: false, error: 'No processed file path' };
    if (!mainWindow) return { ok: false, error: 'No main window' };

    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export processed file',
        defaultPath: path.basename(processedPath),
        filters: [
          { name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] },
        ],
      });

      if (canceled || !filePath) {
        return { ok: false, error: 'Export canceled' };
      }

      await fs.copyFile(processedPath, filePath);

      mainWindow.webContents.send('core:status', {
        status: 'exported',
        message: `Exported to ${filePath}`,
        exportedPath: filePath,
      });

      return { ok: true, exportedPath: filePath };
    } catch (err) {
      console.error('Export error', err);
      mainWindow.webContents.send('core:status', {
        status: 'error',
        message: 'Export failed',
      });
      return { ok: false, error: String(err) };
    }
  });
}

module.exports = { registerFileHandlers };
