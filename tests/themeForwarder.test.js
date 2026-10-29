import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createThemeForwarder } = require('../ipcHandlers/theme/themeForwarder.js');

/** Helper: a minimal BrowserWindow stand-in recording what it was sent. */
function makeWindow({ destroyed = false } = {}) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: { send: vi.fn() },
  };
}

/** Helper: resolver returning the given modes in order, one per call. */
function resolverReturning(...modes) {
  const queue = [...modes];
  return vi.fn(async () => queue.shift());
}

describe('createThemeForwarder', () => {
  it('sends the resolved mode over ui:systemTheme', async () => {
    const win = makeWindow();
    const forward = createThemeForwarder({
      mainWindow: win,
      resolveMode: resolverReturning('dark'),
    });

    await forward();

    expect(win.webContents.send).toHaveBeenCalledWith('ui:systemTheme', { mode: 'dark' });
  });

  it('sends the same mode only once (several OS signals for one switch)', async () => {
    const win = makeWindow();
    const forward = createThemeForwarder({
      mainWindow: win,
      resolveMode: resolverReturning('dark', 'dark', 'dark'),
    });

    await forward();
    await forward();
    await forward();

    expect(win.webContents.send).toHaveBeenCalledTimes(1);
  });

  it('sends again when the mode changes', async () => {
    const win = makeWindow();
    const forward = createThemeForwarder({
      mainWindow: win,
      resolveMode: resolverReturning('dark', 'light'),
    });

    await forward();
    await forward();

    expect(win.webContents.send.mock.calls.map(([, data]) => data.mode)).toEqual(['dark', 'light']);
  });

  it('sends nothing to a destroyed or missing window', async () => {
    const destroyed = makeWindow({ destroyed: true });
    await createThemeForwarder({ mainWindow: destroyed, resolveMode: resolverReturning('dark') })();
    await createThemeForwarder({ mainWindow: null, resolveMode: resolverReturning('dark') })();

    expect(destroyed.webContents.send).not.toHaveBeenCalled();
  });

  it('does not throw when the mode cannot be resolved', async () => {
    const win = makeWindow();
    const resolveMode = vi.fn(async () => {
      throw new Error('gsettings exploded');
    });
    const forward = createThemeForwarder({ mainWindow: win, resolveMode });

    await expect(forward()).resolves.toBeUndefined();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});
