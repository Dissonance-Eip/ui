import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { registerThemeHandlers } from '../ipcHandlers/themeHandlers.js';
import { makeBrowserWindowClass, makeIpc } from './helpers/fakeElectron.js';

const GNOME_ENV = { XDG_CURRENT_DESKTOP: 'GNOME' };
const GNOME_THEME_KEY_COUNT = 2; // color-scheme + gtk-theme
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** ipcMain double that also records invoke handlers like ipcMain.handle(). */
function makeHandlingIpc() {
  const ipc = makeIpc();
  ipc.handlers = new Map();
  ipc.handle = vi.fn((channel, handler) => {
    if (ipc.handlers.has(channel)) throw new Error(`second handler for ${channel}`);
    ipc.handlers.set(channel, handler);
  });
  return ipc;
}

/** child_process.spawn double returning controllable `gsettings monitor` children. */
function makeSpawn() {
  const children = [];
  const spawn = vi.fn(() => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = vi.fn();
    children.push(child);
    return child;
  });
  return { spawn, children };
}

/** execFile double answering every `gsettings get` from a mutable table. */
function makeExecFile(settings) {
  return vi.fn((_cmd, args, _options, callback) => {
    const value = settings[`${args[1]} ${args[2]}`];
    if (value === undefined) callback(new Error('No such key'));
    else callback(null, `'${value}'\n`, '');
  });
}

function setup({ platform = 'darwin', settings = {} } = {}) {
  const BrowserWindow = makeBrowserWindowClass();
  const nativeTheme = Object.assign(new EventEmitter(), { shouldUseDarkColors: false });
  const app = new EventEmitter();
  const ipc = makeHandlingIpc();
  const { spawn, children } = makeSpawn();
  registerThemeHandlers({
    ipc,
    nativeTheme,
    app,
    getWindows: () => BrowserWindow.getAllWindows(),
    platform,
    env: GNOME_ENV,
    execFile: makeExecFile(settings),
    spawn,
  });
  return { BrowserWindow, nativeTheme, app, ipc, spawn, children };
}

const openWindows = (BrowserWindow, count) =>
  Array.from({ length: count }, () => new BrowserWindow());

const lastThemeSentTo = (win) =>
  win.webContents.send.mock.calls.filter(([channel]) => channel === 'ui:systemTheme').at(-1)?.[1];

describe('registerThemeHandlers — one registration for every window', () => {
  it('opening 3 windows keeps ONE gsettings watcher and ONE nativeTheme listener', () => {
    const { BrowserWindow, nativeTheme, ipc, spawn } = setup({
      platform: 'linux',
      settings: { 'org.gnome.desktop.interface color-scheme': 'default' },
    });

    openWindows(BrowserWindow, 3);

    expect(spawn).toHaveBeenCalledTimes(GNOME_THEME_KEY_COUNT);
    expect(nativeTheme.listenerCount('updated')).toBe(1);
    expect(ipc.handle).toHaveBeenCalledTimes(1);
  });

  it('a nativeTheme change reaches all 3 windows', async () => {
    const { BrowserWindow, nativeTheme } = setup();
    const windows = openWindows(BrowserWindow, 3);

    nativeTheme.shouldUseDarkColors = true;
    nativeTheme.emit('updated');
    await tick();

    windows.forEach((win) => expect(lastThemeSentTo(win)).toEqual({ mode: 'dark' }));
  });

  it('a GNOME setting change on Linux reaches all 3 windows', async () => {
    const settings = {
      'org.gnome.desktop.interface color-scheme': 'default',
      'org.gnome.desktop.interface gtk-theme': 'Adwaita',
    };
    const { BrowserWindow, children } = setup({ platform: 'linux', settings });
    const windows = openWindows(BrowserWindow, 3);

    settings['org.gnome.desktop.interface color-scheme'] = 'prefer-dark';
    children[0].stdout.emit('data', "color-scheme: 'prefer-dark'\n");
    await tick();

    windows.forEach((win) => expect(lastThemeSentTo(win)).toEqual({ mode: 'dark' }));
  });

  it('a window opened later gets the current mode from ui:getSystemTheme', async () => {
    const { BrowserWindow, nativeTheme, ipc } = setup();
    nativeTheme.shouldUseDarkColors = true;
    const late = new BrowserWindow();

    const reply = await ipc.handlers.get('ui:getSystemTheme')({ sender: late.webContents });

    expect(reply).toEqual({ mode: 'dark' });
  });

  it('closing a window keeps theme updates flowing to the others', async () => {
    const { BrowserWindow, nativeTheme, children } = setup({ platform: 'linux' });
    const [first, second] = openWindows(BrowserWindow, 2);

    first.close();
    nativeTheme.shouldUseDarkColors = true;
    nativeTheme.emit('updated');
    await tick();

    expect(nativeTheme.listenerCount('updated')).toBe(1);
    children.forEach((child) => expect(child.kill).not.toHaveBeenCalled());
    expect(lastThemeSentTo(second)).toEqual({ mode: 'dark' });
  });
});

describe('registerThemeHandlers — app quit', () => {
  it('stops the watcher and removes the listener on will-quit', () => {
    const { app, nativeTheme, children } = setup({ platform: 'linux' });

    app.emit('will-quit');

    expect(nativeTheme.listenerCount('updated')).toBe(0);
    expect(children).toHaveLength(GNOME_THEME_KEY_COUNT);
    children.forEach((child) => expect(child.kill).toHaveBeenCalledTimes(1));
  });

  it('starts no gsettings watcher on macOS or Windows', () => {
    const { spawn } = setup({ platform: 'darwin' });
    expect(spawn).not.toHaveBeenCalled();
  });
});
