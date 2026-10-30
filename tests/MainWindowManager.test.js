import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MainWindowManager } from '../main/MainWindowManager.js';
import { DEV_MODE_ARG } from '../main/windowSecurity.js';
import { makeBrowserWindowClass } from './helpers/fakeElectron.js';

const INDEX_PATH = '/app/index.html';
const APP_URL = pathToFileURL(INDEX_PATH).href;

function makeManager({
  BrowserWindowClass = makeBrowserWindowClass(),
  isDevelopment = false,
  openExternal = vi.fn(),
  iconPath = null,
} = {}) {
  return new MainWindowManager({
    preloadPath: '/preload.js',
    iconPath,
    indexPath: INDEX_PATH,
    isDevelopment,
    openExternal,
    BrowserWindowClass,
  });
}

/** Fakes a renderer-initiated navigation and returns the (cancellable) event. */
function navigate(win, url) {
  const event = { url, preventDefault: vi.fn() };
  win.webContents.emit('will-navigate', event, url);
  return event;
}

describe('MainWindowManager', () => {
  it('creates a new window on every request', () => {
    const manager = makeManager();

    const first = manager.createWindow();
    const second = manager.createWindow();

    expect(second).not.toBe(first);
    expect(manager.getWindows()).toEqual([first, second]);
  });

  it('forgets a window once it is closed and keeps the others', () => {
    const manager = makeManager();
    const first = manager.createWindow();
    const second = manager.createWindow();

    first.close();

    expect(manager.getWindows()).toEqual([second]);
  });

  it("uses Electron's list of open windows as the only source", () => {
    const BrowserWindowClass = makeBrowserWindowClass();
    const manager = makeManager({ BrowserWindowClass });
    const created = manager.createWindow();
    const openedElsewhere = new BrowserWindowClass();

    expect(manager.getWindows()).toEqual([created, openedElsewhere]);
  });

  it('returns a copy so callers cannot change the tracked list', () => {
    const manager = makeManager();
    manager.createWindow();

    manager.getWindows().pop();

    expect(manager.getWindows()).toHaveLength(1);
  });

  it('shows a window only once it is ready to show', () => {
    const win = makeManager().createWindow();
    expect(win.show).not.toHaveBeenCalled();

    win.emit('ready-to-show');

    expect(win.show).toHaveBeenCalledTimes(1);
  });

  it('ignores a window that fails to show', () => {
    const win = makeManager().createWindow();
    win.show.mockImplementation(() => {
      throw new Error('destroyed');
    });

    expect(() => win.emit('ready-to-show')).not.toThrow();
  });

  it('applies the requested size and keeps the minimum size', () => {
    const win = makeManager().createWindow({ width: 1024, height: 900 });

    expect(win.options).toMatchObject({ width: 1024, height: 900, minWidth: 560, minHeight: 680 });
  });
});

describe('MainWindowManager window icon', () => {
  it('uses the icon file when it exists', () => {
    const iconPath = fileURLToPath(new URL('../resources/icon.png', import.meta.url));

    const win = makeManager({ iconPath }).createWindow();

    expect(win.options.icon).toBe(iconPath);
  });

  it('leaves the icon out when the file is missing', () => {
    const win = makeManager({ iconPath: '/nowhere/icon.png' }).createWindow();

    expect(win.options).not.toHaveProperty('icon');
  });
});

describe('MainWindowManager window hardening', () => {
  it('isolates and sandboxes the renderer of every window', () => {
    const manager = makeManager();

    const windows = [manager.createWindow(), manager.createWindow()];

    for (const win of windows) {
      expect(win.options.webPreferences).toEqual({
        preload: '/preload.js',
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        additionalArguments: [],
      });
    }
  });

  it('flags the renderer as development only in development', () => {
    const devWin = makeManager({ isDevelopment: true }).createWindow();
    const prodWin = makeManager({ isDevelopment: false }).createWindow();

    expect(devWin.options.webPreferences.additionalArguments).toEqual([DEV_MODE_ARG]);
    expect(prodWin.options.webPreferences.additionalArguments).not.toContain(DEV_MODE_ARG);
  });

  it('uses the same development flag as the preload script reads', () => {
    const preloadSource = readFileSync(new URL('../preload.js', import.meta.url), 'utf8');

    expect(preloadSource).toContain(`process.argv.includes('${DEV_MODE_ARG}')`);
  });

  it('lets the window reload its own page', () => {
    const win = makeManager().createWindow();

    const event = navigate(win, `${APP_URL}#analyze`);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('blocks navigation to a local file such as a dropped audio file', () => {
    const openExternal = vi.fn();
    const win = makeManager({ openExternal }).createWindow();

    const event = navigate(win, 'file:///Users/someone/Music/song.wav');

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('blocks navigation to a web page and opens it in the system browser instead', () => {
    const openExternal = vi.fn();
    const win = makeManager({ openExternal }).createWindow();

    const event = navigate(win, 'https://example.com/docs');

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('blocks a navigation it cannot parse', () => {
    const openExternal = vi.fn();
    const win = makeManager({ openExternal }).createWindow();

    const event = navigate(win, 'not a url');

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('never opens a new app window and sends web links to the system browser', () => {
    const openExternal = vi.fn();
    const win = makeManager({ openExternal }).createWindow();

    const result = win.webContents.windowOpenHandler({ url: 'https://example.com/' });

    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://example.com/');
  });

  it.each(['file:///etc/hosts', 'javascript:alert(1)', `${APP_URL}`, 'smb://host/share'])(
    'denies window.open(%s) without opening anything',
    (url) => {
      const openExternal = vi.fn();
      const win = makeManager({ openExternal }).createWindow();

      const result = win.webContents.windowOpenHandler({ url });

      expect(result).toEqual({ action: 'deny' });
      expect(openExternal).not.toHaveBeenCalled();
    }
  );

  it('hardens a second window the same way as the first', () => {
    const openExternal = vi.fn();
    const manager = makeManager({ openExternal });
    manager.createWindow();
    const second = manager.createWindow();

    const event = navigate(second, 'https://example.com/');
    const result = second.webContents.windowOpenHandler({ url: 'file:///etc/hosts' });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(result).toEqual({ action: 'deny' });
  });
});
