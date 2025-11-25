const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Try to load the native core addon (C++ -> node addon). If unavailable, fall back to simulation.
let coreAddon = null;
try {
  coreAddon = require('bindings')('dissonance_core');
} catch (e) {
  try {
    coreAddon = require(path.join(__dirname, '..', 'build', 'Release', 'dissonance_core.node'));
  } catch (e2) {
    coreAddon = null;
  }
}
console.log('dissonance core addon loaded:', !!coreAddon);

function forward(win, channel, payload) {
  try {
    if (win && win.webContents && typeof win.webContents.send === 'function') {
      win.webContents.send(channel, payload);
    }
  } catch (e) {
    console.error('Failed to forward', channel, e);
  }
}

async function simulateProcessing(filePath, mainWindow) {
  forward(mainWindow, 'core:status', { status: 'sending', message: 'Sending to dissonance-core (simulated)...' });
  await new Promise((r) => setTimeout(r, 500));

  forward(mainWindow, 'core:status', { status: 'processing', message: 'Processing started' });
  for (let p = 10; p <= 100; p += 30) {
    await new Promise((r) => setTimeout(r, 500));
    forward(mainWindow, 'core:status', { status: 'processing', message: `Processing: ${p}%` });
  }

  const ext = path.extname(filePath) || '.wav';
  const base = path.basename(filePath, ext);
  const tmpDir = path.join(os.tmpdir(), 'dissonance');
  await fs.mkdir(tmpDir, { recursive: true });
  const processedPath = path.join(tmpDir, `${base}-processed${ext}`);
  await fs.copyFile(filePath, processedPath);

  forward(mainWindow, 'core:status', { status: 'processed', message: 'Processing complete', processedPath });
  return { ok: true, processedPath };
}

function attachAddonEventForwarding(addon, mainWindow) {
  if (!addon || typeof addon.on !== 'function') return;
  try {
    addon.on('progress', (d) => forward(mainWindow, 'core:progress', d));
    addon.on('log', (m) => forward(mainWindow, 'core:log', m));
  } catch (e) {
    // be defensive
  }
}

function registerCoreHandlers(mainWindow) {
  ipcMain.handle('core:process', async (_event, payload) => {
    const filePath = typeof payload === 'string' ? payload : (payload && payload.filePath) || null;
    const options = (payload && payload.options) || {};

    console.log('core:process called with:', { filePath, options });
    if (!mainWindow) return { ok: false, error: 'No main window' };
    if (!filePath) return { ok: false, error: 'No file path provided' };

    // Notify UI that import succeeded
    forward(mainWindow, 'core:status', { status: 'imported', message: 'File imported to UI' });

    if (coreAddon && typeof coreAddon.process === 'function') {
      try {
        forward(mainWindow, 'core:status', { status: 'sending', message: 'Sending to dissonance-core (addon)...' });
        attachAddonEventForwarding(coreAddon, mainWindow);
        forward(mainWindow, 'core:status', { status: 'processing', message: 'Processing started' });

        const result = coreAddon.process(filePath, options);
        const resolved = result && typeof result.then === 'function' ? await result : result;
        const processedPath = (resolved && resolved.processedPath) || null;

        forward(mainWindow, 'core:status', { status: 'processed', message: 'Processing complete', processedPath });
        return { ok: true, processedPath };
      } catch (err) {
        console.error('Core addon processing error', err);
        forward(mainWindow, 'core:status', { status: 'error', message: 'Processing failed', error: String(err) });
        return { ok: false, error: String(err) };
      }
    }

    // fallback: simulation
    try {
      return await simulateProcessing(filePath, mainWindow);
    } catch (err) {
      console.error('Processing error', err);
      forward(mainWindow, 'core:status', { status: 'error', message: 'Processing failed' });
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('core:export', async (_event, payload) => {
    // payload can be a string (processedPath) or an object { processedPath, destPath }
    const processedPathStr = typeof payload === 'string' ? payload : (payload && payload.processedPath) || null;
    const destPath = (payload && payload.destPath) || null;

    if (!processedPathStr) return { ok: false, error: 'No processed file path' };
    if (!mainWindow) return { ok: false, error: 'No main window' };

    try {
      let canceled = false;
      let filePath;
      if (destPath) {
        filePath = destPath;
      } else {
        const result = await dialog.showSaveDialog({
          title: 'Export processed file',
          defaultPath: path.basename(processedPathStr),
          filters: [
            { name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] },
          ],
        });
        canceled = result.canceled;
        filePath = result.filePath;
      }

      if (canceled || !filePath) {
        return { ok: false, error: 'Export canceled' };
      }

      await fs.copyFile(processedPathStr, filePath);

      forward(mainWindow, 'core:status', {
        status: 'exported',
        message: `Exported to ${filePath}`,
        exportedPath: filePath,
      });

      return { ok: true, exportedPath: filePath };
    } catch (err) {
      console.error('Export error', err);
      forward(mainWindow, 'core:status', { status: 'error', message: 'Export failed' });
      return { ok: false, error: String(err) };
    }
  });
}

module.exports = { registerCoreHandlers, coreAddon };

