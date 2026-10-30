import { describe, it, expect, vi } from 'vitest';
import { FileDialogHandlers } from '../ipcHandlers/FileDialogHandlers.js';
import { IpcChannels } from '../ipcHandlers/ipcChannels.js';
import { makeHandlingIpc } from './helpers/fakeElectron.js';

const SONG = '/music/album/song.wav';

/** Registers the handler on a fake ipcMain; `reply` is what the dialog answers. */
function makeOpenFile(reply = { canceled: false, filePaths: [SONG] }) {
  const ipc = makeHandlingIpc();
  const dialog = { showOpenDialog: vi.fn(async () => reply) };
  new FileDialogHandlers({ ipc, dialog }).register();
  const openFile = (lastFilePath) =>
    ipc.handlers.get(IpcChannels.DIALOG_OPEN_FILE)({}, lastFilePath);
  return { openFile, dialog };
}

describe('FileDialogHandlers — dialog:openFile', () => {
  it('returns the picked file path', async () => {
    const { openFile } = makeOpenFile();

    const picked = await openFile();

    expect(picked).toBe(SONG);
  });

  it('opens the picker in the folder of the last imported file', async () => {
    const { openFile, dialog } = makeOpenFile();

    await openFile('/music/last/previous.wav');

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '/music/last', properties: ['openFile'] })
    );
  });

  it.each([undefined, '', 42])(
    'lets the OS choose the folder when the last path is %j',
    async (last) => {
      const { openFile, dialog } = makeOpenFile();

      await openFile(last);

      expect(dialog.showOpenDialog.mock.calls[0][0].defaultPath).toBeUndefined();
    }
  );

  it('only offers the supported audio formats', async () => {
    const { openFile, dialog } = makeOpenFile();

    await openFile();

    expect(dialog.showOpenDialog.mock.calls[0][0].filters).toEqual([
      { name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] },
    ]);
  });

  it.each([
    ['the user cancels', { canceled: true, filePaths: [SONG] }],
    ['no file comes back', { canceled: false, filePaths: [] }],
    ['the dialog gives no list', { canceled: false }],
  ])('returns null when %s', async (_case, reply) => {
    const { openFile } = makeOpenFile(reply);

    const picked = await openFile();

    expect(picked).toBeNull();
  });
});
