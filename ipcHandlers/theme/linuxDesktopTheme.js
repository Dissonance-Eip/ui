/**
 * Reads the light/dark preference straight from the Linux desktop settings
 * (gsettings), the same settings the desktop's own theme switcher writes
 * and the window manager uses for the title bar.
 *
 * Chromium's own guess (nativeTheme.shouldUseDarkColors) can disagree with
 * these on Linux, which left the window content stuck in one mode while the
 * title bar followed the OS. Only Cinnamon and GNOME are read directly;
 * anything else returns null so the caller falls back to nativeTheme.
 *
 * No `electron` import: child_process functions are injected so the module
 * can be unit tested.
 */
const { DARK_MODE, LIGHT_MODE } = require('./themeModes');

const GSETTINGS_BIN = 'gsettings';
const GSETTINGS_TIMEOUT_MS = 2000;

const DARK_THEME_NAME_PATTERN = /dark/i;

const COLOR_SCHEME_KEY = 'color-scheme';
const GTK_THEME_KEY = 'gtk-theme';
const GNOME_INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const CINNAMON_INTERFACE_SCHEMA = 'org.cinnamon.desktop.interface';

const COLOR_SCHEME_MODES = Object.freeze({
  'prefer-dark': DARK_MODE,
  'prefer-light': LIGHT_MODE,
});

/**
 * Settings read per desktop, in priority order. Cinnamon apps follow the
 * Cinnamon GTK theme only; a GNOME color-scheme can be left over on a
 * Cinnamon system and must not be read there.
 */
const DESKTOP_THEME_SETTINGS = Object.freeze({
  cinnamon: Object.freeze([{ schema: CINNAMON_INTERFACE_SCHEMA, key: GTK_THEME_KEY }]),
  gnome: Object.freeze([
    { schema: GNOME_INTERFACE_SCHEMA, key: COLOR_SCHEME_KEY },
    { schema: GNOME_INTERFACE_SCHEMA, key: GTK_THEME_KEY },
  ]),
});

const DESKTOP_IDS = Object.freeze({
  'x-cinnamon': 'cinnamon',
  cinnamon: 'cinnamon',
  gnome: 'gnome',
});

/** @returns {'cinnamon' | 'gnome' | null} */
function detectLinuxDesktop(env = {}) {
  const names = String(env.XDG_CURRENT_DESKTOP || '')
    .toLowerCase()
    .split(':');
  const match = names.find((name) => DESKTOP_IDS[name]);
  return match ? DESKTOP_IDS[match] : null;
}

/** `gsettings get` prints strings as `'value'\n`. */
function parseGsettingsString(stdout) {
  const value = String(stdout ?? '')
    .trim()
    .replace(/^'(.*)'$/, '$1');
  return value || null;
}

/** @returns {'dark' | 'light' | null} null for 'default' (no preference). */
function modeFromColorScheme(colorScheme) {
  return COLOR_SCHEME_MODES[colorScheme] ?? null;
}

/** @returns {'dark' | 'light' | null} */
function modeFromGtkThemeName(themeName) {
  if (!themeName) return null;
  return DARK_THEME_NAME_PATTERN.test(themeName) ? DARK_MODE : LIGHT_MODE;
}

const MODE_READERS = Object.freeze({
  [COLOR_SCHEME_KEY]: modeFromColorScheme,
  [GTK_THEME_KEY]: modeFromGtkThemeName,
});

/** Resolves to the setting's string value, or null on any failure. */
function readGsetting(execFile, { schema, key }) {
  return new Promise((resolve) => {
    try {
      execFile(
        GSETTINGS_BIN,
        ['get', schema, key],
        { timeout: GSETTINGS_TIMEOUT_MS },
        (error, stdout) => resolve(error ? null : parseGsettingsString(stdout))
      );
    } catch (_e) {
      resolve(null);
    }
  });
}

/**
 * @param {{ env: object, execFile: Function }} deps
 * @returns {Promise<'dark' | 'light' | null>} null when the desktop is not
 *   supported or its settings can't be read.
 */
async function readLinuxThemeMode({ env, execFile }) {
  const settings = DESKTOP_THEME_SETTINGS[detectLinuxDesktop(env)] ?? [];
  for (const setting of settings) {
    const mode = MODE_READERS[setting.key](await readGsetting(execFile, setting));
    if (mode) return mode;
  }
  return null;
}

/** Starts one `gsettings monitor` child; returns it, or null if spawn fails. */
function spawnMonitor(spawn, { schema, key }, onChange) {
  try {
    const child = spawn(GSETTINGS_BIN, ['monitor', schema, key]);
    child.on('error', () => {}); // ENOENT etc. arrives here; theme is non-critical
    child.stdout?.on('data', () => onChange());
    return child;
  } catch (_e) {
    return null;
  }
}

/**
 * Watches the current desktop's theme settings and calls onChange whenever
 * one of them changes (the OS 'updated' event isn't reliable for these on
 * Linux).
 * @returns {() => void} stop function that kills the monitor processes.
 */
function watchLinuxThemeSettings({ env, spawn, onChange }) {
  const settings = DESKTOP_THEME_SETTINGS[detectLinuxDesktop(env)] ?? [];
  const children = settings
    .map((setting) => spawnMonitor(spawn, setting, onChange))
    .filter(Boolean);

  return () => {
    children.forEach((child) => {
      try {
        child.kill();
      } catch (_e) {
        // already exited
      }
    });
  };
}

module.exports = {
  detectLinuxDesktop,
  parseGsettingsString,
  modeFromColorScheme,
  modeFromGtkThemeName,
  readLinuxThemeMode,
  watchLinuxThemeSettings,
};
