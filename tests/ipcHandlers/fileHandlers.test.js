import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

describe('registerFileHandlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the log, dialog, theme and core handlers', () => {
    const logForwarder = { register: vi.fn() };
    const dialogHandlers = { register: vi.fn() };
    const registerThemeHandlers = vi.fn();
    const registerCoreHandlers = vi.fn();
    const win = { id: 1 };

    const { registerFileHandlers } = loadModule('ipcHandlers/fileHandlers.js', {
      './UiLogForwarder': {
        UiLogForwarder: vi.fn(function UiLogForwarder() {
          return logForwarder;
        }),
      },
      './FileDialogHandlers': {
        FileDialogHandlers: vi.fn(function FileDialogHandlers() {
          return dialogHandlers;
        }),
      },
      './themeHandlers': { registerThemeHandlers },
      './core/coreSetup': { registerCoreHandlers },
    });

    registerFileHandlers(win);

    expect(logForwarder.register).toHaveBeenCalledOnce();
    expect(dialogHandlers.register).toHaveBeenCalledOnce();
    expect(registerThemeHandlers).toHaveBeenCalledWith(win);
    expect(registerCoreHandlers).toHaveBeenCalledWith(win);
  });
});
