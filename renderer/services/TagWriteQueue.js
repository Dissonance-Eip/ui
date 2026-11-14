/**
 * Serialised, blockable queue for writing WAV metadata tags to disk.
 *
 * Design goals (all four matter — each fixes a real bug in the naive version):
 *
 *  1. Writes are serialised — never two in-flight at once. The underlying
 *     writeTagsToWav() does read-modify-write on the whole file, so concurrent
 *     calls can corrupt the file.
 *
 *  2. The pending slot carries its own filePath. If the user edits a tag for
 *     File A, then switches to File B before the write fires, the write must
 *     still target File A — not whichever file happens to be current at flush
 *     time.
 *
 *  3. A "blocked" mode lets the caller defer writes while the file is being
 *     read elsewhere (e.g. the audio element is streaming it during playback).
 *     Releasing the block drains automatically.
 *
 *  4. flush() returns a Promise that resolves only when the queue is fully
 *     drained (no pending, no in-flight). The app-quit handler awaits it so
 *     the process doesn't exit mid-write.
 *
 * Failed writes are reported via onError but the queue continues — the
 * pending slot is cleared because the next blur will produce a fresh snapshot
 * with the user's latest values anyway.
 */
export class TagWriteQueue {
  /**
   * @param {object}   opts
   * @param {(filePath: string, tags: object) => Promise<unknown>} opts.writeFn
   * @param {(err: Error, job: {filePath: string, tags: object}) => void} [opts.onError]
   */
  constructor({ writeFn, onError } = {}) {
    if (typeof writeFn !== 'function') throw new Error('TagWriteQueue: writeFn is required');

    this._writeFn = writeFn;
    this._onError = typeof onError === 'function' ? onError : null;

    this._pending = null; // { filePath, tags } | null — newest snapshot to write
    this._inFlight = null; // Promise<void> | null
    this._blocked = false; // true while audio is playing
  }

  /**
   * Stage a write. If the queue is unblocked and idle, fires immediately.
   * Otherwise the pending slot is overwritten with this snapshot — that's
   * correct because each snapshot is the full tag state.
   */
  enqueue(filePath, tags) {
    if (!filePath || typeof filePath !== 'string') return;
    this._pending = { filePath, tags: { ...tags } };
    this._drain();
  }

  /** Block (e.g. audio started playing) or unblock (e.g. audio paused) the queue. */
  setBlocked(blocked) {
    const v = !!blocked;
    if (v === this._blocked) return;
    this._blocked = v;
    if (!v) this._drain();
  }

  /**
   * Force-drain the queue and wait for it to settle. Unblocks first.
   * Resolves once both _pending and _inFlight are empty.
   *
   * IMPORTANT: writeTagsToWav does read-truncate-rewrite on the target file.
   * If the file is currently being streamed by an audio element, the write
   * will corrupt the element's internal state. Callers MUST pause any audio
   * that's playing the file *before* awaiting flush(). See importFile() and
   * processCurrentFile() in AppController for the pattern.
   */
  async flush() {
    this._blocked = false;
    this._drain();
    // The finally in _drain re-enters _drain after each write, so pending work
    // always becomes in-flight before this loop exits.
    while (this._inFlight) {
      await this._inFlight.catch(() => {});
    }
  }

  get hasPending() {
    return !!this._pending;
  }
  get isWriting() {
    return !!this._inFlight;
  }
  get isBlocked() {
    return this._blocked;
  }

  _drain() {
    if (this._blocked || this._inFlight || !this._pending) return;

    const job = this._pending;
    this._pending = null;

    this._inFlight = (async () => {
      try {
        await this._writeFn(job.filePath, job.tags);
      } catch (err) {
        if (this._onError) this._onError(err, job);
      } finally {
        this._inFlight = null;
        this._drain(); // pick up any snapshot that arrived during the write
      }
    })();
  }
}
