import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TempFileManager } from '../ipcHandlers/core/TempFileManager.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TempFileManager.makeTempProcessedPath', () => {
  it('gives two windows processing same-named files in the same millisecond different outputs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const manager = new TempFileManager({ rootDir: '/tmp/dissonance-test' });

    const fromWindowA = manager.makeTempProcessedPath('/music/song.wav');
    const fromWindowB = manager.makeTempProcessedPath('/other/song.wav');

    expect(fromWindowA).not.toBe(fromWindowB);
  });

  it('keeps outputs under the temp root and named after the input', () => {
    const manager = new TempFileManager({ rootDir: '/tmp/dissonance-test' });

    const output = manager.makeTempProcessedPath('/music/song.wav');

    expect(manager.isUnderRoot(output)).toBe(true);
    expect(path.basename(output)).toMatch(/^song-processed-.+\.wav$/);
  });
});
