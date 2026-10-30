/**
 * Per-file mutual exclusion for the main process.
 *
 * The core's writeTags truncates and rewrites the whole WAV on a worker
 * thread, so two windows writing (or one writing while another reads or
 * processes) the same file at once can corrupt it. runExclusive() chains
 * tasks per resolved path: same file → one at a time in call order,
 * different files → independent.
 */
const path = require('path');

class FileLock {
  constructor() {
    this._tails = new Map(); // resolved path → promise of the last queued task
  }

  /**
   * @template T
   * @param {string} filePath
   * @param {() => Promise<T>} task
   * @returns {Promise<T>} settles like `task`; a failure never blocks the next task
   */
  runExclusive(filePath, task) {
    const key = path.resolve(filePath);
    const previous = this._tails.get(key) || Promise.resolve();
    const run = previous.then(() => task());
    const tail = run.catch(() => {});

    this._tails = new Map(this._tails).set(key, tail);
    tail.then(() => this._release(key, tail));
    return run;
  }

  _release(key, tail) {
    if (this._tails.get(key) !== tail) return; // a newer task is queued
    const remaining = new Map(this._tails);
    remaining.delete(key);
    this._tails = remaining;
  }
}

module.exports = { FileLock };
