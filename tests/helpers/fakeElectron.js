import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

/**
 * Minimal stand-ins for the Electron objects the main-process modules talk
 * to. They only implement what those modules use, so tests run under plain
 * Node without loading Electron.
 */
let nextWebContentsId = 1;

export function makeWebContents({ destroyed = false } = {}) {
  return {
    id: nextWebContentsId++,
    send: vi.fn(),
    isDestroyed: () => destroyed,
  };
}

/** An ipcMain-like emitter: `emitFrom(sender, channel, payload)` fakes a renderer message. */
export function makeIpc() {
  const ipc = new EventEmitter();
  ipc.emitFrom = (sender, channel, payload) => ipc.emit(channel, { sender }, payload);
  return ipc;
}

/**
 * Makes a webContents that answers every request on `requestChannel` by
 * sending `doneChannel` back through `ipc` with the same requestId.
 */
export function makeAnsweringWebContents(ipc, { requestChannel, doneChannel, onRequest } = {}) {
  const webContents = makeWebContents();
  webContents.send = vi.fn((channel, payload) => {
    if (channel !== requestChannel) return;
    onRequest?.(payload);
    queueMicrotask(() => ipc.emitFrom(webContents, doneChannel, { requestId: payload.requestId }));
  });
  return webContents;
}

/**
 * A BrowserWindow-like emitter. `close()` emits a cancellable 'close' event
 * and, unless a listener called preventDefault(), destroys the window and
 * emits 'closed' like Electron does.
 */
export class FakeBrowserWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.webContents = makeWebContents();
    this._destroyed = false;
    this.show = vi.fn();
  }

  isDestroyed() {
    return this._destroyed;
  }

  close() {
    let prevented = false;
    this.emit('close', { preventDefault: () => (prevented = true) });
    if (prevented) return;
    this._destroyed = true;
    this.emit('closed');
  }
}
