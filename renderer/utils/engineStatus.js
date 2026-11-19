/**
 * The reply main sends when the native core addon could not be loaded
 * (ipcHandlers/core/CoreIpcHandlers.js), and what the user is told then.
 */
export const ENGINE_UNAVAILABLE = 'ENGINE_UNAVAILABLE';

export const ENGINE_UNAVAILABLE_MESSAGE =
  "The audio engine could not be loaded, so files can't be analysed or processed. " +
  'Reinstall the app or report this issue.';

export const isEngineUnavailable = (resp) => resp?.code === ENGINE_UNAVAILABLE;
