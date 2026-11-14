import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendToRenderer, requestRendererAck, senderOf } from '../ipcHandlers/rendererMessaging.js';
import { makeIpc, makeWebContents } from './helpers/fakeElectron.js';

const REQUEST = 'test:request';
const DONE = 'test:done';
const TIMEOUT_MS = 50;

function request(ipc, webContents, payload = {}) {
  return requestRendererAck({
    ipc,
    webContents,
    requestChannel: REQUEST,
    doneChannel: DONE,
    payload,
    timeoutMs: TIMEOUT_MS,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sendToRenderer', () => {
  it('sends to a live webContents', () => {
    const wc = makeWebContents();
    expect(sendToRenderer(wc, 'ch', { a: 1 })).toBe(true);
    expect(wc.send).toHaveBeenCalledWith('ch', { a: 1 });
  });

  it('skips a destroyed or missing webContents without throwing', () => {
    const wc = makeWebContents({ destroyed: true });
    expect(sendToRenderer(wc, 'ch', {})).toBe(false);
    expect(wc.send).not.toHaveBeenCalled();
    expect(sendToRenderer(null, 'ch', {})).toBe(false);
  });

  it('returns false when send throws', () => {
    const wc = makeWebContents();
    wc.send.mockImplementation(() => {
      throw new Error('gone');
    });
    expect(sendToRenderer(wc, 'ch', {})).toBe(false);
  });
});

describe('senderOf', () => {
  it('returns the webContents that sent an IPC event and its id', () => {
    const wc = makeWebContents();

    expect(senderOf({ sender: wc })).toEqual({ sender: wc, senderId: wc.id });
  });

  it('returns nulls when the event has no sender', () => {
    expect(senderOf(undefined)).toEqual({ sender: null, senderId: null });
    expect(senderOf({})).toEqual({ sender: null, senderId: null });
  });
});

describe('requestRendererAck', () => {
  it('sends the payload with a requestId to the target window', () => {
    const ipc = makeIpc();
    const wc = makeWebContents();
    request(ipc, wc, { filePath: '/a.wav' });

    const [channel, payload] = wc.send.mock.calls[0];
    expect(channel).toBe(REQUEST);
    expect(payload.filePath).toBe('/a.wav');
    expect(typeof payload.requestId).toBe('string');
  });

  it('resolves true when the same window answers with the same requestId', async () => {
    const ipc = makeIpc();
    const wc = makeWebContents();
    const pending = request(ipc, wc);
    const { requestId } = wc.send.mock.calls[0][1];

    ipc.emitFrom(wc, DONE, { requestId });

    await expect(pending).resolves.toBe(true);
  });

  it('ignores an answer from another window (window B cannot finish window A)', async () => {
    vi.useFakeTimers();
    const ipc = makeIpc();
    const windowA = makeWebContents();
    const windowB = makeWebContents();
    const pending = request(ipc, windowA);
    const { requestId } = windowA.send.mock.calls[0][1];

    ipc.emitFrom(windowB, DONE, { requestId });
    ipc.emitFrom(windowA, DONE, {}); // same window, but no requestId
    vi.advanceTimersByTime(TIMEOUT_MS);

    await expect(pending).resolves.toBe(false);
  });

  it('keeps two concurrent requests to two windows apart', async () => {
    const ipc = makeIpc();
    const windowA = makeWebContents();
    const windowB = makeWebContents();
    const pendingA = request(ipc, windowA);
    const pendingB = request(ipc, windowB);
    const idB = windowB.send.mock.calls[0][1].requestId;

    ipc.emitFrom(windowB, DONE, { requestId: idB });
    await expect(pendingB).resolves.toBe(true);

    let settledA = false;
    pendingA.then(() => (settledA = true));
    await Promise.resolve();
    expect(settledA).toBe(false);
  });

  it('resolves false after the timeout and removes its listener', async () => {
    vi.useFakeTimers();
    const ipc = makeIpc();
    const wc = makeWebContents();
    const pending = request(ipc, wc);

    vi.advanceTimersByTime(TIMEOUT_MS);

    await expect(pending).resolves.toBe(false);
    expect(ipc.listenerCount(DONE)).toBe(0);
  });

  it('resolves false immediately when the window is already gone', async () => {
    const ipc = makeIpc();
    const wc = makeWebContents({ destroyed: true });

    await expect(request(ipc, wc)).resolves.toBe(false);
    expect(ipc.listenerCount(DONE)).toBe(0);
  });
});
