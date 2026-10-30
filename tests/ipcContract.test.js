import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { IpcChannels } from '../ipcHandlers/ipcChannels.js';
import { UiLogForwarder } from '../ipcHandlers/UiLogForwarder.js';
import { FileDialogHandlers } from '../ipcHandlers/FileDialogHandlers.js';
import { registerThemeHandlers } from '../ipcHandlers/themeHandlers.js';
import { CoreIpcHandlers } from '../ipcHandlers/core/CoreIpcHandlers.js';
import { FLUSH_REQUEST_CHANNEL, FLUSH_DONE_CHANNEL } from '../main/windowFlush.js';
import {
  PAUSE_FILE_REQUEST_CHANNEL,
  PAUSE_FILE_DONE_CHANNEL,
} from '../ipcHandlers/core/OtherWindowsNotifier.js';
import { secureWebPreferences } from '../main/windowSecurity.js';
import { makeHandlingIpc } from './helpers/fakeElectron.js';

const PRELOAD_PATH = fileURLToPath(new URL('../preload.js', import.meta.url));

/**
 * Runs preload.js against a fake electron module, calls every method it
 * exposes and fires every subscription, and records each channel by kind.
 * The sandboxed preload can't import ipcChannels.js, so this is what keeps
 * its string literals in step with the main side.
 *
 * The context gives preload the globals Electron's sandboxed preload has
 * (`require` limited to electron, `console`, and a `process` whose argv
 * carries webPreferences.additionalArguments), so preload code that is
 * valid in the real sandbox runs here too.
 *
 * @param {{ argv?: string[], getPathForFile?: Function }} [opts] the
 *   renderer's process.argv and the webUtils.getPathForFile double
 */
function recordPreloadChannels({ argv = [], getPathForFile = () => null } = {}) {
  const channels = { invoke: new Set(), send: new Set(), on: new Set() };
  const listeners = new Map();
  const ipcRenderer = {
    invoke: vi.fn(async (channel) => channels.invoke.add(channel)),
    send: vi.fn((channel) => channels.send.add(channel)),
    on: vi.fn((channel, handler) => {
      channels.on.add(channel);
      listeners.set(channel, handler);
    }),
    removeListener: vi.fn(),
  };
  let api = null;
  const electron = {
    ipcRenderer,
    webUtils: { getPathForFile },
    contextBridge: { exposeInMainWorld: (_name, exposed) => (api = exposed) },
  };
  const sandbox = {
    require: (id) => (id === 'electron' ? electron : undefined),
    console: { log() {}, error() {} },
    process: { argv: [...argv] },
  };
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), sandbox, { filename: PRELOAD_PATH });
  const exposed = api;
  Object.values(exposed).forEach((method) => method(() => {}));
  return { channels, listeners, ipcRenderer, api: exposed };
}

/** Registers every main-side IPC module on one fake ipcMain. */
function registerMainSide() {
  const ipc = makeHandlingIpc();
  new UiLogForwarder({ ipc }).register();
  new FileDialogHandlers({ ipc }).register();
  registerThemeHandlers({
    ipc,
    nativeTheme: new EventEmitter(),
    app: new EventEmitter(),
    getWindows: () => [],
    platform: 'darwin',
  });
  new CoreIpcHandlers({ coreAddon: null, ipc }).register();
  return ipc;
}

async function firePreloadRequests(listeners) {
  for (const handler of listeners.values()) await handler({}, { requestId: 'r1' });
}

describe('IPC contract between preload.js and the main process', () => {
  it('every channel preload.js uses is a main-side constant', async () => {
    const { channels, listeners } = recordPreloadChannels();
    await firePreloadRequests(listeners);
    const known = new Set(Object.values(IpcChannels));

    const used = [...channels.invoke, ...channels.send, ...channels.on];

    expect(used.filter((channel) => !known.has(channel))).toEqual([]);
  });

  it('every ipcRenderer.invoke channel has an ipcMain.handle handler', () => {
    const { channels } = recordPreloadChannels();
    const ipc = registerMainSide();

    expect([...channels.invoke].filter((channel) => !ipc.handlers.has(channel))).toEqual([]);
    expect(channels.invoke.size).toBeGreaterThan(0);
  });

  it('every ipcRenderer.send channel is listened to by the main process', async () => {
    const { channels, listeners } = recordPreloadChannels();
    await firePreloadRequests(listeners);
    const ipc = registerMainSide();
    // Done channels are only listened to while main waits on a request.
    const answeredWhileWaiting = new Set([FLUSH_DONE_CHANNEL, PAUSE_FILE_DONE_CHANNEL]);

    const unheard = [...channels.send].filter(
      (channel) => ipc.listenerCount(channel) === 0 && !answeredWhileWaiting.has(channel)
    );

    expect(unheard).toEqual([]);
    expect(channels.send).toEqual(
      new Set([IpcChannels.UI_LOG, FLUSH_DONE_CHANNEL, PAUSE_FILE_DONE_CHANNEL])
    );
  });

  it.each([
    [FLUSH_REQUEST_CHANNEL, FLUSH_DONE_CHANNEL],
    [PAUSE_FILE_REQUEST_CHANNEL, PAUSE_FILE_DONE_CHANNEL],
  ])('preload answers %s on %s with the request id', async (requestChannel, doneChannel) => {
    const { listeners, ipcRenderer } = recordPreloadChannels();

    await listeners.get(requestChannel)({}, { requestId: 'r1' });

    expect(ipcRenderer.send).toHaveBeenCalledWith(doneChannel, { requestId: 'r1' });
  });

  it('preload logs a request handler that throws on ui:log and still answers', async () => {
    const { listeners, ipcRenderer, api } = recordPreloadChannels();
    api.onAppFlushRequest(() => {
      throw new Error('flush broke');
    });

    await listeners.get(FLUSH_REQUEST_CHANNEL)({}, { requestId: 'r2' });

    expect(ipcRenderer.send).toHaveBeenCalledWith(
      IpcChannels.UI_LOG,
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('app:flushRequest handler failed: Error: flush broke'),
      })
    );
    expect(ipcRenderer.send).toHaveBeenCalledWith(FLUSH_DONE_CHANNEL, { requestId: 'r2' });
  });

  it('preload logs a dropped file whose path cannot be resolved and returns null', () => {
    const { ipcRenderer, api } = recordPreloadChannels({
      getPathForFile: () => {
        throw new Error('not a file');
      },
    });

    expect(api.getPathForFile({})).toBeNull();
    expect(ipcRenderer.send).toHaveBeenCalledWith(IpcChannels.UI_LOG, {
      level: 'warn',
      message: "Could not resolve the dropped file's path: Error: not a file",
    });
  });

  it.each([
    [true, true],
    [false, false],
  ])(
    'preload reads the dev flag main passes (isDevelopment %s → %s)',
    (isDevelopment, expected) => {
      const { additionalArguments } = secureWebPreferences({
        preloadPath: PRELOAD_PATH,
        isDevelopment,
      });

      const { api } = recordPreloadChannels({ argv: ['electron', ...additionalArguments] });

      expect(api.isDevelopment()).toBe(expected);
    }
  );
});
