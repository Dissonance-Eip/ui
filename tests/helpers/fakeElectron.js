import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

/**
 * Minimal stand-ins for the Electron objects the main-process modules talk
 * to. They only implement what those modules use, so tests run under plain
 * Node without loading Electron.
 */
let nextWebContentsId = 1;

/**
 * A webContents-like emitter. `emit('will-navigate', event)` fakes a
 * navigation; `windowOpenHandler` holds what setWindowOpenHandler() received.
 */
export function makeWebContents({ destroyed = false } = {}) {
  const webContents = new EventEmitter();
  return Object.assign(webContents, {
    id: nextWebContentsId++,
    send: vi.fn(),
    isDestroyed: () => destroyed,
    windowOpenHandler: null,
    setWindowOpenHandler: (handler) => {
      webContents.windowOpenHandler = handler;
    },
  });
}

/** An ipcMain-like emitter: `emitFrom(sender, channel, payload)` fakes a renderer message. */
export function makeIpc() {
  const ipc = new EventEmitter();
  ipc.emitFrom = (sender, channel, payload) => ipc.emit(channel, { sender }, payload);
  return ipc;
}

/** ipcMain double that also records invoke handlers like ipcMain.handle(). */
export function makeHandlingIpc() {
  const ipc = makeIpc();
  ipc.handlers = new Map();
  ipc.handle = vi.fn((channel, handler) => {
    if (ipc.handlers.has(channel)) throw new Error(`second handler for ${channel}`);
    ipc.handlers.set(channel, handler);
  });
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
 * emits 'closed' like Electron does. `getAllWindows()` lists the open
 * windows of that class (use makeBrowserWindowClass() for an isolated list).
 */
export class FakeBrowserWindow extends EventEmitter {
  static getAllWindows() {
    return Object.hasOwn(this, 'openWindows') ? [...this.openWindows] : [];
  }

  constructor(options = {}) {
    super();
    this.options = options;
    this.webContents = makeWebContents();
    this._destroyed = false;
    this.show = vi.fn();
    this.loadFile = vi.fn(async () => {});
    const WindowClass = this.constructor;
    WindowClass.openWindows = [...WindowClass.getAllWindows(), this];
    this.once('closed', () => {
      WindowClass.openWindows = WindowClass.getAllWindows().filter((win) => win !== this);
    });
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

/** A fresh FakeBrowserWindow class whose getAllWindows() only sees its own windows. */
export function makeBrowserWindowClass() {
  return class extends FakeBrowserWindow {};
}

/**
 * An Electron `app`-like emitter. `whenReady()` resolves at once;
 * `quit()` is a spy that also emits 'before-quit' and, unless a listener
 * called preventDefault(), 'will-quit' — like Electron does, once per app.
 * `isPrimary: false` fakes a second launch (the single-instance lock is taken).
 */
export function makeApp({ isPrimary = true, isPackaged = false, dock = null } = {}) {
  const app = new EventEmitter();
  let hasQuit = false;
  return Object.assign(app, {
    isPackaged,
    dock,
    setName: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    requestSingleInstanceLock: vi.fn(() => isPrimary),
    quit: vi.fn(() => {
      let prevented = false;
      app.emit('before-quit', { preventDefault: () => (prevented = true) });
      if (prevented || hasQuit) return;
      hasQuit = true;
      app.emit('will-quit');
    }),
  });
}
