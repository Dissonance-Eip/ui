import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule } from './helpers/loadModule.js';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('main.js', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boots the application from the ui root', () => {
    const run = vi.fn();
    const MainApplication = vi.fn(function MainApplication() {
      this.run = run;
    });

    loadModule('main.js', { './main/MainApplication': { MainApplication } });

    expect(MainApplication).toHaveBeenCalledWith({ uiRoot });
    expect(run).toHaveBeenCalledOnce();
  });
});
