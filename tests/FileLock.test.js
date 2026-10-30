import { describe, it, expect } from 'vitest';
import { FileLock } from '../ipcHandlers/core/FileLock.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A task that records start/end around an async gap so overlaps are visible. */
function trackedTask(log, name, ms = 5) {
  return async () => {
    log.push(`${name}:start`);
    await delay(ms);
    log.push(`${name}:end`);
    return name;
  };
}

describe('FileLock', () => {
  it('runs tasks on the same file one at a time, in call order', async () => {
    const lock = new FileLock();
    const log = [];

    const results = await Promise.all([
      lock.runExclusive('/a.wav', trackedTask(log, 'first')),
      lock.runExclusive('/a.wav', trackedTask(log, 'second')),
    ]);

    expect(results).toEqual(['first', 'second']);
    expect(log).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('treats different spellings of the same path as one file', async () => {
    const lock = new FileLock();
    const log = [];

    await Promise.all([
      lock.runExclusive('/music/a.wav', trackedTask(log, 'first')),
      lock.runExclusive('/music/../music/a.wav', trackedTask(log, 'second')),
    ]);

    expect(log).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('does not make different files wait for each other', async () => {
    const lock = new FileLock();
    const log = [];

    await Promise.all([
      lock.runExclusive('/a.wav', trackedTask(log, 'a', 10)),
      lock.runExclusive('/b.wav', trackedTask(log, 'b', 1)),
    ]);

    expect(log.indexOf('b:end')).toBeLessThan(log.indexOf('a:end'));
  });

  it('passes a failure to its caller and still runs the next task', async () => {
    const lock = new FileLock();
    const failing = lock.runExclusive('/a.wav', async () => {
      throw new Error('write failed');
    });
    const next = lock.runExclusive('/a.wav', async () => 'next');

    await expect(failing).rejects.toThrow('write failed');
    await expect(next).resolves.toBe('next');
  });
});
