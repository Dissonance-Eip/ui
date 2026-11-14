import { describe, it, expect, vi } from 'vitest';
import { createCoreSetup } from '../ipcHandlers/core/coreSetup.js';
import { IpcChannels } from '../ipcHandlers/ipcChannels.js';
import {
  PAUSE_FILE_REQUEST_CHANNEL,
  PAUSE_FILE_DONE_CHANNEL,
  TAGS_WRITTEN_ELSEWHERE_CHANNEL,
} from '../ipcHandlers/core/OtherWindowsNotifier.js';
import { makeHandlingIpc, makeAnsweringWebContents } from './helpers/fakeElectron.js';

const SONG = '/music/song.wav';
const CORE_CHANNELS = [
  IpcChannels.CORE_CLEANUP_PROCESSED,
  IpcChannels.CORE_PROCESS,
  IpcChannels.CORE_READ_METADATA,
  IpcChannels.CORE_WRITE_TAGS,
  IpcChannels.CORE_EXPORT,
];

function makeAddon(tags = { title: 'Old' }) {
  return {
    readMetadata: vi.fn(async () => ({ ok: true, tags: { ...tags } })),
    writeTags: vi.fn(async () => ({ ok: true })),
  };
}

/** A window whose renderer answers every pause request at once. */
function makeWindow(ipc) {
  return {
    webContents: makeAnsweringWebContents(ipc, {
      requestChannel: PAUSE_FILE_REQUEST_CHANNEL,
      doneChannel: PAUSE_FILE_DONE_CHANNEL,
    }),
  };
}

/** Core wiring over doubles; `invoke(channel, sender, payload)` calls a registered handler. */
function makeCore({ addon = makeAddon(), loadError = null, windows = [] } = {}) {
  const ipc = makeHandlingIpc();
  const tempFileManager = { cleanupAll: vi.fn(async () => {}) };
  const addonLoader = { load: vi.fn(() => ({ addon, error: loadError })) };
  const core = createCoreSetup({ ipc, getWindows: () => windows, tempFileManager, addonLoader });
  core.registerCoreHandlers();
  const invoke = (channel, sender, payload) => ipc.handlers.get(channel)({ sender }, payload);
  return { core, ipc, addon, addonLoader, tempFileManager, invoke };
}

describe('createCoreSetup', () => {
  it('loads the addon once and registers every core channel', () => {
    const { ipc, addonLoader } = makeCore();

    expect(addonLoader.load).toHaveBeenCalledTimes(1);
    expect([...ipc.handlers.keys()].sort()).toEqual([...CORE_CHANNELS].sort());
  });

  it('answers with the load error when the addon could not be loaded', async () => {
    const { invoke } = makeCore({ addon: null, loadError: new Error('no binary') });

    const reply = await invoke(IpcChannels.CORE_READ_METADATA, { id: 1 }, SONG);

    expect(reply).toMatchObject({ ok: false, code: 'ENGINE_UNAVAILABLE', reason: 'no binary' });
  });

  it('tells the other open windows, not the writer, when tags are rewritten', async () => {
    const ipc = makeHandlingIpc();
    const writer = makeWindow(ipc);
    const other = makeWindow(ipc);
    const addon = makeAddon();
    const core = createCoreSetup({
      ipc,
      getWindows: () => [writer, other],
      tempFileManager: { cleanupAll: vi.fn() },
      addonLoader: { load: () => ({ addon, error: null }) },
    });
    core.registerCoreHandlers();
    const writeTags = ipc.handlers.get(IpcChannels.CORE_WRITE_TAGS);

    await writeTags({ sender: writer.webContents }, { filePath: SONG, tags: { title: 'New' } });

    expect(other.webContents.send).toHaveBeenCalledWith(TAGS_WRITTEN_ELSEWHERE_CHANNEL, {
      filePath: SONG,
    });
    expect(writer.webContents.send).not.toHaveBeenCalled();
  });

  it("forgets a released window's tags, so the same form is written again", async () => {
    const { core, addon, invoke } = makeCore();
    const sender = { id: 7 };
    await invoke(IpcChannels.CORE_READ_METADATA, sender, SONG);
    const unchanged = await invoke(IpcChannels.CORE_WRITE_TAGS, sender, {
      filePath: SONG,
      tags: { title: 'Old' },
    });

    core.releaseCoreWindow(sender.id);
    await invoke(IpcChannels.CORE_WRITE_TAGS, sender, { filePath: SONG, tags: { title: 'Old' } });

    expect(unchanged).toEqual({ ok: true, skipped: true });
    expect(addon.writeTags).toHaveBeenCalledTimes(1);
  });

  it('deletes every temp file on cleanup', async () => {
    const { core, tempFileManager } = makeCore();

    await core.cleanupAllTempFiles();

    expect(tempFileManager.cleanupAll).toHaveBeenCalledTimes(1);
  });
});
