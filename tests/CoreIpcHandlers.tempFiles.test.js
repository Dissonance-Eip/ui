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
  const coreAddon = makeWritingAddon();
  new CoreIpcHandlers({
    coreAddon,
    tempFileManager,
    fileLock: new FileLock(),
    tagWriteCoordinator: {},
    ipc,
    dialog: {},
  }).register();
  const invokeFrom = (sender, channel, payload) => ipc.handlers.get(channel)({ sender }, payload);
  return { tempFileManager, invokeFrom, coreAddon };
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

describe('core:process — strength 0 is a pass-through (F27)', () => {
  const ORIGINAL = Buffer.from('RIFF original audio bytes \u0000\u0001\u00ff');

  async function readOnlyInput() {
    const input = path.join(workDir, 'song.wav');
    await fs.writeFile(input, ORIGINAL);
    await fs.chmod(input, 0o444);
    return input;
  }

  it.each([
    ['no mode', { modes: [], perturbation: 0 }],
    ['a mode', { modes: ['white_noise'], perturbation: 0 }],
  ])('copies the input byte for byte without the core, with %s', async (_label, options) => {
    const { invokeFrom, coreAddon, tempFileManager } = setup();
    const input = await readOnlyInput();

    const reply = await invokeFrom(makeWebContents(), 'core:process', { filePath: input, options });

    expect(reply.ok).toBe(true);
    expect(coreAddon.process).not.toHaveBeenCalled();
    expect((await fs.readFile(reply.processedPath)).equals(ORIGINAL)).toBe(true);
    expect(tempFileManager.isTracked(reply.processedPath)).toBe(true);
  });

  it('leaves the copy writable when the input is read-only, so tags can be written', async () => {
    const { invokeFrom } = setup();
    const input = await readOnlyInput();

    const { processedPath } = await invokeFrom(makeWebContents(), 'core:process', {
      filePath: input,
      options: { modes: [], perturbation: 0 },
    });

    await expect(fs.access(processedPath, fs.constants.W_OK)).resolves.toBeUndefined();
  });

  it('still runs the core for a non-zero strength', async () => {
    const { invokeFrom, coreAddon } = setup();

    await invokeFrom(makeWebContents(), 'core:process', {
      filePath: SONG,
      options: { modes: ['white_noise'], perturbation: 0.8 },
    });

    expect(coreAddon.process).toHaveBeenCalledTimes(1);
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
