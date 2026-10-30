import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MainApplication } from '../main/MainApplication.js';
import { FLUSH_REQUEST_CHANNEL, FLUSH_DONE_CHANNEL } from '../main/windowFlush.js';
import { DEV_MODE_ARG } from '../main/windowSecurity.js';
import {
  FakeBrowserWindow,
  makeAnsweringWebContents,
  makeApp,
  makeIpc,
} from './helpers/fakeElectron.js';
import { settle } from './helpers/fakeRenderer.js';

const UI_ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX_PATH = path.join(UI_ROOT, 'index.html');
const ICON_PATH = path.join(UI_ROOT, 'resources', 'icon.png');

/** A window class whose renderers answer every flush request at once. */
function makeFlushingWindowClass(ipc) {
  return class extends FakeBrowserWindow {
    constructor(options) {
      super(options);
      this.webContents = makeAnsweringWebContents(ipc, {
        requestChannel: FLUSH_REQUEST_CHANNEL,
        doneChannel: FLUSH_DONE_CHANNEL,
      });
    }
  };
}

/** A MainApplication over doubles; `run()` it and `settle()` to get past whenReady(). */
function makeApplication({ app = makeApp(), platform = 'linux', cleanupAllTempFiles } = {}) {
  const ipc = makeIpc();
  const BrowserWindowClass = makeFlushingWindowClass(ipc);
  const deps = {
    registerFileHandlers: vi.fn(),
    registerWindowHandlers: vi.fn(),
    cleanupAllTempFiles: cleanupAllTempFiles ?? vi.fn(async () => {}),
  };
  const application = new MainApplication({
    uiRoot: UI_ROOT,
    app,
    ipc,
    BrowserWindowClass,
    platform,
    ...deps,
  });
  const windows = () => BrowserWindowClass.getAllWindows();
  return { application, app, ipc, windows, ...deps };
}

async function runApplication(options) {
  const parts = makeApplication(options);
  parts.application.run();
  await settle();
  return parts;
}

describe('MainApplication — startup', () => {
  it('registers the IPC handlers once and opens one window on the app page', async () => {
    const { windows, registerFileHandlers, registerWindowHandlers } = await runApplication();

    expect(registerFileHandlers).toHaveBeenCalledTimes(1);
    expect(windows()).toHaveLength(1);
    expect(windows()[0].loadFile).toHaveBeenCalledWith(INDEX_PATH);
    expect(registerWindowHandlers).toHaveBeenCalledWith(windows()[0]);
  });

  it('names the app before it is ready', () => {
    const { application, app } = makeApplication();

    application.run();

    expect(app.setName).toHaveBeenCalledWith('Dissonance');
  });

  it('marks windows of an unpacked build as development', async () => {
    const { windows } = await runApplication({ app: makeApp({ isPackaged: false }) });

    const { additionalArguments } = windows()[0].options.webPreferences;
    expect(additionalArguments).toContain(DEV_MODE_ARG);
  });

  it('does not mark windows of a packaged build as development', async () => {
    const { windows } = await runApplication({ app: makeApp({ isPackaged: true }) });

    const { additionalArguments = [] } = windows()[0].options.webPreferences;
    expect(additionalArguments).not.toContain(DEV_MODE_ARG);
  });

  it('quits a second launch at once and opens nothing in it', async () => {
    const { app, windows, registerFileHandlers } = await runApplication({
      app: makeApp({ isPrimary: false }),
    });

    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(registerFileHandlers).not.toHaveBeenCalled();
    expect(windows()).toHaveLength(0);
  });

  it('opens another window in this process when the app is launched again', async () => {
    const { app, windows } = await runApplication();

    app.emit('second-instance');
    await settle();

    expect(windows()).toHaveLength(2);
  });
});

describe('MainApplication — activate (macOS Dock click)', () => {
  it('opens a window when none is open', async () => {
    const { app, windows } = await runApplication();
    windows()[0].close();
    await settle();

    app.emit('activate');

    expect(windows()).toHaveLength(1);
  });

  it('does not open another window while one is open', async () => {
    const { app, windows } = await runApplication();

    app.emit('activate');

    expect(windows()).toHaveLength(1);
  });
});

describe('MainApplication — Dock icon', () => {
  it('sets the Dock icon on macOS', async () => {
    const dock = { setIcon: vi.fn() };

    await runApplication({ app: makeApp({ dock }), platform: 'darwin' });

    expect(dock.setIcon).toHaveBeenCalledWith(ICON_PATH);
  });

  it('leaves the Dock alone on other platforms', async () => {
    const dock = { setIcon: vi.fn() };

    await runApplication({ app: makeApp({ dock }), platform: 'win32' });

    expect(dock.setIcon).not.toHaveBeenCalled();
  });
});

describe('MainApplication — close and quit', () => {
  it('quits when the last window is closed', async () => {
    const { app } = await runApplication();

    app.emit('window-all-closed');

    expect(app.quit).toHaveBeenCalled();
  });

  it('flushes a window before the X button destroys it', async () => {
    const { windows } = await runApplication();
    const win = windows()[0];

    win.close();
    const destroyedBeforeFlush = win.isDestroyed();
    await settle();

    expect(destroyedBeforeFlush).toBe(false);
    expect(win.webContents.send).toHaveBeenCalledWith(
      FLUSH_REQUEST_CHANNEL,
      expect.objectContaining({ requestId: expect.anything() })
    );
    expect(win.isDestroyed()).toBe(true);
  });

  it('holds quit until every open window has flushed, then cleans up once', async () => {
    const { app, windows, cleanupAllTempFiles } = await runApplication();
    app.emit('second-instance');
    await settle();

    app.quit();
    const cleanedBeforeFlush = cleanupAllTempFiles.mock.calls.length;
    await settle();

    expect(cleanedBeforeFlush).toBe(0);
    windows().forEach((win) =>
      expect(win.webContents.send).toHaveBeenCalledWith(FLUSH_REQUEST_CHANNEL, expect.anything())
    );
    expect(cleanupAllTempFiles).toHaveBeenCalledTimes(1);
  });

  it('quits at once and cleans up once when no window is open', async () => {
    const { app, windows, cleanupAllTempFiles } = await runApplication();
    windows()[0].close();
    await settle();

    app.quit();

    expect(cleanupAllTempFiles).toHaveBeenCalledTimes(1);
  });

  it('still quits when the temp-file cleanup fails', async () => {
    const cleanupAllTempFiles = vi.fn(async () => {
      throw new Error('disk gone');
    });
    const { app } = await runApplication({ cleanupAllTempFiles });

    expect(() => app.emit('will-quit')).not.toThrow();
    await settle();
    expect(cleanupAllTempFiles).toHaveBeenCalledTimes(1);
  });
});
