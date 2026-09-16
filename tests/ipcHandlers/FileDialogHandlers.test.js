import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

describe('FileDialogHandlers', () => {
  let openFile;
  let dialog;

  beforeEach(() => {
    const handlers = {};
    dialog = { showOpenDialog: vi.fn() };
    const ipcMain = {
      handle: vi.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    const { FileDialogHandlers } = loadModule('ipcHandlers/FileDialogHandlers.js', {
      electron: { ipcMain, dialog },
    });

    new FileDialogHandlers().register();
    openFile = handlers['dialog:openFile'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a single-file audio picker and returns the chosen path', async () => {
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/music/song.wav', '/music/other.wav'],
    });

    expect(await openFile()).toBe('/music/song.wav');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }],
    });
  });

  it.each([
    ['a cancel', { canceled: true, filePaths: ['/music/song.wav'] }],
    ['no file list', { canceled: false }],
    ['an empty file list', { canceled: false, filePaths: [] }],
  ])('returns null when the dialog reports %s', async (_label, result) => {
    dialog.showOpenDialog.mockResolvedValue(result);

    expect(await openFile()).toBeNull();
  });
});
