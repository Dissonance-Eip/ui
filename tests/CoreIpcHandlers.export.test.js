import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreIpcHandlers } from '../ipcHandlers/core/CoreIpcHandlers.js';
import { TempFileManager } from '../ipcHandlers/core/TempFileManager.js';
import { makeHandlingIpc, makeWebContents } from './helpers/fakeElectron.js';

const EXPORT_CHANNEL = 'core:export';
const STATUS_CHANNEL = 'core:status';
const PROCESSED_AUDIO = 'processed audio bytes';
const SECRET = 'private key material';

let workDir;
let rootDir;
let outsideDir;
let secretPath;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dissonance-export-test-'));
  rootDir = path.join(workDir, 'temp-root');
  outsideDir = path.join(workDir, 'user');
  await fs.mkdir(rootDir);
  await fs.mkdir(outsideDir);
  secretPath = path.join(outsideDir, 'secret.txt');
  await fs.writeFile(secretPath, SECRET);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(workDir, { recursive: true, force: true });
});

function setup({ savePath = path.join(outsideDir, 'exported.wav'), canceled = false } = {}) {
  const ipc = makeHandlingIpc();
  const dialog = { showSaveDialog: vi.fn(async () => ({ canceled, filePath: savePath })) };
  const tempFileManager = new TempFileManager({ rootDir });
  new CoreIpcHandlers({
    coreAddon: {},
    tempFileManager,
    fileLock: {},
    tagWriteCoordinator: {},
    ipc,
    dialog,
  }).register();

  const sender = makeWebContents();
  const exportFile = (payload) => ipc.handlers.get(EXPORT_CHANNEL)({ sender }, payload);
  return { ipc, dialog, tempFileManager, sender, exportFile, savePath };
}

/** A processed temp file the app created itself, the way core:process does. */
async function makeTrackedTempFile(tempFileManager, senderId) {
  const processedPath = tempFileManager.makeTempProcessedPath('/music/song.wav');
  await fs.writeFile(processedPath, PROCESSED_AUDIO);
  tempFileManager.registerForSender(senderId, processedPath);
  return processedPath;
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function expectRejectedWithoutSideEffects({ result, dialog, savePath }) {
  expect(result.ok).toBe(false);
  expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  expect(await exists(savePath)).toBe(false);
  expect(await fs.readFile(secretPath, 'utf8')).toBe(SECRET);
}

describe('core:export source', () => {
  it('copies a temp file the app created to the path picked in the save dialog', async () => {
    const { dialog, tempFileManager, sender, exportFile, savePath } = setup();
    const processedPath = await makeTrackedTempFile(tempFileManager, sender.id);

    const result = await exportFile(processedPath);

    expect(result).toEqual({ ok: true, exportedPath: savePath });
    expect(dialog.showSaveDialog).toHaveBeenCalledOnce();
    expect(await fs.readFile(savePath, 'utf8')).toBe(PROCESSED_AUDIO);
    expect(await exists(processedPath)).toBe(false);
    expect(sender.send).toHaveBeenCalledWith(
      STATUS_CHANNEL,
      expect.objectContaining({ status: 'exported', exportedPath: savePath })
    );
  });

  it('still reports success when the temp file cannot be deleted afterwards', async () => {
    const { tempFileManager, sender, exportFile, savePath } = setup();
    const processedPath = await makeTrackedTempFile(tempFileManager, sender.id);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'unlink').mockRejectedValueOnce(
      Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    );

    const result = await exportFile(processedPath);

    expect(result).toEqual({ ok: true, exportedPath: savePath });
    expect(await fs.readFile(savePath, 'utf8')).toBe(PROCESSED_AUDIO);
    expect(tempFileManager.isTracked(processedPath)).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      'Could not delete a processed temp file',
      expect.objectContaining({ code: 'EPERM' })
    );
  });

  it('rejects a file the app never created', async () => {
    const { dialog, exportFile, savePath } = setup();

    const result = await exportFile(secretPath);

    await expectRejectedWithoutSideEffects({ result, dialog, savePath });
  });

  it('rejects an untracked file placed under the temp root', async () => {
    const { dialog, exportFile, savePath } = setup();
    const planted = path.join(rootDir, 'planted.wav');
    await fs.writeFile(planted, SECRET);

    const result = await exportFile(planted);

    await expectRejectedWithoutSideEffects({ result, dialog, savePath });
  });

  it('rejects a temp file once it has been exported and cleaned up', async () => {
    const { tempFileManager, sender, exportFile, dialog } = setup();
    const processedPath = await makeTrackedTempFile(tempFileManager, sender.id);
    await exportFile(processedPath);
    dialog.showSaveDialog.mockClear();

    const result = await exportFile(processedPath);

    expect(result.ok).toBe(false);
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it.each([
    ['climbs out of the temp root', () => path.join(rootDir, '..', 'user', 'secret.txt')],
    [
      'climbs out from a tracked file',
      (tracked) => path.join(tracked, '..', '..', 'user', 'secret.txt'),
    ],
    [
      'spells a tracked file with ..',
      (tracked) =>
        `${rootDir}${path.sep}..${path.sep}temp-root${path.sep}${path.basename(tracked)}`,
    ],
    ['is relative', (tracked) => path.relative(process.cwd(), tracked)],
  ])('rejects a path that %s', async (_label, makePath) => {
    const { dialog, tempFileManager, sender, exportFile, savePath } = setup();
    const tracked = await makeTrackedTempFile(tempFileManager, sender.id);

    const result = await exportFile(makePath(tracked));

    await expectRejectedWithoutSideEffects({ result, dialog, savePath });
  });

  it('rejects an untracked symlink under the temp root that points at a user file', async () => {
    const { dialog, exportFile, savePath } = setup();
    const link = path.join(rootDir, 'link.wav');
    await fs.symlink(secretPath, link);

    const result = await exportFile(link);

    await expectRejectedWithoutSideEffects({ result, dialog, savePath });
  });

  it('rejects a tracked temp file that was swapped for a symlink to a user file', async () => {
    const { dialog, tempFileManager, sender, exportFile, savePath } = setup();
    const tracked = await makeTrackedTempFile(tempFileManager, sender.id);
    await fs.unlink(tracked);
    await fs.symlink(secretPath, tracked);

    const result = await exportFile(tracked);

    await expectRejectedWithoutSideEffects({ result, dialog, savePath });
  });

  it('rejects a tracked path that is a directory', async () => {
    const { dialog, tempFileManager, sender, exportFile, savePath } = setup();
    const tracked = tempFileManager.makeTempProcessedPath('/music/song.wav');
    await fs.mkdir(tracked);
    tempFileManager.registerForSender(sender.id, tracked);

    const result = await exportFile(tracked);

    await expectRejectedWithoutSideEffects({ result, dialog, savePath });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a number', 42],
    ['an array', ['/tmp/a.wav']],
  ])('rejects a payload that is %s', async (_label, payload) => {
    const { dialog, exportFile, savePath } = setup();

    const result = await exportFile(payload);

    await expectRejectedWithoutSideEffects({ result, dialog, savePath });
  });
});

describe('core:export destination', () => {
  it('ignores a destination sent by the renderer and never writes there', async () => {
    const { dialog, tempFileManager, sender, exportFile, savePath } = setup();
    const tracked = await makeTrackedTempFile(tempFileManager, sender.id);
    const rendererDest = path.join(outsideDir, 'chosen-by-renderer.wav');

    const result = await exportFile({ processedPath: tracked, destPath: rendererDest });

    expect(result.ok).toBe(false);
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
    expect(await exists(rendererDest)).toBe(false);
    expect(await exists(savePath)).toBe(false);
    expect(await exists(tracked)).toBe(true);
  });

  it('does nothing when the save dialog is canceled', async () => {
    const { tempFileManager, sender, exportFile, savePath } = setup({ canceled: true });
    const tracked = await makeTrackedTempFile(tempFileManager, sender.id);

    const result = await exportFile(tracked);

    expect(result).toEqual({ ok: false, error: 'Export canceled' });
    expect(await exists(savePath)).toBe(false);
    expect(await exists(tracked)).toBe(true);
  });

  it.each([
    ['is relative', () => 'exported.wav'],
    ['is not a string', () => 42],
    ['is inside the temp root', () => path.join(rootDir, 'exported.wav')],
  ])('rejects a save-dialog path that %s', async (_label, makeSavePath) => {
    const savePath = makeSavePath();
    const { tempFileManager, sender, exportFile } = setup({ savePath });
    const tracked = await makeTrackedTempFile(tempFileManager, sender.id);

    const result = await exportFile(tracked);

    expect(result.ok).toBe(false);
    expect(await exists(tracked)).toBe(true);
    if (typeof savePath === 'string' && path.isAbsolute(savePath)) {
      expect(await exists(savePath)).toBe(false);
    }
  });

  it('keeps the processed file for a retry and reports an error when the copy fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const savePath = path.join(outsideDir, 'missing-folder', 'exported.wav');
    const { tempFileManager, sender, exportFile } = setup({ savePath });
    const tracked = await makeTrackedTempFile(tempFileManager, sender.id);

    const result = await exportFile(tracked);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
    expect(await exists(tracked)).toBe(true);
    expect(tempFileManager.isTracked(tracked)).toBe(true);
    const statuses = sender.send.mock.calls.filter(([channel]) => channel === STATUS_CHANNEL);
    expect(statuses.at(-1)[1]).toEqual({ status: 'error', message: 'Export failed' });
  });

  it('lets the user export over an existing file they picked, such as the original', async () => {
    const original = path.join(outsideDir, 'song.wav');
    await fs.writeFile(original, 'original audio');
    const { tempFileManager, sender, exportFile } = setup({ savePath: original });
    const tracked = await makeTrackedTempFile(tempFileManager, sender.id);

    const result = await exportFile(tracked);

    expect(result).toEqual({ ok: true, exportedPath: original });
    expect(await fs.readFile(original, 'utf8')).toBe(PROCESSED_AUDIO);
  });
});

describe('TempFileManager.isTracked', () => {
  it('only knows paths registered with it, spelled exactly', () => {
    const manager = new TempFileManager({ rootDir: '/tmp/dissonance-test' });
    const registered = manager.makeTempProcessedPath('/music/song.wav');
    manager.registerForSender(1, registered);

    expect(manager.isTracked(registered)).toBe(true);
    expect(manager.isTracked(path.join('/tmp/dissonance-test', 'other.wav'))).toBe(false);
    expect(
      manager.isTracked(`/tmp/dissonance-test/../dissonance-test/${path.basename(registered)}`)
    ).toBe(false);
    expect(manager.isTracked(undefined)).toBe(false);
    expect(manager.isTracked(42)).toBe(false);
  });

  it('forgets a path once it is cleaned up', async () => {
    const manager = new TempFileManager({ rootDir });
    const registered = manager.makeTempProcessedPath('/music/song.wav');
    manager.registerForSender(1, registered);

    await manager.cleanupTempFile(registered);

    expect(manager.isTracked(registered)).toBe(false);
  });
});
