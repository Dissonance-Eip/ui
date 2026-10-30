/**
 * Tracks processed-WAV temp files under `os.tmpdir()/dissonance/` and
 * cleans them up safely.
 *
 *   makeTempProcessedPath()    – mint a unique output path for the core to write to
 *   ensureRootDir()            – create the temp root on demand
 *   registerForSender(id,path) – remember a file so we can clean it later
 *   cleanupForSender(id)       – unlink the file associated with a renderer
 *   isTracked(path)            – true only for a path this manager registered
 *   cleanupTempFile(path)      – unlink a single tracked-or-under-root file
 *   cleanupAll()               – unlink everything we registered (called on quit)
 *
 * A file that is already gone counts as cleaned up. Any other unlink error
 * (EPERM, EBUSY, ...) is thrown by cleanupTempFile/cleanupForSender, and the
 * file stays tracked; cleanupAll logs each failure and never throws.
 *
 * isUnderRoot() guards against accidentally unlinking arbitrary user files
 * if a path was ever spoofed through IPC.
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { logger: mainLogger } = require('../../main/logger');

const UNIQUE_SUFFIX_LENGTH = 8;

class TempFileManager {
  constructor({ rootDir, logger = mainLogger } = {}) {
    this.rootDir = rootDir || path.join(os.tmpdir(), 'dissonance');
    this.logger = logger;
    this.tempFiles = new Set();
    this.tempFileBySenderId = new Map();
  }

  /**
   * Build a unique processed-output path under the temp root. Doesn't create
   * the file — just generates the path. The directory is ensured on first use.
   * The random suffix keeps two windows processing same-named inputs in the
   * same millisecond from writing to one path.
   */
  makeTempProcessedPath(inputPath) {
    const base = path.basename(inputPath, path.extname(inputPath) || '.wav');
    const stamp = Date.now();
    const unique = randomUUID().slice(0, UNIQUE_SUFFIX_LENGTH);
    return path.join(this.rootDir, `${base}-processed-${stamp}-${unique}.wav`);
  }

  async ensureRootDir() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  registerForSender(senderId, filePath) {
    if (!filePath) return;
    this.tempFiles.add(filePath);
    if (senderId) this.tempFileBySenderId.set(senderId, filePath);
  }

  async cleanupForSender(senderId) {
    if (!senderId) return;
    const p = this.tempFileBySenderId.get(senderId);
    if (p) {
      await this.cleanupTempFile(p);
    }
  }

  /**
   * True only for a path registered here, compared exactly as it was
   * registered: an untracked file under the root or a `..` spelling of a
   * tracked one doesn't count. Gate anything that reads a renderer-named
   * temp file (core:export) on this, not on isUnderRoot().
   */
  isTracked(filePath) {
    return typeof filePath === 'string' && this.tempFiles.has(filePath);
  }

  isUnderRoot(filePath) {
    if (!filePath) return false;
    try {
      const rel = path.relative(this.rootDir, filePath);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    } catch (e) {
      this.logger.warn(`Could not compare ${filePath} with the temp root`, e);
      return false;
    }
  }

  /** Deletes filePath; already gone is fine, any other failure is thrown. */
  async safeUnlink(filePath) {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (e) {
      if (e && e.code === 'ENOENT') return;
      throw e;
    }
  }

  /**
   * Delete a tracked temp file. Refuses to unlink anything that isn't
   * either in the tracked set OR physically under the temp root — even if
   * the renderer asks us to. Defends against a spoofed/stale path
   * accidentally deleting a user file.
   */
  async cleanupTempFile(filePath) {
    if (!filePath) return;
    if (!this.tempFiles.has(filePath) && !this.isUnderRoot(filePath)) return;

    await this.safeUnlink(filePath);

    this.tempFiles.delete(filePath);
    for (const [senderId, p] of this.tempFileBySenderId.entries()) {
      if (p === filePath) this.tempFileBySenderId.delete(senderId);
    }
  }

  async cleanupAll() {
    const paths = Array.from(this.tempFiles);
    const results = await Promise.allSettled(paths.map((p) => this.safeUnlink(p)));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(`Could not delete temp file ${paths[i]}`, result.reason);
      }
    });
    this.tempFiles.clear();
    this.tempFileBySenderId.clear();
  }
}

module.exports = { TempFileManager };
