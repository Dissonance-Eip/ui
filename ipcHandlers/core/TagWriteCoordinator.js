/**
 * Main-process owner of tag reads/writes for every window.
 *
 *   readMetadata(senderId, path) – read under the file lock and remember what
 *                                  that window now shows (its baseline)
 *   writeTags(senderId, path, tags)
 *       1. diff the window's form against its baseline; nothing changed → no
 *          write at all (closing/quitting a window no longer rewrites a file
 *          another window is playing)
 *       2. under the file lock: pause other windows' players on that file,
 *          merge the changed fields into the file's CURRENT tags, write
 *       3. tell the other windows the file changed so they re-read it
 *   forgetSender(senderId)       – drop a closed window's baselines
 *
 * Electron-free: the core addon, lock and notifier are injected.
 */
const { diffTags, hasTagChanges } = require('./tagMerge');
const { logger } = require('../../main/logger');

const NOOP_NOTIFIER = Object.freeze({
  beforeWrite: async () => {},
  afterWrite: () => {},
});

class TagWriteCoordinator {
  /**
   * @param {object} opts
   * @param {object} opts.coreAddon  needs readMetadata(path) and writeTags(path, tags)
   * @param {import('./FileLock').FileLock} opts.fileLock
   * @param {{beforeWrite: Function, afterWrite: Function}} [opts.notifier]
   */
  constructor({ coreAddon, fileLock, notifier = NOOP_NOTIFIER }) {
    this.coreAddon = coreAddon;
    this.fileLock = fileLock;
    this.notifier = notifier;
    this._baselines = new Map(); // senderId → { [filePath]: tags }
  }

  readMetadata(senderId, filePath) {
    return this.fileLock.runExclusive(filePath, async () => {
      const resp = await this.coreAddon.readMetadata(filePath);
      if (resp && resp.ok && resp.tags) this._remember(senderId, filePath, resp.tags);
      return resp;
    });
  }

  async writeTags(senderId, filePath, tags) {
    if (!this._changesFor(senderId, filePath, tags)) return { ok: true, skipped: true };
    return this.fileLock.runExclusive(filePath, () => this._writeChanges(senderId, filePath, tags));
  }

  forgetSender(senderId) {
    const remaining = new Map(this._baselines);
    remaining.delete(senderId);
    this._baselines = remaining;
  }

  /** Runs under the file lock; re-diffs because an earlier write may have moved the baseline. */
  async _writeChanges(senderId, filePath, tags) {
    const changes = this._changesFor(senderId, filePath, tags);
    if (!changes) return { ok: true, skipped: true };

    await this.notifier.beforeWrite(senderId, filePath);
    const currentTags = await this._readCurrentTags(
      filePath,
      this._baselineFor(senderId, filePath)
    );
    const result = await this.coreAddon.writeTags(filePath, { ...currentTags, ...changes });

    if (result && result.ok) {
      this._remember(senderId, filePath, tags);
      this.notifier.afterWrite(senderId, filePath);
    }
    return result;
  }

  /** @returns {object|null} the changed fields, or null when there is nothing to write */
  _changesFor(senderId, filePath, tags) {
    const changes = diffTags(this._baselineFor(senderId, filePath), tags);
    return hasTagChanges(changes) ? changes : null;
  }

  /** @returns {object|undefined} the tags this window last read or wrote for filePath */
  _baselineFor(senderId, filePath) {
    return (this._baselines.get(senderId) || {})[filePath];
  }

  /**
   * The file's tags right now. If unreadable, falls back to what the window
   * last saw — or nothing, so a never-read form can't send empty fields.
   */
  async _readCurrentTags(filePath, fallbackTags = {}) {
    try {
      const resp = await this.coreAddon.readMetadata(filePath);
      return resp && resp.ok && resp.tags ? resp.tags : fallbackTags;
    } catch (e) {
      logger.warn(`Could not re-read tags of ${filePath}; using the last known ones`, e);
      return fallbackTags;
    }
  }

  _remember(senderId, filePath, tags) {
    const known = this._baselines.get(senderId) || {};
    const updated = Object.freeze({ ...known, [filePath]: Object.freeze({ ...tags }) });
    this._baselines = new Map(this._baselines).set(senderId, updated);
  }
}

module.exports = { TagWriteCoordinator };
