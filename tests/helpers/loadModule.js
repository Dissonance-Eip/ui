import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const nodeModules = `${path.sep}node_modules${path.sep}`;
const originalLoad = Module._load;

/**
 * Load a CommonJS module (main process or IPC handler) fresh, replacing some of
 * the modules it requires.
 *
 * vi.mock() only intercepts ES imports, not require(), so replacements are served
 * from a spy on Node's Module._load. Keys are require() specifiers exactly as the
 * source writes them, e.g. 'electron' or './CoreAddonLoader'. A replacement that is
 * an Error is thrown instead, to simulate a module that cannot be loaded. The spy
 * stays active until vi.restoreAllMocks(), so requires made later at call time are
 * replaced too. Project modules are evicted from the require cache first, so each
 * call loads a fresh copy.
 *
 * @param {string} relativePath Path from the ui repo root, e.g. 'main/MainWindowManager.js'.
 * @param {Record<string, unknown>} [mocks] require() specifier → exports (or Error to throw).
 * @returns {any} The module's exports.
 */
export function loadModule(relativePath, mocks = {}) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(repoRoot) && !key.includes(nodeModules)) {
      delete require.cache[key];
    }
  }

  vi.spyOn(Module, '_load').mockImplementation(function load(request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) {
      const replacement = mocks[request];
      if (replacement instanceof Error) throw replacement;
      return replacement;
    }
    return originalLoad.call(this, request, parent, isMain);
  });

  return require(path.join(repoRoot, relativePath));
}
