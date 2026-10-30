import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { CoreAddonLoader } from '../ipcHandlers/core/CoreAddonLoader.js';

const UI_ROOT = '/app/ui';
const PLATFORM_FILE = path.join(UI_ROOT, 'Build', 'Release', 'dissonance_core-darwin-arm64.node');
const GENERIC_FILE = path.join(UI_ROOT, 'Build', 'Release', 'dissonance_core.node');
const LOWERCASE_BUILD_FILE = path.join(UI_ROOT, 'build', 'Release', 'dissonance_core.node');
const OVERRIDE_FILE = '/custom/dissonance_core.node';
const FAKE_ADDON = Object.freeze({ process() {}, readMetadata() {}, writeTags() {} });

/**
 * Builds a loader over an in-memory file system: `files` maps a path to the
 * module `require` returns for it, or to an Error it throws. `bindings` is
 * what require('bindings')('dissonance_core') yields (or throws).
 */
function setup({ files = {}, env = {}, bindings = new Error('bindings: not found') } = {}) {
  const existsSync = vi.fn((p) => Object.hasOwn(files, p));
  const requireFn = vi.fn((id) => {
    if (id === 'bindings') {
      return () => {
        if (bindings instanceof Error) throw bindings;
        return bindings;
      };
    }
    const entry = files[id];
    if (entry === undefined) throw new Error(`Cannot find module '${id}'`);
    if (entry instanceof Error) throw entry;
    return entry;
  });
  const logger = { log: vi.fn(), warn: vi.fn() };
  const loader = new CoreAddonLoader({
    uiRoot: UI_ROOT,
    env,
    platform: 'darwin',
    arch: 'arm64',
    existsSync,
    requireFn,
    logger,
  });
  return { loader, existsSync, requireFn, logger };
}

const requiredIds = (requireFn) => requireFn.mock.calls.map(([id]) => id);

describe('CoreAddonLoader — result shape', () => {
  it('returns { addon, source, error } with the platform-named build when it exists', () => {
    const { loader } = setup({ files: { [PLATFORM_FILE]: FAKE_ADDON } });

    const result = loader.load();

    expect(result).toEqual({ addon: FAKE_ADDON, source: PLATFORM_FILE, error: null });
  });

  it('prefers DISSONANCE_CORE_ADDON_PATH over the shipped builds', () => {
    const otherAddon = { process() {} };
    const { loader } = setup({
      env: { DISSONANCE_CORE_ADDON_PATH: OVERRIDE_FILE },
      files: { [OVERRIDE_FILE]: otherAddon, [PLATFORM_FILE]: FAKE_ADDON },
    });

    expect(loader.load()).toEqual({ addon: otherAddon, source: OVERRIDE_FILE, error: null });
  });

  it('resolves a relative DISSONANCE_CORE_ADDON_PATH against the working directory', () => {
    const relative = '../core/build/Release/dissonance_core.node';
    const absolute = path.resolve(relative);
    const { loader } = setup({
      env: { DISSONANCE_CORE_ADDON_PATH: relative },
      files: { [absolute]: FAKE_ADDON },
    });

    expect(loader.load()).toEqual({ addon: FAKE_ADDON, source: absolute, error: null });
  });

  it('falls back to the generic build file, then build/Release, then node-bindings', () => {
    expect(setup({ files: { [GENERIC_FILE]: FAKE_ADDON } }).loader.load().source).toBe(
      GENERIC_FILE
    );
    expect(setup({ files: { [LOWERCASE_BUILD_FILE]: FAKE_ADDON } }).loader.load().source).toBe(
      LOWERCASE_BUILD_FILE
    );
    expect(setup({ bindings: FAKE_ADDON }).loader.load()).toEqual({
      addon: FAKE_ADDON,
      source: 'bindings',
      error: null,
    });
  });

  it('moves on to the next strategy when a file exists but fails to load', () => {
    const { loader } = setup({
      files: { [PLATFORM_FILE]: new Error('wrong ABI'), [GENERIC_FILE]: FAKE_ADDON },
    });

    expect(loader.load()).toEqual({ addon: FAKE_ADDON, source: GENERIC_FILE, error: null });
  });
});

describe('CoreAddonLoader — engine unavailable', () => {
  it('never requires a path it already knows does not exist', () => {
    const { loader, requireFn } = setup();

    loader.load();

    expect(requiredIds(requireFn)).toEqual(['bindings']);
  });

  it('does not fall back to the dissonance-core package (not a dependency)', () => {
    const { loader, requireFn } = setup();

    loader.load();

    expect(requiredIds(requireFn)).not.toContain('dissonance-core');
  });

  it('returns a null addon with an error that keeps every failure reason', () => {
    const { loader } = setup({
      env: { DISSONANCE_CORE_ADDON_PATH: OVERRIDE_FILE },
      files: { [PLATFORM_FILE]: new Error('wrong ABI') },
      bindings: new Error('Could not locate the bindings file'),
    });

    const { addon, source, error } = loader.load();

    expect(addon).toBeNull();
    expect(source).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/core engine unavailable/i);
    expect(error.message).toContain(`${OVERRIDE_FILE}: not found`);
    expect(error.message).toContain(`${PLATFORM_FILE}: wrong ABI`);
    expect(error.message).toContain('bindings: Could not locate the bindings file');
  });

  it('treats an empty module as a failure and never throws', () => {
    const { loader } = setup({ files: { [PLATFORM_FILE]: new Error('boom') }, bindings: null });

    const result = loader.load();

    expect(result.addon).toBeNull();
    expect(result.error.message).toContain('bindings: loaded an empty module');
  });
});

describe('CoreAddonLoader — logging', () => {
  it('logs one line naming the source and not the export list', () => {
    const { loader, logger } = setup({ files: { [PLATFORM_FILE]: FAKE_ADDON } });

    loader.load();

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0].join(' ')).toContain(PLATFORM_FILE);
    expect(logger.log.mock.calls[0].join(' ')).not.toContain('readMetadata');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns once with the reason when the engine is unavailable', () => {
    const { loader, logger } = setup();

    loader.load();

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0].join(' ')).toMatch(/core engine unavailable/i);
  });
});
