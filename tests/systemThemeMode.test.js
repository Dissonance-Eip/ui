import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getSystemThemeMode } = require('../ipcHandlers/theme/systemThemeMode.js');

const CINNAMON_ENV = { XDG_CURRENT_DESKTOP: 'X-Cinnamon' };

/** Helper: fake execFile that answers every gsettings query with `value`. */
function execFileReturning(value) {
  return vi.fn((_cmd, _args, _options, callback) => callback(null, `${value}\n`, ''));
}

function failingExecFile() {
  return vi.fn((_cmd, _args, _options, callback) => callback(new Error('ENOENT')));
}

describe('getSystemThemeMode — macOS and Windows', () => {
  it.each(['darwin', 'win32'])(
    'uses nativeTheme on %s without running gsettings',
    async (platform) => {
      const execFile = execFileReturning("'Mint-Y-Aqua'");
      const dark = await getSystemThemeMode({
        platform,
        env: CINNAMON_ENV,
        execFile,
        nativeTheme: { shouldUseDarkColors: true },
      });
      const light = await getSystemThemeMode({
        platform,
        env: CINNAMON_ENV,
        execFile,
        nativeTheme: { shouldUseDarkColors: false },
      });
      expect(dark).toBe('dark');
      expect(light).toBe('light');
      expect(execFile).not.toHaveBeenCalled();
    }
  );
});

describe('getSystemThemeMode — Linux', () => {
  it('prefers the desktop setting over a disagreeing nativeTheme', async () => {
    const mode = await getSystemThemeMode({
      platform: 'linux',
      env: CINNAMON_ENV,
      execFile: execFileReturning("'Mint-Y-Aqua'"),
      nativeTheme: { shouldUseDarkColors: true },
    });
    expect(mode).toBe('light');
  });

  it('falls back to nativeTheme when the desktop setting is unavailable', async () => {
    const mode = await getSystemThemeMode({
      platform: 'linux',
      env: CINNAMON_ENV,
      execFile: failingExecFile(),
      nativeTheme: { shouldUseDarkColors: true },
    });
    expect(mode).toBe('dark');
  });

  it('falls back to nativeTheme on desktops it does not read directly', async () => {
    const execFile = execFileReturning("'Adwaita'");
    const mode = await getSystemThemeMode({
      platform: 'linux',
      env: { XDG_CURRENT_DESKTOP: 'KDE' },
      execFile,
      nativeTheme: { shouldUseDarkColors: true },
    });
    expect(mode).toBe('dark');
    expect(execFile).not.toHaveBeenCalled();
  });
});
