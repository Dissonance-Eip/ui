import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadModule } from '../../helpers/loadModule.js';

describe('coreSetup', () => {
  let tempFileManager;
  let addon;
  let handlers;
  let CoreIpcHandlers;
  let coreSetup;

  beforeEach(() => {
    tempFileManager = { cleanupAll: vi.fn(async () => {}) };
    addon = { process: vi.fn() };
    handlers = { register: vi.fn() };
    CoreIpcHandlers = vi.fn(function CoreIpcHandlers() {
      return handlers;
    });

    coreSetup = loadModule('ipcHandlers/core/coreSetup.js', {
      './TempFileManager': {
        TempFileManager: vi.fn(function TempFileManager() {
          return tempFileManager;
        }),
      },
      './CoreAddonLoader': {
        CoreAddonLoader: vi.fn(function CoreAddonLoader() {
          return { load: () => addon };
        }),
      },
      './CoreIpcHandlers': { CoreIpcHandlers },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires the loaded addon and temp file manager into the core IPC handlers', () => {
    expect(CoreIpcHandlers).toHaveBeenCalledWith({ coreAddon: addon, tempFileManager });
  });

  it('registers the core handlers for the given window', () => {
    const win = { id: 1 };

    coreSetup.registerCoreHandlers(win);

    expect(handlers.register).toHaveBeenCalledWith(win);
  });

  it('cleans up every temp file', async () => {
    await coreSetup.cleanupAllTempFiles();

    expect(tempFileManager.cleanupAll).toHaveBeenCalledOnce();
  });
});
