/**
 * Decides the light/dark mode the renderer should use.
 *
 * macOS / Windows: nativeTheme.shouldUseDarkColors (reliable there).
 * Linux: the desktop's own setting (see linuxDesktopTheme.js) when it can
 * be read, otherwise nativeTheme as before.
 *
 * Dependencies are injected so this stays free of the `electron` import
 * and can be unit tested.
 */
const { readLinuxThemeMode } = require('./linuxDesktopTheme');
const { DARK_MODE, LIGHT_MODE } = require('./themeModes');

const LINUX_PLATFORM = 'linux';

function nativeThemeMode(nativeTheme) {
  return nativeTheme?.shouldUseDarkColors ? DARK_MODE : LIGHT_MODE;
}

/**
 * @param {{ platform: string, env: object, execFile: Function, nativeTheme: object }} deps
 * @returns {Promise<'dark' | 'light'>}
 */
async function getSystemThemeMode({ platform, env, execFile, nativeTheme }) {
  if (platform === LINUX_PLATFORM) {
    const desktopMode = await readLinuxThemeMode({ env, execFile });
    if (desktopMode) return desktopMode;
  }
  return nativeThemeMode(nativeTheme);
}

module.exports = { getSystemThemeMode, LINUX_PLATFORM };
