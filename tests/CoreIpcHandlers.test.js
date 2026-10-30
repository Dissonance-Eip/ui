import { describe, it, expect, vi } from 'vitest';
import { CoreIpcHandlers } from '../ipcHandlers/core/CoreIpcHandlers.js';
import { FileLock } from '../ipcHandlers/core/FileLock.js';
import { makeHandlingIpc, makeWebContents } from './helpers/fakeElectron.js';

const SONG = '/music/song.wav';
const TEMP_OUTPUT = '/tmp/dissonance/song-processed.wav';
const STATUS_CHANNEL = 'core:status';
const ENGINE_UNAVAILABLE = 'ENGINE_UNAVAILABLE';

function makeTempFileManager() {
  return {
    ensureRootDir: vi.fn(async () => {}),
    makeTempProcessedPath: vi.fn(() => TEMP_OUTPUT),
    registerForSender: vi.fn(),
    cleanupForSender: vi.fn(async () => {}),
    cleanupTempFile: vi.fn(async () => {}),
  };
}

function makeTagWriteCoordinator() {
  return {
    readMetadata: vi.fn(async () => ({ ok: true, tags: { title: 'Song' } })),
    writeTags: vi.fn(async () => ({ ok: true })),
  };
}

function makeAddon() {
  return {
    process: vi.fn(async () => ({ processedPath: TEMP_OUTPUT })),
    readMetadata: vi.fn(),
    writeTags: vi.fn(),
  };
}

function setup({ coreAddon = makeAddon(), coreLoadError = null } = {}) {
  const ipc = makeHandlingIpc();
  const tempFileManager = makeTempFileManager();
  const tagWriteCoordinator = makeTagWriteCoordinator();
  new CoreIpcHandlers({
    coreAddon,
    coreLoadError,
    tempFileManager,
    fileLock: new FileLock(),
    tagWriteCoordinator,
  }).register(ipc);
  const sender = makeWebContents();
  const invoke = (channel, payload) => ipc.handlers.get(channel)({ sender }, payload);
  return { ipc, invoke, sender, coreAddon, tempFileManager, tagWriteCoordinator };
}

const statusesSentTo = (sender) =>
  sender.send.mock.calls.filter(([channel]) => channel === STATUS_CHANNEL).map(([, p]) => p);

describe('CoreIpcHandlers — registration', () => {
  it('registers one handler per core channel on the injected ipc', () => {
    const { ipc } = setup();

    expect([...ipc.handlers.keys()].sort()).toEqual(
      [
        'core:cleanupProcessed',
        'core:export',
        'core:process',
        'core:readMetadata',
        'core:writeTags',
      ].sort()
    );
  });
});

describe('CoreIpcHandlers — core:cleanupProcessed', () => {
  it('accepts a bare path or { processedPath }', async () => {
    const { invoke, tempFileManager } = setup();

    expect(await invoke('core:cleanupProcessed', TEMP_OUTPUT)).toEqual({ ok: true });
    expect(await invoke('core:cleanupProcessed', { processedPath: TEMP_OUTPUT })).toEqual({
      ok: true,
    });
    expect(tempFileManager.cleanupTempFile).toHaveBeenCalledTimes(2);
  });

  it('rejects a missing path', async () => {
    const { invoke } = setup();

    expect(await invoke('core:cleanupProcessed', {})).toEqual({
      ok: false,
      error: 'No processed file path',
    });
  });
});

describe('CoreIpcHandlers — core:process', () => {
  it('processes into a temp path and reports processing then processed', async () => {
    const { invoke, sender, coreAddon, tempFileManager } = setup();

    const reply = await invoke('core:process', { filePath: SONG, options: { strength: 90 } });

    expect(reply).toEqual({ ok: true, processedPath: TEMP_OUTPUT });
    expect(coreAddon.process).toHaveBeenCalledWith(SONG, {
      strength: 90,
      outputPath: TEMP_OUTPUT,
    });
    expect(tempFileManager.cleanupForSender).toHaveBeenCalledWith(sender.id);
    expect(tempFileManager.registerForSender).toHaveBeenCalledWith(sender.id, TEMP_OUTPUT);
    expect(statusesSentTo(sender).map((s) => s.status)).toEqual(['processing', 'processed']);
  });

  it('checks the file path before the addon', async () => {
    const { invoke } = setup({ coreAddon: null });

    expect(await invoke('core:process', {})).toEqual({
      ok: false,
      error: 'No file path provided',
    });
  });

  it('reports a processing failure on core:status and in the reply', async () => {
    const coreAddon = makeAddon();
    coreAddon.process.mockRejectedValue(new Error('bad wav'));
    const { invoke, sender } = setup({ coreAddon });

    const reply = await invoke('core:process', { filePath: SONG });

    expect(reply).toEqual({ ok: false, error: 'Error: bad wav' });
    expect(statusesSentTo(sender).at(-1)).toMatchObject({ status: 'error' });
  });
});

describe('CoreIpcHandlers — core:readMetadata and core:writeTags', () => {
  it('delegates reads and writes to the TagWriteCoordinator with the sender id', async () => {
    const { invoke, sender, tagWriteCoordinator } = setup();

    await invoke('core:readMetadata', SONG);
    await invoke('core:writeTags', { filePath: SONG, tags: { title: 'New' } });

    expect(tagWriteCoordinator.readMetadata).toHaveBeenCalledWith(sender.id, SONG);
    expect(tagWriteCoordinator.writeTags).toHaveBeenCalledWith(sender.id, SONG, { title: 'New' });
  });

  it('defaults missing tags to an empty object', async () => {
    const { invoke, sender, tagWriteCoordinator } = setup();

    await invoke('core:writeTags', { filePath: SONG });

    expect(tagWriteCoordinator.writeTags).toHaveBeenCalledWith(sender.id, SONG, {});
  });

  it('turns a coordinator error into { ok: false }', async () => {
    const { invoke, tagWriteCoordinator } = setup();
    tagWriteCoordinator.readMetadata.mockRejectedValue(new Error('locked'));

    expect(await invoke('core:readMetadata', SONG)).toEqual({ ok: false, error: 'Error: locked' });
  });
});

describe('CoreIpcHandlers — engine unavailable', () => {
  const loadError = new Error('Core engine unavailable: bindings: not found');

  it.each([
    ['core:process', { filePath: SONG }, 'Core addon not available'],
    ['core:readMetadata', SONG, 'Core addon readMetadata not available'],
    ['core:writeTags', { filePath: SONG, tags: {} }, 'Core addon writeTags not available'],
  ])('%s keeps its error and adds a code and the load reason', async (channel, payload, error) => {
    const { invoke } = setup({ coreAddon: null, coreLoadError: loadError });

    expect(await invoke(channel, payload)).toEqual({
      ok: false,
      error,
      code: ENGINE_UNAVAILABLE,
      reason: loadError.message,
    });
  });

  it('flags a loaded addon that lacks the function, without a load reason', async () => {
    const { invoke } = setup({ coreAddon: { process: vi.fn() } });

    expect(await invoke('core:readMetadata', SONG)).toEqual({
      ok: false,
      error: 'Core addon readMetadata not available',
      code: ENGINE_UNAVAILABLE,
      reason: null,
    });
  });
});
