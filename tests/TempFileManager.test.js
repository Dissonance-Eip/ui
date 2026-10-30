import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TempFileManager } from '../ipcHandlers/core/TempFileManager.js';

const WINDOW_A = 1;
const WINDOW_B = 2;
const CONTENT = 'audio bytes';

let workDir;
let rootDir;
let userDir;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dissonance-temp-test-'));
  rootDir = path.join(workDir, 'dissonance');
  userDir = path.join(workDir, 'user');
  await fs.mkdir(rootDir);
  await fs.mkdir(userDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(workDir, { recursive: true, force: true });
});

async function writeFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, CONTENT);
  return filePath;
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

/** A processed output the app created for `senderId`, the way core:process does. */
async function makeRegisteredOutput(manager, senderId, inputPath = '/music/song.wav') {
  const outputPath = await writeFile(manager.makeTempProcessedPath(inputPath));
  manager.registerForSender(senderId, outputPath);
  return outputPath;
}

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

  it('always names the output .wav, whatever the input extension', () => {
    const manager = new TempFileManager({ rootDir: '/tmp/dissonance-test' });

    expect(path.basename(manager.makeTempProcessedPath('/music/song.flac'))).toMatch(
      /^song-processed-.+\.wav$/
    );
    expect(path.basename(manager.makeTempProcessedPath('/music/noext'))).toMatch(
      /^noext-processed-.+\.wav$/
    );
  });

  it('defaults the root to a dissonance folder in the OS temp directory', () => {
    const manager = new TempFileManager();

    const output = manager.makeTempProcessedPath('/music/song.wav');

    expect(path.dirname(output)).toBe(path.join(os.tmpdir(), 'dissonance'));
  });
});

describe('TempFileManager.ensureRootDir', () => {
  it('creates a missing root, including its parents, and tolerates an existing one', async () => {
    const nestedRoot = path.join(workDir, 'a', 'b', 'dissonance');
    const manager = new TempFileManager({ rootDir: nestedRoot });

    await manager.ensureRootDir();
    await manager.ensureRootDir();

    expect((await fs.stat(nestedRoot)).isDirectory()).toBe(true);
  });
});

describe('TempFileManager.isUnderRoot', () => {
  it('accepts a file inside the root or a subfolder of it', () => {
    const manager = new TempFileManager({ rootDir });

    expect(manager.isUnderRoot(path.join(rootDir, 'out.wav'))).toBe(true);
    expect(manager.isUnderRoot(path.join(rootDir, 'nested', 'out.wav'))).toBe(true);
  });

  it.each([
    ['a user file outside the root', () => path.join(userDir, 'song.wav')],
    ['a sibling folder sharing the root name as a prefix', () => `${rootDir}-evil/out.wav`],
    ['a path that climbs out of the root with ..', () => `${rootDir}/../user/song.wav`],
    ['the root folder itself', () => rootDir],
    ['an empty path', () => ''],
    ['no path', () => undefined],
  ])('refuses %s', (_label, makePath) => {
    const manager = new TempFileManager({ rootDir });

    expect(manager.isUnderRoot(makePath())).toBeFalsy();
  });
});

describe('TempFileManager.cleanupTempFile — root checks', () => {
  it('never deletes an untracked user file outside the root', async () => {
    const manager = new TempFileManager({ rootDir });
    const userFile = await writeFile(path.join(userDir, 'song.wav'));

    await manager.cleanupTempFile(userFile);

    expect(await exists(userFile)).toBe(true);
  });

  it('never deletes through a sibling folder that shares the root name as a prefix', async () => {
    const manager = new TempFileManager({ rootDir });
    const lookalike = await writeFile(`${rootDir}-evil/song.wav`);

    await manager.cleanupTempFile(lookalike);

    expect(await exists(lookalike)).toBe(true);
  });

  it('never deletes a user file reached by climbing out of the root with ..', async () => {
    const manager = new TempFileManager({ rootDir });
    const userFile = await writeFile(path.join(userDir, 'song.wav'));

    await manager.cleanupTempFile(`${rootDir}/../user/song.wav`);

    expect(await exists(userFile)).toBe(true);
  });

  it('deletes an untracked leftover under the root', async () => {
    const manager = new TempFileManager({ rootDir });
    const leftover = await writeFile(path.join(rootDir, 'old-processed.wav'));

    await manager.cleanupTempFile(leftover);

    expect(await exists(leftover)).toBe(false);
  });

  it('deletes a registered file and forgets it', async () => {
    const manager = new TempFileManager({ rootDir });
    const output = await makeRegisteredOutput(manager, WINDOW_A);

    await manager.cleanupTempFile(output);

    expect(await exists(output)).toBe(false);
    expect(manager.isTracked(output)).toBe(false);
  });

  it('does not throw when the file is already gone', async () => {
    const manager = new TempFileManager({ rootDir });
    const output = manager.makeTempProcessedPath('/music/song.wav');
    manager.registerForSender(WINDOW_A, output);

    await expect(manager.cleanupTempFile(output)).resolves.toBeUndefined();
    expect(manager.isTracked(output)).toBe(false);
  });

  it('ignores an empty path', async () => {
    const manager = new TempFileManager({ rootDir });

    await expect(manager.cleanupTempFile('')).resolves.toBeUndefined();
  });
});

describe('TempFileManager — per-window files', () => {
  it('cleaning up one window removes only that window’s output', async () => {
    const manager = new TempFileManager({ rootDir });
    const outputA = await makeRegisteredOutput(manager, WINDOW_A);
    const outputB = await makeRegisteredOutput(manager, WINDOW_B);

    await manager.cleanupForSender(WINDOW_A);

    expect(await exists(outputA)).toBe(false);
    expect(await exists(outputB)).toBe(true);
    expect(manager.isTracked(outputB)).toBe(true);
  });

  it('cleaning up a window with no output, or no window id, does nothing', async () => {
    const manager = new TempFileManager({ rootDir });
    const output = await makeRegisteredOutput(manager, WINDOW_A);

    await manager.cleanupForSender(WINDOW_B);
    await manager.cleanupForSender(null);

    expect(await exists(output)).toBe(true);
  });

  it('tracks an output registered without a window id, but no window cleanup removes it', async () => {
    const manager = new TempFileManager({ rootDir });

    const output = await makeRegisteredOutput(manager, null);
    await manager.cleanupForSender(WINDOW_A);

    expect(manager.isTracked(output)).toBe(true);
    expect(await exists(output)).toBe(true);
  });

  it('ignores a registration without a path, keeping the window’s real output', async () => {
    const manager = new TempFileManager({ rootDir });
    const output = await makeRegisteredOutput(manager, WINDOW_A);

    manager.registerForSender(WINDOW_A, '');
    await manager.cleanupForSender(WINDOW_A);

    expect(manager.isTracked('')).toBe(false);
    expect(await exists(output)).toBe(false);
  });
});

describe('TempFileManager.cleanupAll', () => {
  it('deletes every registered output and forgets them all', async () => {
    const manager = new TempFileManager({ rootDir });
    const outputA = await makeRegisteredOutput(manager, WINDOW_A);
    const outputB = await makeRegisteredOutput(manager, WINDOW_B, '/music/other.wav');

    await manager.cleanupAll();

    expect(await exists(outputA)).toBe(false);
    expect(await exists(outputB)).toBe(false);
    expect(manager.isTracked(outputA)).toBe(false);
    expect(manager.isTracked(outputB)).toBe(false);
  });

  it('forgets which window owned what, so a later window cleanup touches nothing', async () => {
    const manager = new TempFileManager({ rootDir });
    const output = await makeRegisteredOutput(manager, WINDOW_A);
    await manager.cleanupAll();
    await writeFile(output);

    await manager.cleanupForSender(WINDOW_A);

    expect(await exists(output)).toBe(true);
  });

  it('still finishes when a registered file is already gone', async () => {
    const manager = new TempFileManager({ rootDir });
    const missing = manager.makeTempProcessedPath('/music/gone.wav');
    manager.registerForSender(WINDOW_A, missing);
    const present = await makeRegisteredOutput(manager, WINDOW_B);

    await manager.cleanupAll();

    expect(await exists(present)).toBe(false);
  });
});
