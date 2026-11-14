/**
 * `dialog:openFile` IPC — shows the native OS file picker filtered to audio
 * formats, returns the absolute path or `null` if the user canceled.
 * The renderer may pass the last imported file path; the dialog then opens
 * in that file's folder.
 */
const { ipcMain, dialog: electronDialog } = require('electron');
const path = require('path');
const { IpcChannels } = require('./ipcChannels');

class FileDialogHandlers {
  /**
   * @param {{ipc?: {handle: Function}, dialog?: {showOpenDialog: Function}}} [opts]
   *   ipc defaults to ipcMain and dialog to Electron's dialog; tests pass doubles
   */
  constructor({ ipc = ipcMain, dialog = electronDialog } = {}) {
    this.ipc = ipc;
    this.dialog = dialog;
  }

  register() {
    this.ipc.handle(IpcChannels.DIALOG_OPEN_FILE, async (_event, lastFilePath) => {
      const { canceled, filePaths } = await this.dialog.showOpenDialog({
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
