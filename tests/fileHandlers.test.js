import { describe, it, expect, vi } from 'vitest';
import { registerFileHandlers, registerWindowHandlers } from '../ipcHandlers/fileHandlers.js';
import { IpcChannels } from '../ipcHandlers/ipcChannels.js';
import { FakeBrowserWindow, makeHandlingIpc } from './helpers/fakeElectron.js';

function registerWithDoubles() {
  const ipc = makeHandlingIpc();
  const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: true })) };
  const registerTheme = vi.fn();
  const registerCore = vi.fn();
  registerFileHandlers({ ipc, dialog, registerTheme, registerCore });
  return { ipc, dialog, registerTheme, registerCore };
}

describe('registerFileHandlers', () => {
  it('serves renderer log forwarding and the file dialog on the given ipc', () => {
    const { ipc } = registerWithDoubles();

    expect(ipc.listenerCount(IpcChannels.UI_LOG)).toBe(1);
    expect([...ipc.handlers.keys()]).toEqual([IpcChannels.DIALOG_OPEN_FILE]);
  });

  it('opens the file dialog through the given dialog', async () => {
    const { ipc, dialog } = registerWithDoubles();

    await ipc.handlers.get(IpcChannels.DIALOG_OPEN_FILE)({}, undefined);

    expect(dialog.showOpenDialog).toHaveBeenCalledTimes(1);
  });

  it('registers the theme and core handlers exactly once', () => {
    const { registerTheme, registerCore } = registerWithDoubles();

    expect(registerTheme).toHaveBeenCalledTimes(1);
    expect(registerCore).toHaveBeenCalledTimes(1);
  });
});

describe('registerWindowHandlers', () => {
  it("releases the window's core state with its webContents id once it is closed", () => {
    const win = new FakeBrowserWindow();
    const releaseCoreWindow = vi.fn();
    registerWindowHandlers(win, { releaseCoreWindow });

    win.close();

    expect(releaseCoreWindow).toHaveBeenCalledExactlyOnceWith(win.webContents.id);
  });

  it('keeps the core state while the window is still open', () => {
    const win = new FakeBrowserWindow();
    const releaseCoreWindow = vi.fn();

    registerWindowHandlers(win, { releaseCoreWindow });

    expect(releaseCoreWindow).not.toHaveBeenCalled();
  });
});
