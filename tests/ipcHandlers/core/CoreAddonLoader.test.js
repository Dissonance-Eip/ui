import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule } from '../../helpers/loadModule.js';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const platformName = `dissonance_core-${process.platform}-${process.arch}.node`;

// The build paths CoreAddonLoader tries, in its own order.
const candidates = [
  path.join(uiRoot, 'Build', 'Release', platformName),
  path.join(uiRoot, 'Build', 'Release', 'dissonance_core.node'),
  path.join(uiRoot, 'build', 'Release', 'dissonance_core.node'),
  path.join(uiRoot, 'build', 'Release', platformName),
];

function notFound(name) {
  return Object.assign(new Error(`Cannot find module '${name}'`), { code: 'MODULE_NOT_FOUND' });
}

/**
 * Run CoreAddonLoader.load() with every addon source failing unless `mocks`
 * provides it, so the real binaries in Build/Release are never loaded.
 */
function load({ mocks = {}, existing = [], existsSync } = {}) {
  vi.spyOn(fs, 'existsSync').mockImplementation(existsSync ?? ((p) => existing.includes(p)));
  const { CoreAddonLoader } = loadModule('ipcHandlers/core/CoreAddonLoader.js', {
    ...Object.fromEntries(candidates.map((p) => [p, notFound(p)])),
    'dissonance-core': notFound('dissonance-core'),
    bindings: () => {
      throw new Error('bindings could not find dissonance_core');
    },
    ...mocks,
  });
  return new CoreAddonLoader().load();
}

describe('CoreAddonLoader', () => {
  let log;

  beforeEach(() => {
    vi.stubEnv('DISSONANCE_CORE_ADDON_PATH', '');
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('loads the addon from DISSONANCE_CORE_ADDON_PATH first', () => {
    const addon = { process: () => {} };
    vi.stubEnv('DISSONANCE_CORE_ADDON_PATH', '/custom/core.node');

    const result = load({
      existing: ['/custom/core.node'],
      mocks: { '/custom/core.node': addon },
    });

    expect(result).toBe(addon);
    expect(log).toHaveBeenCalledWith('Loaded addon from:', '/custom/core.node');
    expect(log).toHaveBeenCalledWith('Available functions:', ['process']);
  });

  it('tries builds that exist on disk before ones that do not', () => {
    const existingBuild = { source: 'existing build' };
    const missingBuild = { source: 'missing build' };

    const result = load({
      existing: [candidates[2]],
      mocks: { [candidates[0]]: missingBuild, [candidates[2]]: existingBuild },
    });

    expect(result).toBe(existingBuild);
  });

  it('treats a build as missing when checking it throws', () => {
    const addon = { source: 'platform build' };

    const result = load({
      existsSync: () => {
        throw new Error('permission denied');
      },
      mocks: { [candidates[0]]: addon },
    });

    expect(result).toBe(addon);
  });

  it('falls back to the dissonance-core package when no build loads', () => {
    const addon = { source: 'package' };

    expect(load({ mocks: { 'dissonance-core': addon } })).toBe(addon);
    expect(log).toHaveBeenCalledWith('Loaded addon from dissonance-core package');
  });

  it('falls back to bindings when the package is missing', () => {
    const addon = { source: 'bindings' };
    const bindings = vi.fn(() => addon);

    expect(load({ mocks: { bindings } })).toBe(addon);
    expect(bindings).toHaveBeenCalledWith('dissonance_core');
  });

  it('returns null when bindings cannot find the addon', () => {
    expect(load()).toBeNull();
    expect(log).toHaveBeenCalledWith(
      'Could not load addon:',
      'bindings could not find dissonance_core'
    );
    expect(log).toHaveBeenCalledWith('dissonance core addon loaded:', false);
  });

  it('returns null when bindings is not installed', () => {
    const resolve = Module._resolveFilename;
    vi.spyOn(Module, '_resolveFilename').mockImplementation(function (request, ...rest) {
      if (request === 'bindings') throw notFound('bindings');
      return resolve.call(this, request, ...rest);
    });

    expect(load()).toBeNull();
  });
});
