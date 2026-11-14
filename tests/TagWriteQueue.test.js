import { describe, it, expect, vi } from 'vitest';
import { TagWriteQueue } from '../renderer/services/TagWriteQueue.js';

/**
 * Helper: build a writeFn that resolves after `ms` ms, recording every call.
 * Each invocation also pushes a deferred handle so tests can await ordering.
 */
function makeWriteFn(ms = 5) {
  const calls = [];
  const fn = vi.fn((filePath, tags) => {
    return new Promise((resolve) => {
      calls.push({ filePath, tags });
      setTimeout(resolve, ms);
    });
  });
  return { fn, calls };
}

describe('TagWriteQueue — construction', () => {
  it('throws if writeFn is missing', () => {
    expect(() => new TagWriteQueue({})).toThrow(/writeFn is required/);
    expect(() => new TagWriteQueue()).toThrow(/writeFn is required/);
  });

  it('starts idle / unblocked / no pending', () => {
    const q = new TagWriteQueue({ writeFn: vi.fn() });
    expect(q.hasPending).toBe(false);
    expect(q.isWriting).toBe(false);
    expect(q.isBlocked).toBe(false);
  });
});

describe('TagWriteQueue — enqueue + drain', () => {
  it('writes immediately when unblocked and idle', async () => {
    const { fn, calls } = makeWriteFn();
    const q = new TagWriteQueue({ writeFn: fn });

    q.enqueue('/a.wav', { title: 'A' });
    await q.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ filePath: '/a.wav', tags: { title: 'A' } });
  });

  it('ignores enqueue with no filePath', () => {
    const { fn } = makeWriteFn();
    const q = new TagWriteQueue({ writeFn: fn });

    q.enqueue('', { title: 'A' });
    q.enqueue(null, { title: 'A' });
    q.enqueue(undefined, { title: 'A' });

    expect(q.hasPending).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('copies tags so later mutations do not leak into pending writes', async () => {
    const { fn, calls } = makeWriteFn();
    const q = new TagWriteQueue({ writeFn: fn });

    const tags = { title: 'A' };
    q.enqueue('/a.wav', tags);
    tags.title = 'B';
    await q.flush();

    expect(calls[0].tags.title).toBe('A');
  });
});

describe('TagWriteQueue — blocked state', () => {
  it('does NOT write while blocked', async () => {
    const { fn } = makeWriteFn();
    const q = new TagWriteQueue({ writeFn: fn });

    q.setBlocked(true);
    q.enqueue('/a.wav', { title: 'A' });

    // Give the event loop a turn — write must still not have fired.
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
    expect(q.hasPending).toBe(true);
  });

  it('drains automatically when unblocked', async () => {
    const { fn, calls } = makeWriteFn();
    const q = new TagWriteQueue({ writeFn: fn });

    q.setBlocked(true);
    q.enqueue('/a.wav', { title: 'A' });
    q.setBlocked(false);

    await q.flush();
    expect(calls).toHaveLength(1);
  });

  it('setBlocked is a no-op when value is unchanged', () => {
    const { fn } = makeWriteFn();
    const q = new TagWriteQueue({ writeFn: fn });
    q.setBlocked(false); // already false
    q.setBlocked(false);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('TagWriteQueue — serialisation (no concurrent writes)', () => {
  it('runs writes one at a time, never overlapping', async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const fn = vi.fn(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          maxConcurrent = Math.max(maxConcurrent, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve();
          }, 10);
        })
    );

    const q = new TagWriteQueue({ writeFn: fn });
    q.enqueue('/a.wav', { title: 'A' });
    q.enqueue('/b.wav', { title: 'B' }); // overwrites pending
    q.enqueue('/c.wav', { title: 'C' }); // overwrites pending again
    await q.flush();

    expect(maxConcurrent).toBe(1);
    expect(fn).toHaveBeenCalled();
  });

  it('newer enqueues during an in-flight write overwrite the pending slot', async () => {
    const fn = vi.fn(() => new Promise((r) => setTimeout(r, 20)));
    const q = new TagWriteQueue({ writeFn: fn });

    q.enqueue('/a.wav', { title: 'A' }); // fires in-flight
    q.enqueue('/b.wav', { title: 'B' }); // becomes pending
    q.enqueue('/c.wav', { title: 'C' }); // overwrites pending
    await q.flush();

    // Final write should be /a then /c, NOT /b. (We always drop intermediate
    // snapshots in favour of the newest one.)
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[0][0]).toBe('/a.wav');
    expect(fn.mock.calls[1][0]).toBe('/c.wav');
  });
});

describe('TagWriteQueue — per-snapshot filePath', () => {
  it('writes the pending snapshot to its OWN filePath, not whatever is current later', async () => {
    const fn = vi.fn(() => new Promise((r) => setTimeout(r, 5)));
    const q = new TagWriteQueue({ writeFn: fn });

    // Simulate the "user edits file A, then switches to file B" scenario.
    q.setBlocked(true); // audio is playing
    q.enqueue('/A.wav', { title: 'edits-for-A' });
    // Now the user "switches files" — but the queued write must still go to A.
    q.setBlocked(false);
    await q.flush();

    expect(fn).toHaveBeenCalledWith('/A.wav', { title: 'edits-for-A' });
  });
});

describe('TagWriteQueue — flush()', () => {
  it('resolves when the queue is fully drained', async () => {
    const fn = vi.fn(() => new Promise((r) => setTimeout(r, 10)));
    const q = new TagWriteQueue({ writeFn: fn });

    q.enqueue('/a.wav', { title: 'A' });
    await q.flush();

    expect(q.hasPending).toBe(false);
    expect(q.isWriting).toBe(false);
  });

  it('unblocks the queue (so flush always drains)', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const q = new TagWriteQueue({ writeFn: fn });

    q.setBlocked(true);
    q.enqueue('/a.wav', { title: 'A' });
    await q.flush();

    expect(fn).toHaveBeenCalled();
    expect(q.isBlocked).toBe(false);
  });

  it('resolves immediately when nothing is pending or in flight', async () => {
    const fn = vi.fn();
    const q = new TagWriteQueue({ writeFn: fn });

    await q.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('waits for writes that are enqueued WHILE flushing', async () => {
    const fn = vi.fn(() => new Promise((r) => setTimeout(r, 10)));
    const q = new TagWriteQueue({ writeFn: fn });

    q.enqueue('/a.wav', { title: 'A' });
    const flushPromise = q.flush();
    // Simulate a blur happening mid-flush.
    setTimeout(() => q.enqueue('/b.wav', { title: 'B' }), 5);

    await flushPromise;

    // Both writes should have landed.
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('TagWriteQueue — error handling', () => {
  it('reports errors via onError and continues with the next snapshot', async () => {
    const onError = vi.fn();
    let call = 0;
    const fn = vi.fn(() => {
      call += 1;
      return call === 1 ? Promise.reject(new Error('disk full')) : Promise.resolve();
    });

    const q = new TagWriteQueue({ writeFn: fn, onError });
    q.enqueue('/a.wav', { title: 'A' });
    await q.flush();
    q.enqueue('/b.wav', { title: 'B' });
    await q.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][1]).toEqual({ filePath: '/a.wav', tags: { title: 'A' } });
    expect(fn).toHaveBeenCalledTimes(2); // /a (rejected) + /b (resolved)
  });

  it('does not throw when no onError is provided', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('boom')));
    const q = new TagWriteQueue({ writeFn: fn });

    q.enqueue('/a.wav', { title: 'A' });
    await expect(q.flush()).resolves.toBeUndefined();
  });
});
