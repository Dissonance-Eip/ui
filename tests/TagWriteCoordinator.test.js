import { describe, it, expect, vi } from 'vitest';
import { TagWriteCoordinator } from '../ipcHandlers/core/TagWriteCoordinator.js';
import { FileLock } from '../ipcHandlers/core/FileLock.js';

const SONG = '/music/song.wav';
const ORIGINAL_TAGS = Object.freeze({ title: 'Original', artist: 'Original', genre: '' });
const WINDOW_A = 1;
const WINDOW_B = 2;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In-memory stand-in for the core addon. writeTags replaces the whole tag
 * set like the real writeTagsToWav does, and records overlapping writes.
 */
function makeCoreAddon(initialFiles = { [SONG]: ORIGINAL_TAGS }) {
  const files = new Map(Object.entries(initialFiles));
  const stats = { inFlight: 0, maxInFlight: 0 };
  const events = [];
  const addon = {
    files,
    stats,
    events,
    readMetadata: vi.fn(async (filePath) => {
      await delay(1);
      return { ok: true, audio: { sampleRate: 44100 }, tags: { ...files.get(filePath) } };
    }),
    writeTags: vi.fn(async (filePath, tags) => {
      events.push('write');
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      await delay(5);
      files.set(filePath, { ...tags });
      stats.inFlight -= 1;
      return { ok: true };
    }),
  };
  return addon;
}

function makeNotifier(events = []) {
  return {
    beforeWrite: vi.fn(async () => {
      events.push('beforeWrite');
    }),
    afterWrite: vi.fn(() => {
      events.push('afterWrite');
    }),
  };
}

function makeCoordinator(coreAddon = makeCoreAddon(), notifier = makeNotifier(coreAddon.events)) {
  const coordinator = new TagWriteCoordinator({ coreAddon, fileLock: new FileLock(), notifier });
  return { coordinator, coreAddon, notifier };
}

describe('TagWriteCoordinator — edits from two windows on one file', () => {
  it('keeps both edits and the later stale flush does not undo either (tester 3)', async () => {
    const { coordinator, coreAddon } = makeCoordinator();
    await coordinator.readMetadata(WINDOW_A, SONG);
    await coordinator.readMetadata(WINDOW_B, SONG);

    // A edits Title; B, whose form still shows the original Title, edits Artist.
    await coordinator.writeTags(WINDOW_A, SONG, { ...ORIGINAL_TAGS, title: 'From A' });
    await coordinator.writeTags(WINDOW_B, SONG, { ...ORIGINAL_TAGS, artist: 'From B' });
    // A closes and flushes its form, which never saw B's Artist.
    await coordinator.writeTags(WINDOW_A, SONG, { ...ORIGINAL_TAGS, title: 'From A' });

    expect(coreAddon.files.get(SONG)).toEqual({
      title: 'From A',
      artist: 'From B',
      genre: '',
    });
  });

  it('does not rewrite the file when the window has no unsaved change', async () => {
    const { coordinator, coreAddon, notifier } = makeCoordinator();
    await coordinator.readMetadata(WINDOW_A, SONG);

    const result = await coordinator.writeTags(WINDOW_A, SONG, { ...ORIGINAL_TAGS });

    expect(result).toEqual({ ok: true, skipped: true });
    expect(coreAddon.writeTags).not.toHaveBeenCalled();
    expect(notifier.beforeWrite).not.toHaveBeenCalled();
  });

  it('writes the full set when the window never read the file (fresh processed output)', async () => {
    const { coordinator, coreAddon } = makeCoordinator(makeCoreAddon({ '/tmp/out.wav': {} }));

    await coordinator.writeTags(WINDOW_A, '/tmp/out.wav', { title: 'T', artist: '' });

    expect(coreAddon.files.get('/tmp/out.wav')).toEqual({ title: 'T', artist: '' });
  });

  it('never runs two writes on the same file at once', async () => {
    const { coordinator, coreAddon } = makeCoordinator();
    await coordinator.readMetadata(WINDOW_A, SONG);
    await coordinator.readMetadata(WINDOW_B, SONG);

    await Promise.all([
      coordinator.writeTags(WINDOW_A, SONG, { ...ORIGINAL_TAGS, title: 'From A' }),
      coordinator.writeTags(WINDOW_B, SONG, { ...ORIGINAL_TAGS, artist: 'From B' }),
    ]);

    expect(coreAddon.stats.maxInFlight).toBe(1);
    expect(coreAddon.files.get(SONG)).toMatchObject({ title: 'From A', artist: 'From B' });
  });

  it('pauses the other windows before writing and tells them afterwards', async () => {
    const { coordinator, coreAddon, notifier } = makeCoordinator();
    await coordinator.readMetadata(WINDOW_A, SONG);

    await coordinator.writeTags(WINDOW_A, SONG, { ...ORIGINAL_TAGS, title: 'New' });

    expect(coreAddon.events).toEqual(['beforeWrite', 'write', 'afterWrite']);
    expect(notifier.beforeWrite).toHaveBeenCalledWith(WINDOW_A, SONG);
    expect(notifier.afterWrite).toHaveBeenCalledWith(WINDOW_A, SONG);
  });

  it('falls back to the window snapshot when the current tags cannot be read', async () => {
    const { coordinator, coreAddon } = makeCoordinator();
    await coordinator.readMetadata(WINDOW_A, SONG);
    coreAddon.readMetadata.mockResolvedValueOnce({ ok: false, error: 'busy' });

    await coordinator.writeTags(WINDOW_A, SONG, { ...ORIGINAL_TAGS, title: 'New' });

    expect(coreAddon.files.get(SONG)).toEqual({ ...ORIGINAL_TAGS, title: 'New' });
  });

  it('keeps the change pending after a failed write so the next flush retries it', async () => {
    const { coordinator, coreAddon, notifier } = makeCoordinator();
    await coordinator.readMetadata(WINDOW_A, SONG);
    coreAddon.writeTags.mockResolvedValueOnce({ ok: false, error: 'disk full' });
    const edited = { ...ORIGINAL_TAGS, title: 'New' };

    await coordinator.writeTags(WINDOW_A, SONG, edited);
    await coordinator.writeTags(WINDOW_A, SONG, edited);

    expect(coreAddon.writeTags).toHaveBeenCalledTimes(2);
    expect(notifier.afterWrite).toHaveBeenCalledTimes(1);
    expect(coreAddon.files.get(SONG).title).toBe('New');
  });

  it('drops what it knew about a closed window', async () => {
    const { coordinator, coreAddon } = makeCoordinator();
    await coordinator.readMetadata(WINDOW_A, SONG);

    coordinator.forgetSender(WINDOW_A);
    await coordinator.writeTags(WINDOW_A, SONG, { ...ORIGINAL_TAGS });

    expect(coreAddon.writeTags).toHaveBeenCalledTimes(1);
  });
});
