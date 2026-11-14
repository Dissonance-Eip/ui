import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  detectLinuxDesktop,
  parseGsettingsString,
  modeFromColorScheme,
  modeFromGtkThemeName,
  readLinuxThemeMode,
  watchLinuxThemeSettings,
} = require('../ipcHandlers/theme/linuxDesktopTheme.js');

const CINNAMON_ENV = { XDG_CURRENT_DESKTOP: 'X-Cinnamon' };
const GNOME_ENV = { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' };

/**
 * Helper: fake child_process.execFile answering `gsettings get <schema> <key>`
 * from a table keyed by "schema key". Missing entries fail like a missing
 * schema does (non-zero exit).
 */
function makeExecFile(table) {
  return vi.fn((_cmd, args, _options, callback) => {
    const value = table[`${args[1]} ${args[2]}`];
    if (value === undefined) {
      callback(new Error('No such schema'));
      return;
    }
    callback(null, `${value}\n`, '');
  });
}

/** Helper: fake child_process.spawn returning controllable child processes. */
function makeSpawn() {
  const children = [];
  const spawn = vi.fn((cmd, args) => {
    const child = new EventEmitter();
    child.cmd = cmd;
    child.args = args;
    child.stdout = new EventEmitter();
    child.kill = vi.fn();
    children.push(child);
    return child;
  });
  return { spawn, children };
}

describe('detectLinuxDesktop', () => {
  it('recognises Cinnamon from XDG_CURRENT_DESKTOP', () => {
    expect(detectLinuxDesktop({ XDG_CURRENT_DESKTOP: 'X-Cinnamon' })).toBe('cinnamon');
    expect(detectLinuxDesktop({ XDG_CURRENT_DESKTOP: 'Cinnamon' })).toBe('cinnamon');
  });

  it('recognises GNOME, including Ubuntu-style colon lists', () => {
    expect(detectLinuxDesktop({ XDG_CURRENT_DESKTOP: 'GNOME' })).toBe('gnome');
    expect(detectLinuxDesktop({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' })).toBe('gnome');
  });

  it('returns null for other or missing desktops', () => {
    expect(detectLinuxDesktop({ XDG_CURRENT_DESKTOP: 'KDE' })).toBeNull();
    expect(detectLinuxDesktop({})).toBeNull();
    expect(detectLinuxDesktop()).toBeNull();
  });
});

describe('parseGsettingsString', () => {
  it('strips the quotes and trailing newline gsettings prints', () => {
    expect(parseGsettingsString("'Mint-Y-Dark-Aqua'\n")).toBe('Mint-Y-Dark-Aqua');
    expect(parseGsettingsString("'prefer-dark'")).toBe('prefer-dark');
  });

  it('returns null for empty output', () => {
    expect(parseGsettingsString('')).toBeNull();
    expect(parseGsettingsString("''\n")).toBeNull();
    expect(parseGsettingsString(undefined)).toBeNull();
  });
});

describe('modeFromColorScheme', () => {
  it('maps explicit preferences to a mode', () => {
    expect(modeFromColorScheme('prefer-dark')).toBe('dark');
    expect(modeFromColorScheme('prefer-light')).toBe('light');
  });

  it('returns null when there is no explicit preference', () => {
    expect(modeFromColorScheme('default')).toBeNull();
    expect(modeFromColorScheme(null)).toBeNull();
  });
});

describe('modeFromGtkThemeName', () => {
  it('treats theme names containing "dark" as dark', () => {
    expect(modeFromGtkThemeName('Mint-Y-Dark-Aqua')).toBe('dark');
    expect(modeFromGtkThemeName('Adwaita-dark')).toBe('dark');
  });

  it('treats other theme names as light', () => {
    expect(modeFromGtkThemeName('Mint-Y-Aqua')).toBe('light');
    expect(modeFromGtkThemeName('Adwaita')).toBe('light');
  });

  it('returns null when no theme name is known', () => {
    expect(modeFromGtkThemeName(null)).toBeNull();
  });
});

describe('readLinuxThemeMode — Cinnamon', () => {
  it('follows the Cinnamon GTK theme', async () => {
    const execFile = makeExecFile({
      'org.cinnamon.desktop.interface gtk-theme': "'Mint-Y-Aqua'",
    });
    expect(await readLinuxThemeMode({ env: CINNAMON_ENV, execFile })).toBe('light');
  });

  it('ignores a stale GNOME color-scheme left on a Cinnamon system', async () => {
    const execFile = makeExecFile({
      'org.cinnamon.desktop.interface gtk-theme': "'Mint-Y-Aqua'",
      'org.gnome.desktop.interface color-scheme': "'prefer-dark'",
      'org.gnome.desktop.interface gtk-theme': "'Mint-Y-Dark-Aqua'",
    });
    expect(await readLinuxThemeMode({ env: CINNAMON_ENV, execFile })).toBe('light');
    const schemas = execFile.mock.calls.map(([, args]) => args[1]);
    expect(schemas).not.toContain('org.gnome.desktop.interface');
  });

  it('reports dark for a dark Cinnamon theme', async () => {
    const execFile = makeExecFile({
      'org.cinnamon.desktop.interface gtk-theme': "'Mint-Y-Dark-Aqua'",
    });
    expect(await readLinuxThemeMode({ env: CINNAMON_ENV, execFile })).toBe('dark');
  });
});

describe('readLinuxThemeMode — GNOME', () => {
  it('uses an explicit color-scheme preference first', async () => {
    const execFile = makeExecFile({
      'org.gnome.desktop.interface color-scheme': "'prefer-dark'",
      'org.gnome.desktop.interface gtk-theme': "'Adwaita'",
    });
    expect(await readLinuxThemeMode({ env: GNOME_ENV, execFile })).toBe('dark');
  });

  it('falls back to the GTK theme name when color-scheme is "default"', async () => {
    const execFile = makeExecFile({
      'org.gnome.desktop.interface color-scheme': "'default'",
      'org.gnome.desktop.interface gtk-theme': "'Adwaita-dark'",
    });
    expect(await readLinuxThemeMode({ env: GNOME_ENV, execFile })).toBe('dark');
  });

  it('reports light for the stock GNOME setup', async () => {
    const execFile = makeExecFile({
      'org.gnome.desktop.interface color-scheme': "'default'",
      'org.gnome.desktop.interface gtk-theme': "'Adwaita'",
    });
    expect(await readLinuxThemeMode({ env: GNOME_ENV, execFile })).toBe('light');
  });
});

describe('readLinuxThemeMode — unavailable settings', () => {
  it('returns null without running gsettings on an unsupported desktop', async () => {
    const execFile = makeExecFile({});
    expect(await readLinuxThemeMode({ env: { XDG_CURRENT_DESKTOP: 'KDE' }, execFile })).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null when gsettings fails (missing binary or schema)', async () => {
    const execFile = makeExecFile({});
    expect(await readLinuxThemeMode({ env: CINNAMON_ENV, execFile })).toBeNull();
  });

  it('returns null when execFile throws synchronously', async () => {
    const execFile = vi.fn(() => {
      throw new Error('spawn failed');
    });
    expect(await readLinuxThemeMode({ env: GNOME_ENV, execFile })).toBeNull();
  });
});

describe('watchLinuxThemeSettings', () => {
  it('monitors each theme key of the current desktop', () => {
    const { spawn, children } = makeSpawn();
    watchLinuxThemeSettings({ env: GNOME_ENV, spawn, onChange: vi.fn() });
    expect(children.map((c) => [c.cmd, ...c.args])).toEqual([
      ['gsettings', 'monitor', 'org.gnome.desktop.interface', 'color-scheme'],
      ['gsettings', 'monitor', 'org.gnome.desktop.interface', 'gtk-theme'],
    ]);
  });

  it('calls onChange when a monitored key changes', () => {
    const { spawn, children } = makeSpawn();
    const onChange = vi.fn();
    watchLinuxThemeSettings({ env: CINNAMON_ENV, spawn, onChange });
    children[0].stdout.emit('data', "gtk-theme: 'Mint-Y-Dark-Aqua'\n");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('survives a child process error (e.g. gsettings not installed)', () => {
    const { spawn, children } = makeSpawn();
    watchLinuxThemeSettings({ env: CINNAMON_ENV, spawn, onChange: vi.fn() });
    expect(() => children[0].emit('error', new Error('ENOENT'))).not.toThrow();
  });

  it('stop() kills every monitor process', () => {
    const { spawn, children } = makeSpawn();
    const stop = watchLinuxThemeSettings({ env: GNOME_ENV, spawn, onChange: vi.fn() });
    stop();
    children.forEach((child) => expect(child.kill).toHaveBeenCalledTimes(1));
  });

  it('does nothing on an unsupported desktop', () => {
    const { spawn } = makeSpawn();
    const stop = watchLinuxThemeSettings({ env: {}, spawn, onChange: vi.fn() });
    expect(spawn).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it('returns a no-op stop when spawn throws', () => {
    const spawn = vi.fn(() => {
      throw new Error('spawn failed');
    });
    const stop = watchLinuxThemeSettings({ env: GNOME_ENV, spawn, onChange: vi.fn() });
    expect(() => stop()).not.toThrow();
  });
});
