import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadModule } from '../../helpers/loadModule.js';

function touch(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '');
  return filePath;
}

describe('TempFileManager', () => {
  let TempFileManager;
  let tmpDir;
  let rootDir;
  let manager;

  beforeEach(() => {
    ({ TempFileManager } = loadModule('ipcHandlers/core/TempFileManager.js'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'temp-file-manager-'));
    rootDir = path.join(tmpDir, 'root');
    manager = new TempFileManager({ rootDir });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults the root to a dissonance folder in the system temp directory', () => {
    expect(new TempFileManager().rootDir).toBe(path.join(os.tmpdir(), 'dissonance'));
  });

  it('builds timestamped processed paths under the root', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);

    expect(manager.makeTempProcessedPath('/music/song.wav')).toBe(
      path.join(rootDir, 'song-processed-1234.wav')
    );
    expect(manager.makeTempProcessedPath('/music/take.flac')).toBe(
      path.join(rootDir, 'take-processed-1234.wav')
    );
    expect(manager.makeTempProcessedPath('/music/demo')).toBe(
      path.join(rootDir, 'demo-processed-1234.wav')
    );
  });

  it('creates the root directory on demand', async () => {
    await manager.ensureRootDir();

    expect(fs.statSync(rootDir).isDirectory()).toBe(true);
  });

  it('deletes the file registered for a renderer', async () => {
    const file = touch(path.join(rootDir, 'a.wav'));
    manager.registerForSender(7, file);

    await manager.cleanupForSender(7);

    expect(fs.existsSync(file)).toBe(false);
    expect(manager.tempFiles.size).toBe(0);
    expect(manager.tempFileBySenderId.size).toBe(0);
  });

  it('ignores cleanup for a missing or unknown renderer', async () => {
    const file = touch(path.join(rootDir, 'a.wav'));
    manager.registerForSender(7, file);

    await manager.cleanupForSender(undefined);
    await manager.cleanupForSender(99);

    expect(fs.existsSync(file)).toBe(true);
  });

  it('ignores registrations without a path, and tracks files without a renderer', () => {
    manager.registerForSender(1, '');
    expect(manager.tempFiles.size).toBe(0);

    manager.registerForSender(null, '/tmp/x.wav');
    expect(manager.tempFiles.has('/tmp/x.wav')).toBe(true);
    expect(manager.tempFileBySenderId.size).toBe(0);
  });

  it('treats only paths strictly inside the root as under the root', () => {
    expect(manager.isUnderRoot(path.join(rootDir, 'a.wav'))).toBeTruthy();
    expect(manager.isUnderRoot(path.join(tmpDir, 'outside.wav'))).toBeFalsy();
    expect(manager.isUnderRoot(rootDir)).toBeFalsy();
    expect(manager.isUnderRoot('')).toBe(false);
    expect(manager.isUnderRoot({ not: 'a path' })).toBe(false);
  });

  it('refuses to delete untracked files outside the root', async () => {
    const userFile = touch(path.join(tmpDir, 'user-song.wav'));

    await manager.cleanupTempFile(userFile);

    expect(fs.existsSync(userFile)).toBe(true);
  });

  it('deletes tracked files anywhere and untracked files under the root', async () => {
    const tracked = touch(path.join(tmpDir, 'tracked.wav'));
    const stray = touch(path.join(rootDir, 'stray.wav'));
    const other = path.join(rootDir, 'other.wav');
    manager.registerForSender(1, tracked);
    manager.registerForSender(2, other);

    await manager.cleanupTempFile(tracked);
    await manager.cleanupTempFile(stray);

    expect(fs.existsSync(tracked)).toBe(false);
    expect(fs.existsSync(stray)).toBe(false);
    expect(manager.tempFileBySenderId.has(1)).toBe(false);
    expect(manager.tempFileBySenderId.get(2)).toBe(other);
  });

  it('ignores empty paths and files that are already gone', async () => {
    await expect(manager.cleanupTempFile('')).resolves.toBeUndefined();
    await expect(manager.safeUnlink('')).resolves.toBeUndefined();
    await expect(
      manager.cleanupTempFile(path.join(rootDir, 'never-created.wav'))
    ).resolves.toBeUndefined();
  });

  it('deletes every tracked file on cleanupAll()', async () => {
    const a = touch(path.join(rootDir, 'a.wav'));
    const b = touch(path.join(tmpDir, 'b.wav'));
    manager.registerForSender(1, a);
    manager.registerForSender(null, b);

    await manager.cleanupAll();

    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(false);
    expect(manager.tempFiles.size).toBe(0);
    expect(manager.tempFileBySenderId.size).toBe(0);
  });
});
