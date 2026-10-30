import { describe, it, expect, vi } from 'vitest';
import { createThemeForwarder } from '../ipcHandlers/theme/themeForwarder.js';
import { makeBrowserWindowClass, makeWebContents } from './helpers/fakeElectron.js';

const THEME_CHANNEL = 'ui:systemTheme';

/** Helper: resolver returning the given modes in order, one per call. */
function resolverReturning(...modes) {
  const queue = [...modes];
  return vi.fn(async () => queue.shift());
}

function setup({ windowCount = 1, modes = ['dark'] } = {}) {
  const BrowserWindow = makeBrowserWindowClass();
  const windows = Array.from({ length: windowCount }, () => new BrowserWindow());
  const forward = createThemeForwarder({
    getWindows: () => BrowserWindow.getAllWindows(),
    resolveMode: resolverReturning(...modes),
  });
  return { BrowserWindow, windows, forward };
}

const themeMessagesTo = (win) =>
  win.webContents.send.mock.calls.filter(([channel]) => channel === THEME_CHANNEL);

describe('createThemeForwarder', () => {
  it('sends the resolved mode to every open window', async () => {
    const { windows, forward } = setup({ windowCount: 3 });

    await forward();

    windows.forEach((win) =>
      expect(win.webContents.send).toHaveBeenCalledWith(THEME_CHANNEL, { mode: 'dark' })
    );
  });

  it('sends the same mode only once (several OS signals for one switch)', async () => {
    const { windows, forward } = setup({ modes: ['dark', 'dark', 'dark'] });

    await forward();
    await forward();
    await forward();

    expect(themeMessagesTo(windows[0])).toHaveLength(1);
  });

  it('sends again when the mode changes', async () => {
    const { windows, forward } = setup({ modes: ['dark', 'light'] });

    await forward();
    await forward();

    expect(themeMessagesTo(windows[0]).map(([, data]) => data.mode)).toEqual(['dark', 'light']);
  });

  it('skips closed windows and still reaches the others', async () => {
    const { windows, forward } = setup({ windowCount: 2 });
    windows[0].close();

    await forward();

    expect(themeMessagesTo(windows[0])).toHaveLength(0);
    expect(themeMessagesTo(windows[1])).toHaveLength(1);
  });

  it('skips a window whose renderer is already destroyed', async () => {
    const { windows, forward } = setup({ windowCount: 2 });
    windows[0].webContents = makeWebContents({ destroyed: true });

    await forward();

    expect(windows[0].webContents.send).not.toHaveBeenCalled();
    expect(themeMessagesTo(windows[1])).toHaveLength(1);
  });

  it('does not throw when the mode cannot be resolved', async () => {
    const BrowserWindow = makeBrowserWindowClass();
    const win = new BrowserWindow();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const forward = createThemeForwarder({
      getWindows: () => BrowserWindow.getAllWindows(),
      resolveMode: vi.fn(async () => {
        throw new Error('gsettings exploded');
      }),
    });

    await expect(forward()).resolves.toBeUndefined();

    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
