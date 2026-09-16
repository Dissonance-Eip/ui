import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule } from '../helpers/loadModule.js';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fakeWindow() {
  const handlers = {};
  return {
    handlers,
    on: vi.fn((event, handler) => {
      handlers[event] = handler;
    }),
    loadFile: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  };
}

function fakeEvent() {
  return { preventDefault: vi.fn() };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MainApplication', () => {
  let MainApplication;
  let app;
  let appHandlers;
  let ipcOnce;
  let BrowserWindow;
  let managers;
  let registerFileHandlers;
  let cleanupAllTempFiles;
  let platform;

  beforeEach(() => {
    appHandlers = {};
    ipcOnce = {};
    managers = [];
    app = {
      setName: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn((event, handler) => {
        appHandlers[event] = handler;
      }),
      quit: vi.fn(),
      dock: { setIcon: vi.fn() },
    };
    BrowserWindow = { getAllWindows: vi.fn(() => []) };
    const ipcMain = {
      once: vi.fn((channel, handler) => {
        ipcOnce[channel] = handler;
      }),
    };

    class FakeWindowManager {
      constructor(options) {
        this.options = options;
        this.window = null;
        this.nextWindow = null;
        managers.push(this);
      }

      getWindow() {
        return this.window;
      }

      createWindow() {
        if (!this.window) this.window = this.nextWindow ?? fakeWindow();
        return this.window;
      }
    }

    registerFileHandlers = vi.fn();
    cleanupAllTempFiles = vi.fn(() => Promise.resolve());
    ({ MainApplication } = loadModule('main/MainApplication.js', {
      electron: { app, BrowserWindow, ipcMain },
      './MainWindowManager': { MainWindowManager: FakeWindowManager },
      '../ipcHandlers/fileHandlers': { registerFileHandlers },
      '../ipcHandlers/core/coreSetup': { cleanupAllTempFiles },
    }));

    platform = Object.getOwnPropertyDescriptor(process, 'platform');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setPlatform(value) {
    Object.defineProperty(process, 'platform', { value, configurable: true, enumerable: true });
  }

  async function start(options, configure) {
    const application = new MainApplication(options);
    configure?.(managers.at(-1));
    application.run();
    await settle();
    return application;
  }

  it('defaults the ui root to the parent of main/', () => {
    const application = new MainApplication();

    expect(application.uiRoot).toBe(uiRoot);
    expect(managers[0].options).toEqual({
      preloadPath: path.join(uiRoot, 'preload.js'),
      iconPath: path.join(uiRoot, 'resources', 'icon.png'),
    });
  });

  it('names the app and opens the window once Electron is ready', async () => {
    await start({ uiRoot: '/app' });
    const win = managers[0].window;

    expect(app.setName).toHaveBeenCalledWith('Dissonance');
    expect(win.loadFile).toHaveBeenCalledWith(path.join('/app', 'index.html'));
    expect(win.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(registerFileHandlers).toHaveBeenCalledWith(win);
  });

  it('logs when index.html fails to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('index.html missing');

    await start({ uiRoot: '/app' }, (manager) => {
      manager.nextWindow = fakeWindow();
      manager.nextWindow.loadFile.mockRejectedValue(failure);
    });

    expect(error).toHaveBeenCalledWith('Failed to load index.html:', failure);
  });

  it('does not re-register handlers for a window that already exists', async () => {
    const application = await start();

    application._createAndInitWindow();

    expect(registerFileHandlers).toHaveBeenCalledOnce();
  });

  it('reopens the window on activate only when none are open', async () => {
    await start();
    const manager = managers[0];
    const first = manager.window;

    BrowserWindow.getAllWindows.mockReturnValue([first]);
    appHandlers.activate();
    expect(manager.window).toBe(first);

    manager.window = null;
    BrowserWindow.getAllWindows.mockReturnValue([]);
    appHandlers.activate();
    expect(manager.window).not.toBe(first);
    expect(registerFileHandlers).toHaveBeenCalledTimes(2);
  });

  it('quits when every window is closed', async () => {
    await start();

    appHandlers['window-all-closed']();

    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('cleans up temp files when the app quits, ignoring failures', async () => {
    await start();

    appHandlers['will-quit']();
    expect(cleanupAllTempFiles).toHaveBeenCalledOnce();

    cleanupAllTempFiles.mockRejectedValue(new Error('disk unavailable'));
    expect(() => appHandlers['will-quit']()).not.toThrow();
    await settle();
  });

  describe('before quitting', () => {
    it('quits straight away when there is no window, then lets later events through', async () => {
      await start();
      managers[0].window = null;
      const event = fakeEvent();

      appHandlers['before-quit'](event);
      appHandlers['before-quit'](fakeEvent());

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(app.quit).toHaveBeenCalledOnce();
    });

    it('quits straight away when the window is already destroyed', async () => {
      await start();
      managers[0].window.isDestroyed.mockReturnValue(true);

      appHandlers['before-quit'](fakeEvent());

      expect(app.quit).toHaveBeenCalledOnce();
    });

    it('asks the page to save pending edits, then quits when it replies', async () => {
      await start();
      const win = managers[0].window;
      const event = fakeEvent();

      appHandlers['before-quit'](event);

      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(win.webContents.send).toHaveBeenCalledWith('app:flushRequest');
      expect(app.quit).not.toHaveBeenCalled();

      ipcOnce['app:flushDone']();
      expect(app.quit).toHaveBeenCalledOnce();
    });

    it('quits after 3 seconds if the page never replies', async () => {
      await start();
      vi.useFakeTimers();

      appHandlers['before-quit'](fakeEvent());
      vi.advanceTimersByTime(2999);
      expect(app.quit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(app.quit).toHaveBeenCalledOnce();

      ipcOnce['app:flushDone']();
      expect(app.quit).toHaveBeenCalledOnce();
    });

    it('still quits on the timeout when the page cannot be messaged', async () => {
      await start();
      vi.useFakeTimers();
      managers[0].window.webContents.send.mockImplementation(() => {
        throw new Error('webContents destroyed');
      });

      appHandlers['before-quit'](fakeEvent());
      vi.advanceTimersByTime(3000);

      expect(app.quit).toHaveBeenCalledOnce();
    });

    it('quits straight away once closing the window already saved the edits', async () => {
      await start();
      managers[0].window.handlers.close(fakeEvent());
      ipcOnce['app:flushDone']();
      const event = fakeEvent();

      appHandlers['before-quit'](event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(app.quit).toHaveBeenCalledOnce();
    });
  });

  it('saves pending edits before the window closes, then lets the close through', async () => {
    await start();
    const win = managers[0].window;

    const first = fakeEvent();
    win.handlers.close(first);
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(win.webContents.send).toHaveBeenCalledWith('app:flushRequest');

    const whileSaving = fakeEvent();
    win.handlers.close(whileSaving);
    expect(whileSaving.preventDefault).not.toHaveBeenCalled();

    ipcOnce['app:flushDone']();
    expect(win.close).toHaveBeenCalledOnce();

    const afterSaving = fakeEvent();
    win.handlers.close(afterSaving);
    expect(afterSaving.preventDefault).not.toHaveBeenCalled();
  });

  describe('dock icon', () => {
    it('sets the dock icon on macOS when the icon file exists', async () => {
      setPlatform('darwin');
      fs.existsSync.mockReturnValue(true);

      await start({ uiRoot: '/app' });

      expect(app.dock.setIcon).toHaveBeenCalledWith(path.join('/app', 'resources', 'icon.png'));
    });

    it('skips it off macOS, without a dock, or without the icon file', () => {
      setPlatform('linux');
      fs.existsSync.mockReturnValue(true);
      new MainApplication()._applyDockIcon();

      setPlatform('darwin');
      fs.existsSync.mockReturnValue(false);
      new MainApplication()._applyDockIcon();

      const { dock } = app;
      app.dock = undefined;
      fs.existsSync.mockReturnValue(true);
      new MainApplication()._applyDockIcon();
      app.dock = dock;

      expect(dock.setIcon).not.toHaveBeenCalled();
    });

    it('ignores errors from setting the dock icon', () => {
      setPlatform('darwin');
      fs.existsSync.mockReturnValue(true);
      app.dock.setIcon.mockImplementation(() => {
        throw new Error('invalid image');
      });

      expect(() => new MainApplication()._applyDockIcon()).not.toThrow();
    });
  });
});
