/**
 * Loads the dissonance_core native addon through an ordered list of
 * strategies; the first one that yields a module wins:
 *   1. DISSONANCE_CORE_ADDON_PATH env override (resolved against the cwd)
 *   2. Platform-named .node in Build/Release/  (what CI ships)
 *   3. Generic .node in Build/Release/, then build/Release/ (generic, platform-named)
 *   4. node-bindings fallback
 * File strategies skip a path that doesn't exist instead of requiring it.
 *
 * load() never throws. It returns `{ addon, source, error }`: the module and
 * where it came from, or `addon: null` with an Error that lists each
 * strategy's failure, so the UI can say the engine is unavailable and why.
 */
const fs = require('fs');
const path = require('path');

const ADDON_NAME = 'dissonance_core';
const OVERRIDE_ENV_VAR = 'DISSONANCE_CORE_ADDON_PATH';
const BINDINGS_SOURCE = 'bindings';
const DEFAULT_UI_ROOT = path.join(__dirname, '..', '..');

/** @typedef {{ addon: object|null, source: string|null, error: Error|null }} AddonLoadResult */

function failure(source, reason) {
  return { addon: null, source, error: reason instanceof Error ? reason : new Error(reason) };
}

/** Runs `loadModule`; an empty export counts as a failure. */
function attempt(source, loadModule) {
  try {
    const addon = loadModule();
    return addon ? { addon, source, error: null } : failure(source, 'loaded an empty module');
  } catch (e) {
    return failure(source, e);
  }
}

class CoreAddonLoader {
  /**
   * @param {object} [deps] injectable for tests; defaults are the real ones
   */
  constructor({
    uiRoot = DEFAULT_UI_ROOT,
    env = process.env,
    platform = process.platform,
    arch = process.arch,
    existsSync = fs.existsSync,
    requireFn = require,
    logger = console,
  } = {}) {
    this.deps = { uiRoot, env, platform, arch, existsSync, requireFn, logger };
  }

  /** @returns {AddonLoadResult} */
  load() {
    const failures = [];
    for (const strategy of this._strategies()) {
      const result = strategy();
      if (result.addon) {
        this.deps.logger.log('Loaded core addon from', result.source);
        return result;
      }
      failures.push(`${result.source}: ${result.error.message}`);
    }

    const error = new Error(`Core engine unavailable (${failures.join('; ')})`);
    this.deps.logger.warn(error.message);
    return { addon: null, source: null, error };
  }

  /** @returns {Array<() => AddonLoadResult>} in the order they are tried */
  _strategies() {
    const override = this.deps.env[OVERRIDE_ENV_VAR];
    const overrideFiles = override ? [path.resolve(override)] : [];
    const files = [...overrideFiles, ...this._buildFiles()];
    return [
      ...files.map((filePath) => () => this._loadFile(filePath)),
      () => attempt(BINDINGS_SOURCE, () => this.deps.requireFn('bindings')(ADDON_NAME)),
    ];
  }

  _buildFiles() {
    const { uiRoot, platform, arch } = this.deps;
    const platformFile = `${ADDON_NAME}-${platform}-${arch}.node`;
    const genericFile = `${ADDON_NAME}.node`;
    return [
      path.join(uiRoot, 'Build', 'Release', platformFile),
      path.join(uiRoot, 'Build', 'Release', genericFile),
      path.join(uiRoot, 'build', 'Release', genericFile),
      path.join(uiRoot, 'build', 'Release', platformFile),
    ];
  }

  _loadFile(filePath) {
    if (!this._exists(filePath)) return failure(filePath, 'not found');
    return attempt(filePath, () => this.deps.requireFn(filePath));
  }

  _exists(filePath) {
    try {
      return this.deps.existsSync(filePath);
    } catch (_e) {
      return false;
    }
  }
}

module.exports = { CoreAddonLoader };
