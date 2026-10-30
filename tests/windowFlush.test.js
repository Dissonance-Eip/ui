import { describe, it, expect, vi } from 'vitest';
import {
  FLUSH_REQUEST_CHANNEL,
  FLUSH_DONE_CHANNEL,
  flushWindows,
  attachCloseFlush,
} from '../main/windowFlush.js';
import { makeIpc, FakeBrowserWindow } from './helpers/fakeElectron.js';

/** A window whose renderer answers flush requests (optionally after a delay). */
function makeFlushingWindow(ipc, { answer = true } = {}) {
  const win = new FakeBrowserWindow();
  win.webContents.send = vi.fn((channel, payload) => {
    if (channel !== FLUSH_REQUEST_CHANNEL || !answer) return;
    queueMicrotask(() =>
      ipc.emitFrom(win.webContents, FLUSH_DONE_CHANNEL, { requestId: payload.requestId })
    );
  });
  return win;
}

const flushRequestsTo = (win) =>
  win.webContents.send.mock.calls.filter(([channel]) => channel === FLUSH_REQUEST_CHANNEL);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('flushWindows', () => {
  it('asks every open window to flush and waits for all of them', async () => {
    const ipc = makeIpc();
    const windowA = makeFlushingWindow(ipc);
    const windowB = makeFlushingWindow(ipc);

    const results = await flushWindows(ipc, [windowA, windowB]);

    expect(flushRequestsTo(windowA)).toHaveLength(1);
    expect(flushRequestsTo(windowB)).toHaveLength(1);
    expect(results).toEqual([true, true]);
  });

  it('skips windows that are already destroyed', async () => {
    const ipc = makeIpc();
    const live = makeFlushingWindow(ipc);
    const closed = makeFlushingWindow(ipc);
    closed.close();

    const results = await flushWindows(ipc, [live, closed]);

    expect(results).toEqual([true]);
    expect(flushRequestsTo(closed)).toHaveLength(0);
  });
});

describe('attachCloseFlush', () => {
  function setup(windows, { isQuitting = () => false } = {}) {
    const ipc = makeIpc();
    const flush = vi.fn((win) => flushWindows(ipc, [win]));
    windows.forEach((win) => attachCloseFlush({ win, flush, isQuitting }));
    return { ipc, flush };
  }

  it('holds the close until that window has flushed, then closes it', async () => {
    const ipc = makeIpc();
    const win = makeFlushingWindow(ipc);
    const flush = vi.fn(() => flushWindows(ipc, [win]));
    attachCloseFlush({ win, flush, isQuitting: () => false });

    win.close();
    expect(win.isDestroyed()).toBe(false);

    await tick();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(win.isDestroyed()).toBe(true);
  });

  it('flushes each window on its own close (closing A does not skip B)', async () => {
    const ipc = makeIpc();
    const windowA = makeFlushingWindow(ipc);
    const windowB = makeFlushingWindow(ipc);
    const flush = vi.fn((win) => flushWindows(ipc, [win]));
    [windowA, windowB].forEach((win) => attachCloseFlush({ win, flush, isQuitting: () => false }));

    windowA.close();
    await tick();
    windowB.close();
    expect(windowB.isDestroyed()).toBe(false);
    await tick();

    expect(flush.mock.calls.map(([win]) => win)).toEqual([windowA, windowB]);
    expect(windowB.isDestroyed()).toBe(true);
  });

  it('lets the window close straight away once the app is quitting', () => {
    const win = new FakeBrowserWindow();
    const { flush } = setup([win], { isQuitting: () => true });

    win.close();

    expect(flush).not.toHaveBeenCalled();
    expect(win.isDestroyed()).toBe(true);
  });
});
