import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadModule } from '../../helpers/loadModule.js';

const TEMP_OUTPUT = '/tmp/dissonance/song-processed-1.wav';

describe('CoreIpcHandlers', () => {
  let CoreIpcHandlers;
  let handlers;
  let dialog;
  let tempFileManager;
  let addon;
  let win;
  let tmpDir;

  beforeEach(() => {
    handlers = {};
    dialog = { showSaveDialog: vi.fn() };
    const ipcMain = {
      handle: vi.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    ({ CoreIpcHandlers } = loadModule('ipcHandlers/core/CoreIpcHandlers.js', {
      electron: { ipcMain, dialog },
    }));

    tempFileManager = {
      cleanupTempFile: vi.fn(async () => {}),
      cleanupForSender: vi.fn(async () => {}),
      ensureRootDir: vi.fn(async () => {}),
      makeTempProcessedPath: vi.fn(() => TEMP_OUTPUT),
      registerForSender: vi.fn(),
    };
    addon = {
      process: vi.fn(async () => ({ ok: true, processedPath: TEMP_OUTPUT })),
      readMetadata: vi.fn(async () => ({ ok: true, tags: {} })),
      writeTags: vi.fn(async () => ({ ok: true })),
    };
    win = { webContents: { send: vi.fn() } };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-ipc-handlers-'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function register({ coreAddon = addon, mainWindow = win } = {}) {
    new CoreIpcHandlers({ coreAddon, tempFileManager }).register(mainWindow);
    return handlers;
  }

  const fromSender = (id) => ({ sender: { id } });

  describe('core:cleanupProcessed', () => {
    it.each([
      ['a path', '/tmp/dissonance/a.wav'],
      ['an object with a path', { processedPath: '/tmp/dissonance/a.wav' }],
    ])('cleans up the temp file given %s', async (_label, payload) => {
      const result = await register()['core:cleanupProcessed']({}, payload);

      expect(result).toEqual({ ok: true });
      expect(tempFileManager.cleanupTempFile).toHaveBeenCalledWith('/tmp/dissonance/a.wav');
    });

    it.each([[null], [{}], ['']])('rejects a missing path (%j)', async (payload) => {
      const result = await register()['core:cleanupProcessed']({}, payload);

      expect(result).toEqual({ ok: false, error: 'No processed file path' });
      expect(tempFileManager.cleanupTempFile).not.toHaveBeenCalled();
    });
  });

  describe('core:process', () => {
    it('refuses to run without a main window', async () => {
      const result = await register({ mainWindow: null })['core:process'](fromSender(1), {
        filePath: '/a.wav',
      });

      expect(result).toEqual({ ok: false, error: 'No main window' });
    });

    it.each([[undefined], [{}], [{ filePath: 42 }]])(
      'refuses a missing or invalid file path (%j)',
      async (payload) => {
        const result = await register()['core:process'](fromSender(1), payload);

        expect(result).toEqual({ ok: false, error: 'No file path provided' });
      }
    );

    it.each([[null], [{}]])('reports when the addon cannot process (%j)', async (coreAddon) => {
      const result = await register({ coreAddon })['core:process'](fromSender(1), {
        filePath: '/a.wav',
      });

      expect(result).toEqual({ ok: false, error: 'Core addon not available' });
    });

    it('processes into a fresh temp file and reports progress', async () => {
      const result = await register()['core:process'](fromSender(7), {
        filePath: '/music/song.wav',
        options: { perturbation: 0.5, outputPath: '/somewhere/else.wav' },
      });

      expect(tempFileManager.cleanupForSender).toHaveBeenCalledWith(7);
      expect(tempFileManager.ensureRootDir).toHaveBeenCalledOnce();
      expect(tempFileManager.makeTempProcessedPath).toHaveBeenCalledWith('/music/song.wav');
      expect(addon.process).toHaveBeenCalledWith('/music/song.wav', {
        perturbation: 0.5,
        outputPath: TEMP_OUTPUT,
      });
      expect(tempFileManager.registerForSender).toHaveBeenCalledWith(7, TEMP_OUTPUT);
      expect(win.webContents.send).toHaveBeenNthCalledWith(1, 'core:status', {
        status: 'processing',
        message: 'Processing started',
      });
      expect(win.webContents.send).toHaveBeenNthCalledWith(2, 'core:status', {
        status: 'processed',
        message: 'Processing complete',
        processedPath: TEMP_OUTPUT,
      });
      expect(result).toEqual({ ok: true, processedPath: TEMP_OUTPUT });
    });

    it('uses the temp path when the addon returns none, and handles an unknown sender', async () => {
      addon.process.mockResolvedValue(undefined);

      const result = await register()['core:process'](undefined, { filePath: '/music/song.wav' });

      expect(tempFileManager.cleanupForSender).not.toHaveBeenCalled();
      expect(addon.process).toHaveBeenCalledWith('/music/song.wav', { outputPath: TEMP_OUTPUT });
      expect(tempFileManager.registerForSender).toHaveBeenCalledWith(null, TEMP_OUTPUT);
      expect(result).toEqual({ ok: true, processedPath: TEMP_OUTPUT });
    });

    it('reports a processing failure', async () => {
      addon.process.mockRejectedValue(new Error('bad header'));

      const result = await register()['core:process'](fromSender(1), { filePath: '/a.wav' });

      expect(win.webContents.send).toHaveBeenLastCalledWith('core:status', {
        status: 'error',
        message: 'Processing failed',
        error: 'Error: bad header',
      });
      expect(result).toEqual({ ok: false, error: 'Error: bad header' });
    });

    it('keeps going when status updates cannot reach the window', async () => {
      win.webContents.send.mockImplementation(() => {
        throw new Error('window destroyed');
      });

      const failingSend = await register()['core:process'](fromSender(1), { filePath: '/a.wav' });
      const noWebContents = await register({ mainWindow: {} })['core:process'](fromSender(1), {
        filePath: '/a.wav',
      });
      const noSend = await register({ mainWindow: { webContents: {} } })['core:process'](
        fromSender(1),
        { filePath: '/a.wav' }
      );

      expect(console.error).toHaveBeenCalledWith(
        'Failed to forward',
        'core:status',
        expect.any(Error)
      );
      expect([failingSend.ok, noWebContents.ok, noSend.ok]).toEqual([true, true, true]);
    });
  });

  describe('core:readMetadata', () => {
    it('returns what the addon reads', async () => {
      expect(await register()['core:readMetadata']({}, '/a.wav')).toEqual({ ok: true, tags: {} });
      expect(addon.readMetadata).toHaveBeenCalledWith('/a.wav');
    });

    it.each([[undefined], [42]])('refuses a missing or invalid path (%j)', async (filePath) => {
      expect(await register()['core:readMetadata']({}, filePath)).toEqual({
        ok: false,
        error: 'No file path provided',
      });
    });

    it.each([[null], [{}]])(
      'reports when the addon cannot read metadata (%j)',
      async (coreAddon) => {
        expect(await register({ coreAddon })['core:readMetadata']({}, '/a.wav')).toEqual({
          ok: false,
          error: 'Core addon readMetadata not available',
        });
      }
    );

    it('reports a read failure', async () => {
      addon.readMetadata.mockRejectedValue(new Error('truncated file'));

      expect(await register()['core:readMetadata']({}, '/a.wav')).toEqual({
        ok: false,
        error: 'Error: truncated file',
      });
    });
  });

  describe('core:writeTags', () => {
    it('writes the tags through the addon', async () => {
      const result = await register()['core:writeTags'](
        {},
        {
          filePath: '/a.wav',
          tags: { title: 'A' },
        }
      );

      expect(result).toEqual({ ok: true });
      expect(addon.writeTags).toHaveBeenCalledWith('/a.wav', { title: 'A' });
    });

    it('writes an empty tag set when none is given', async () => {
      await register()['core:writeTags']({}, { filePath: '/a.wav' });

      expect(addon.writeTags).toHaveBeenCalledWith('/a.wav', {});
    });

    it.each([[null], [{ tags: {} }]])('refuses a missing path (%j)', async (payload) => {
      expect(await register()['core:writeTags']({}, payload)).toEqual({
        ok: false,
        error: 'No file path provided',
      });
    });

    it.each([[null], [{}]])('reports when the addon cannot write tags (%j)', async (coreAddon) => {
      expect(await register({ coreAddon })['core:writeTags']({}, { filePath: '/a.wav' })).toEqual({
        ok: false,
        error: 'Core addon writeTags not available',
      });
    });

    it('reports a write failure', async () => {
      addon.writeTags.mockRejectedValue(new Error('read-only file'));

      expect(await register()['core:writeTags']({}, { filePath: '/a.wav' })).toEqual({
        ok: false,
        error: 'Error: read-only file',
      });
    });
  });

  describe('core:export', () => {
    function processedFile() {
      const file = path.join(tmpDir, 'song-processed.wav');
      fs.writeFileSync(file, 'audio');
      return file;
    }

    it.each([[null], [{}], ['']])('refuses a missing processed path (%j)', async (payload) => {
      expect(await register()['core:export']({}, payload)).toEqual({
        ok: false,
        error: 'No processed file path',
      });
    });

    it('refuses to export without a main window', async () => {
      expect(await register({ mainWindow: null })['core:export']({}, '/tmp/a.wav')).toEqual({
        ok: false,
        error: 'No main window',
      });
    });

    it('copies to the given destination, cleans up the temp file, and reports it', async () => {
      const source = processedFile();
      const destPath = path.join(tmpDir, 'exported.wav');

      const result = await register()['core:export']({}, { processedPath: source, destPath });

      expect(fs.readFileSync(destPath, 'utf8')).toBe('audio');
      expect(dialog.showSaveDialog).not.toHaveBeenCalled();
      expect(tempFileManager.cleanupTempFile).toHaveBeenCalledWith(source);
      expect(win.webContents.send).toHaveBeenCalledWith('core:status', {
        status: 'exported',
        message: `Exported to ${destPath}`,
        exportedPath: destPath,
      });
      expect(result).toEqual({ ok: true, exportedPath: destPath });
    });

    it('asks where to save when no destination is given', async () => {
      const source = processedFile();
      const destPath = path.join(tmpDir, 'chosen.wav');
      dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: destPath });

      const result = await register()['core:export']({}, source);

      expect(dialog.showSaveDialog).toHaveBeenCalledWith({
        title: 'Export processed file',
        defaultPath: 'song-processed.wav',
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }],
      });
      expect(fs.existsSync(destPath)).toBe(true);
      expect(result).toEqual({ ok: true, exportedPath: destPath });
    });

    it.each([
      ['cancels', { canceled: true, filePath: '/somewhere.wav' }],
      ['closes without choosing a path', { canceled: false, filePath: '' }],
    ])('does nothing when the user %s the save dialog', async (_label, dialogResult) => {
      dialog.showSaveDialog.mockResolvedValue(dialogResult);

      const result = await register()['core:export']({}, processedFile());

      expect(result).toEqual({ ok: false, error: 'Export canceled' });
      expect(tempFileManager.cleanupTempFile).not.toHaveBeenCalled();
    });

    it('reports a failed copy', async () => {
      const result = await register()['core:export'](
        {},
        {
          processedPath: path.join(tmpDir, 'missing.wav'),
          destPath: path.join(tmpDir, 'out.wav'),
        }
      );

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/ENOENT/);
      expect(win.webContents.send).toHaveBeenCalledWith('core:status', {
        status: 'error',
        message: 'Export failed',
      });
    });
  });
});
