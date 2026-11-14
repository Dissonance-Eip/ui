import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreIpcHandlers } from '../ipcHandlers/core/CoreIpcHandlers.js';
import { TempFileManager } from '../ipcHandlers/core/TempFileManager.js';
import { FileLock } from '../ipcHandlers/core/FileLock.js';
import { makeHandlingIpc, makeWebContents } from './helpers/fakeElectron.js';

/**
 * core:process and core:cleanupProcessed against a real TempFileManager on a
 * real temp root: which processed files stay on disk as windows reprocess,
 * and which paths the cleanup channel refuses to delete.
 */
const SONG = '/music/song.wav';
const PROCESSED_AUDIO = 'processed audio bytes';

let workDir;
let rootDir;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dissonance-process-test-'));
  rootDir = path.join(workDir, 'temp-root');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(workDir, { recursive: true, force: true });
});

/** An addon whose process() writes the output file where it is told to. */
function makeWritingAddon() {
  return {
    process: vi.fn(async (_input, { outputPath }) => {
      await fs.writeFile(outputPath, PROCESSED_AUDIO);
      return { processedPath: outputPath };
    }),
  };
}

function setup() {
  const ipc = makeHandlingIpc();
  const tempFileManager = new TempFileManager({ rootDir });
  new CoreIpcHandlers({
    coreAddon: makeWritingAddon(),
    tempFileManager,
    fileLock: new FileLock(),
    tagWriteCoordinator: {},
    ipc,
    dialog: {},
  }).register();
  const invokeFrom = (sender, channel, payload) => ipc.handlers.get(channel)({ sender }, payload);
  return { tempFileManager, invokeFrom };
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('core:process — one processed file per window', () => {
  it('creates the temp root on first use and writes the output inside it', async () => {
    const { invokeFrom } = setup();

    const { processedPath } = await invokeFrom(makeWebContents(), 'core:process', {
      filePath: SONG,
    });

    expect(path.dirname(processedPath)).toBe(rootDir);
    expect(await fs.readFile(processedPath, 'utf8')).toBe(PROCESSED_AUDIO);
  });

  it('deletes a window’s previous output when that window processes again', async () => {
    const { invokeFrom, tempFileManager } = setup();
    const window = makeWebContents();

    const first = await invokeFrom(window, 'core:process', { filePath: SONG });
    const second = await invokeFrom(window, 'core:process', { filePath: SONG });

    expect(await exists(first.processedPath)).toBe(false);
    expect(tempFileManager.isTracked(first.processedPath)).toBe(false);
    expect(await exists(second.processedPath)).toBe(true);
  });

  it('leaves another window’s output alone', async () => {
    const { invokeFrom } = setup();
    const windowA = makeWebContents();
    const windowB = makeWebContents();

    const fromA = await invokeFrom(windowA, 'core:process', { filePath: SONG });
    await invokeFrom(windowB, 'core:process', { filePath: SONG });
    await invokeFrom(windowB, 'core:process', { filePath: SONG });

    expect(await exists(fromA.processedPath)).toBe(true);
  });
});

describe('core:cleanupProcessed — root checks', () => {
  it('deletes a processed file the app created', async () => {
    const { invokeFrom } = setup();
    const window = makeWebContents();
    const { processedPath } = await invokeFrom(window, 'core:process', { filePath: SONG });

    const reply = await invokeFrom(window, 'core:cleanupProcessed', { processedPath });

    expect(reply).toEqual({ ok: true });
    expect(await exists(processedPath)).toBe(false);
  });

  it('never deletes a user file a renderer names, though it replies ok', async () => {
    const { invokeFrom } = setup();
    const userFile = path.join(workDir, 'song.wav');
    await fs.writeFile(userFile, 'original audio');

    const reply = await invokeFrom(makeWebContents(), 'core:cleanupProcessed', userFile);

    expect(reply).toEqual({ ok: true });
    expect(await fs.readFile(userFile, 'utf8')).toBe('original audio');
  });
});
