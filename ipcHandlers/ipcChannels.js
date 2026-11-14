/**
 * Every IPC channel name the main process uses, in one place.
 *
 * preload.js runs sandboxed and can't import this module, so it keeps its
 * own string literals; tests/ipcContract.test.js runs preload.js and fails
 * if one of its channels is missing here or has no main-side handler.
 */
const IpcChannels = Object.freeze({
  // renderer → main, request/response (ipcRenderer.invoke ↔ ipcMain.handle)
  DIALOG_OPEN_FILE: 'dialog:openFile',
  UI_GET_SYSTEM_THEME: 'ui:getSystemTheme',
  CORE_PROCESS: 'core:process',
  CORE_READ_METADATA: 'core:readMetadata',
  CORE_WRITE_TAGS: 'core:writeTags',
  CORE_EXPORT: 'core:export',
  CORE_CLEANUP_PROCESSED: 'core:cleanupProcessed',

  // renderer → main, fire-and-forget (ipcRenderer.send ↔ ipcMain.on)
  UI_LOG: 'ui:log',
  APP_FLUSH_DONE: 'app:flushDone',
  PLAYER_PAUSE_FILE_DONE: 'player:pauseFileDone',

  // main → renderer (webContents.send ↔ ipcRenderer.on)
  CORE_STATUS: 'core:status',
  UI_SYSTEM_THEME: 'ui:systemTheme',
  TAGS_WRITTEN_ELSEWHERE: 'tags:writtenElsewhere',
  APP_FLUSH_REQUEST: 'app:flushRequest',
  PLAYER_PAUSE_FILE_REQUEST: 'player:pauseFileRequest',
});

module.exports = { IpcChannels };
