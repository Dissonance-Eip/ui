import { describe, it, expect, vi } from 'vitest';
import {
  hasDroppedFiles,
  promptForFile,
  resolveDroppedPath,
} from '../renderer/services/fileSelection.js';
import { makeLogger } from './helpers/fakeRenderer.js';

const SONG = '/music/song.wav';

describe('promptForFile', () => {
  it('returns the picked path, opening the dialog in the last folder', async () => {
    const api = { openFile: vi.fn(async () => SONG) };
    const logger = makeLogger();

    await expect(promptForFile({ api, logger, lastFilePath: '/music/x.wav' })).resolves.toBe(SONG);
    expect(api.openFile).toHaveBeenCalledWith('/music/x.wav');
    expect(logger.setStatus).toHaveBeenCalledWith('Opening file dialog...');
  });

  it('returns null and reports a cancelled dialog', async () => {
    const logger = makeLogger();

    const picked = await promptForFile({ api: { openFile: async () => null }, logger });

    expect(picked).toBeNull();
    expect(logger.log).toHaveBeenCalledWith('No file selected');
    expect(logger.setStatus).toHaveBeenLastCalledWith('Import canceled');
  });

  it('returns null and logs a failing dialog', async () => {
    const logger = makeLogger();
    const api = { openFile: async () => Promise.reject(new Error('boom')) };

    await expect(promptForFile({ api, logger })).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith('Import failed: Error: boom');
  });

  it('works without a logger', async () => {
    await expect(promptForFile({ api: { openFile: async () => SONG } })).resolves.toBe(SONG);
  });
});

describe('resolveDroppedPath', () => {
  const file = { name: 'song.wav' };

  it('resolves the first dropped file through the api', () => {
    const api = { getPathForFile: vi.fn(() => SONG) };

    expect(resolveDroppedPath({ files: [file, { name: 'b.wav' }] }, api)).toBe(SONG);
    expect(api.getPathForFile).toHaveBeenCalledWith(file);
  });

  it('is null when nothing was dropped', () => {
    const api = { getPathForFile: vi.fn() };

    expect(resolveDroppedPath(null, api)).toBeNull();
    expect(resolveDroppedPath({ files: [] }, api)).toBeNull();
    expect(api.getPathForFile).not.toHaveBeenCalled();
  });

  it('is null when the file has no path', () => {
    expect(resolveDroppedPath({ files: [file] }, { getPathForFile: () => '' })).toBeNull();
  });
});

describe('hasDroppedFiles', () => {
  it('needs at least one file', () => {
    expect(hasDroppedFiles(undefined)).toBe(false);
    expect(hasDroppedFiles({})).toBe(false);
    expect(hasDroppedFiles({ files: [] })).toBe(false);
    expect(hasDroppedFiles({ files: [{}] })).toBe(true);
  });
});
