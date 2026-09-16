import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

function fakeWindow() {
  const events = {};
  return {
    events,
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
    on: vi.fn((event, handler) => {
      events[event] = handler;
    }),
  };
}

describe('registerThemeHandlers', () => {
  let registerThemeHandlers;
  let ipcMain;
  let nativeTheme;
  let handlers;
  let themeListeners;

  beforeEach(() => {
    handlers = {};
    themeListeners = {};
    ipcMain = {
      removeHandler: vi.fn(),
      handle: vi.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    nativeTheme = {
      shouldUseDarkColors: false,
      on: vi.fn((event, listener) => {
        themeListeners[event] = listener;
      }),
      removeListener: vi.fn(),
    };
    ({ registerThemeHandlers } = loadModule('ipcHandlers/themeHandlers.js', {
      electron: { ipcMain, nativeTheme },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces any previous handler and reports the current theme', async () => {
    registerThemeHandlers(fakeWindow());

    expect(ipcMain.removeHandler).toHaveBeenCalledWith('ui:getSystemTheme');
    expect(await handlers['ui:getSystemTheme']()).toEqual({ mode: 'light' });

    nativeTheme.shouldUseDarkColors = true;
    expect(await handlers['ui:getSystemTheme']()).toEqual({ mode: 'dark' });
  });

  it('still registers when there is no previous handler to remove', () => {
    ipcMain.removeHandler.mockImplementation(() => {
      throw new Error('no handler registered');
    });

    expect(() => registerThemeHandlers(fakeWindow())).not.toThrow();
    expect(ipcMain.handle).toHaveBeenCalledWith('ui:getSystemTheme', expect.any(Function));
  });

  it('pushes theme changes to the window', () => {
    const win = fakeWindow();
    registerThemeHandlers(win);
    nativeTheme.shouldUseDarkColors = true;

    themeListeners.updated();

    expect(win.webContents.send).toHaveBeenCalledWith('ui:systemTheme', { mode: 'dark' });
  });

  it('skips destroyed windows and ignores send errors', () => {
    const win = fakeWindow();
    registerThemeHandlers(win);

    win.isDestroyed.mockReturnValue(true);
    themeListeners.updated();
    expect(win.webContents.send).not.toHaveBeenCalled();

    win.isDestroyed.mockReturnValue(false);
    win.webContents.send.mockImplementation(() => {
      throw new Error('window gone');
    });
    expect(() => themeListeners.updated()).not.toThrow();
  });

  it('stops listening for theme changes once the window closes', () => {
    const win = fakeWindow();
    registerThemeHandlers(win);

    win.events.closed();
    expect(nativeTheme.removeListener).toHaveBeenCalledWith('updated', themeListeners.updated);

    nativeTheme.removeListener.mockImplementation(() => {
      throw new Error('already removed');
    });
    expect(() => win.events.closed()).not.toThrow();
  });

  it('works without a window, or with one that cannot report closing', () => {
    registerThemeHandlers(null);
    expect(() => themeListeners.updated()).not.toThrow();

    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    registerThemeHandlers(win);
    themeListeners.updated();
    expect(win.webContents.send).toHaveBeenCalledWith('ui:systemTheme', { mode: 'light' });
  });
});
