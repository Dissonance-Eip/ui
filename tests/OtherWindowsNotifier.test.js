import { describe, it, expect, vi } from 'vitest';
import {
  PAUSE_FILE_REQUEST_CHANNEL,
  PAUSE_FILE_DONE_CHANNEL,
  TAGS_WRITTEN_ELSEWHERE_CHANNEL,
  createOtherWindowsNotifier,
} from '../ipcHandlers/core/OtherWindowsNotifier.js';
import { makeIpc, makeWebContents, makeAnsweringWebContents } from './helpers/fakeElectron.js';

const SONG = '/music/song.wav';
const PAUSE_TIMEOUT_MS = 30;

function setup(windowCount = 2) {
  const ipc = makeIpc();
  const paused = [];
  const windows = Array.from({ length: windowCount }, () =>
    makeAnsweringWebContents(ipc, {
      requestChannel: PAUSE_FILE_REQUEST_CHANNEL,
      doneChannel: PAUSE_FILE_DONE_CHANNEL,
      onRequest: (payload) => paused.push(payload.filePath),
    })
  );
  const notifier = createOtherWindowsNotifier({
    ipc,
    listWebContents: () => windows,
    pauseTimeoutMs: PAUSE_TIMEOUT_MS,
  });
  return { ipc, windows, paused, notifier };
}

const sentOn = (webContents, channel) =>
  webContents.send.mock.calls.filter(([sent]) => sent === channel);

describe('createOtherWindowsNotifier', () => {
  it('asks every other window to pause that file and waits for their answers', async () => {
    const { windows, paused, notifier } = setup(3);
    const [writer, ...others] = windows;

    await notifier.beforeWrite(writer.id, SONG);

    expect(paused).toEqual([SONG, SONG]);
    expect(sentOn(writer, PAUSE_FILE_REQUEST_CHANNEL)).toHaveLength(0);
    others.forEach((wc) => expect(sentOn(wc, PAUSE_FILE_REQUEST_CHANNEL)).toHaveLength(1));
  });

  it('does not wait longer than the timeout for a window that never answers', async () => {
    vi.useFakeTimers();
    const ipc = makeIpc();
    const writer = makeWebContents();
    const silent = makeWebContents();
    const notifier = createOtherWindowsNotifier({
      ipc,
      listWebContents: () => [writer, silent],
      pauseTimeoutMs: PAUSE_TIMEOUT_MS,
    });

    const pending = notifier.beforeWrite(writer.id, SONG);
    vi.advanceTimersByTime(PAUSE_TIMEOUT_MS);

    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('tells the other windows which file changed after the write', () => {
    const { windows, notifier } = setup(2);
    const [writer, other] = windows;

    notifier.afterWrite(writer.id, SONG);

    expect(sentOn(other, TAGS_WRITTEN_ELSEWHERE_CHANNEL)).toEqual([
      [TAGS_WRITTEN_ELSEWHERE_CHANNEL, { filePath: SONG }],
    ]);
    expect(sentOn(writer, TAGS_WRITTEN_ELSEWHERE_CHANNEL)).toHaveLength(0);
  });

  it('skips destroyed windows', async () => {
    const ipc = makeIpc();
    const writer = makeWebContents();
    const closed = makeWebContents({ destroyed: true });
    const notifier = createOtherWindowsNotifier({
      ipc,
      listWebContents: () => [writer, closed],
      pauseTimeoutMs: PAUSE_TIMEOUT_MS,
    });

    await notifier.beforeWrite(writer.id, SONG);
    notifier.afterWrite(writer.id, SONG);

    expect(closed.send).not.toHaveBeenCalled();
  });
});
