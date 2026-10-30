/**
 * `dialog:openFile` IPC — shows the native OS file picker filtered to audio
 * formats, returns the absolute path or `null` if the user canceled.
 * The renderer may pass the last imported file path; the dialog then opens
 * in that file's folder.
 */
const { ipcMain, dialog } = require('electron');
const path = require('path');
const { IpcChannels } = require('./ipcChannels');

class FileDialogHandlers {
  /** @param {{handle: Function}} [ipc] ipcMain, or a test double */
  register(ipc = ipcMain) {
    ipc.handle(IpcChannels.DIALOG_OPEN_FILE, async (_event, lastFilePath) => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        defaultPath:
          typeof lastFilePath === 'string' && lastFilePath ? path.dirname(lastFilePath) : undefined,
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }],
      });
      if (canceled || !filePaths || filePaths.length === 0) return null;
      return filePaths[0];
    });
  }
}

module.exports = { FileDialogHandlers };
