import { describe, it, expect, vi } from 'vitest';
import { AppController } from '../renderer/controllers/AppController.js';
import { AppState } from '../renderer/state/AppState.js';
import { WavMetadataService } from '../renderer/services/WavMetadataService.js';

const FILE_A = '/music/a.wav';
const FILE_B = '/music/b.wav';
const PROCESSED = '/tmp/out.wav';
const EMPTY_FORM = Object.freeze({ title: '', artist: '' });
const TAGS_A = Object.freeze({ title: 'Title A', artist: 'Artist A' });
const TAGS_B = Object.freeze({ title: 'Title B', artist: 'Artist B' });

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const metadataReply = (tags) => ({ ok: true, audio: { sampleRate: 44100 }, tags: { ...tags } });

/** Lets every queued microtask and promise continuation run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A tag form that behaves like AnalyzeView's: setBasicWavInfo fills it,
 * getMetadataTags reads it back with every field present, type() is the user.
 */
function makeAnalyzeView() {
  let form = { ...EMPTY_FORM };
  return {
    setBasicWavInfo: vi.fn((info) => {
      if (info && info.tags) form = { ...EMPTY_FORM, ...info.tags };
    }),
    getMetadataTags: vi.fn(() => ({ ...form })),
    type(field, value) {
      form = { ...form, [field]: value };
    },
    setSelectedFile: vi.fn(),
    setAudioPreviewFile: vi.fn(),
    setProcessEnabled: vi.fn(),
    pauseAudioPreview: vi.fn(),
    // Process needs at least one mode since the strength slider was removed (#104).
    getProcessingModes: vi.fn(() => ['white_noise']),
  };
}

function makeCompareView() {
  return {
    clearAudioPreviews: vi.fn(),
    pauseAudioPreviews: vi.fn(),
    setExportEnabled: vi.fn(),
    setOriginalInfo: vi.fn(),
    setProcessedInfo: vi.fn(),
    setAudioPreviewFiles: vi.fn(),
  };
}

/** Each readFileMetadata call stays pending until the test settles it. */
function makeApi() {
  const reads = [];
  return {
    reads,
    readFileMetadata: vi.fn((filePath) => {
      if (filePath === PROCESSED) return Promise.resolve(metadataReply({}));
      const pending = deferred();
      reads.push({ filePath, resolve: pending.resolve });
      return pending.promise;
    }),
    writeTags: vi.fn(async () => ({ ok: true })),
    processFile: vi.fn(async () => ({ ok: true, processedPath: PROCESSED })),
    cleanupProcessedFile: vi.fn(async () => {}),
  };
}

function makeController() {
  const api = makeApi();
  const analyzeView = makeAnalyzeView();
  const controller = new AppController({
    api,
    logger: { log: vi.fn(), setStatus: vi.fn(), error: vi.fn() },
    router: { show: vi.fn() },
    state: new AppState(),
    uploadView: {},
    analyzeView,
    compareView: makeCompareView(),
    headerEl: null,
    restartBtn: null,
    wavMetadataService: new WavMetadataService(),
  });
  return { controller, api, analyzeView };
}

const readFor = (api, filePath) => api.reads.filter((read) => read.filePath === filePath).at(-1);
const writesTo = (api, filePath) =>
  api.writeTags.mock.calls.filter(([path]) => path === filePath).map(([, tags]) => tags);

describe('AppController — a late metadata reply for another file (#111)', () => {
  it('import A then B quickly: A’s late reply never fills B’s form or reaches B’s file', async () => {
    const { controller, api, analyzeView } = makeController();

    await controller.importFile(FILE_A, 'Dropped');
    await controller.importFile(FILE_B, 'Dropped');
    readFor(api, FILE_B).resolve(metadataReply(TAGS_B));
    await settle();
    readFor(api, FILE_A).resolve(metadataReply(TAGS_A));
    await settle();

    expect(analyzeView.getMetadataTags()).toEqual(TAGS_B);

    analyzeView.type('title', 'Edited B');
    await controller.processCurrentFile();

    expect(writesTo(api, FILE_B)).toEqual([{ ...TAGS_B, title: 'Edited B' }]);
  });

  it('switching files before the first read returns does not write an empty form to it', async () => {
    const { controller, api } = makeController();

    await controller.importFile(FILE_A, 'Dropped');
    await controller.importFile(FILE_B, 'Dropped');

    expect(writesTo(api, FILE_A)).toEqual([]);
  });
});

describe('AppController — no tags loaded into the form (#111)', () => {
  it('read failed, then Process: leaves the original and the output untouched', async () => {
    const { controller, api } = makeController();
    await controller.importFile(FILE_A, 'Dropped');
    readFor(api, FILE_A).resolve({ ok: false, error: 'unreadable' });
    await settle();

    await controller.processCurrentFile();

    expect(api.processFile).toHaveBeenCalled();
    expect(api.writeTags).not.toHaveBeenCalled();
  });

  it('Process while the read is still pending: no empty overwrite', async () => {
    const { controller, api } = makeController();
    await controller.importFile(FILE_A, 'Dropped');

    await controller.processCurrentFile();

    expect(api.writeTags).not.toHaveBeenCalled();
  });

  it('quit flush with nothing loaded does not rewrite the file', async () => {
    const { controller, api } = makeController();
    await controller.importFile(FILE_A, 'Dropped');

    await controller._pauseAndFlushTags();

    expect(api.writeTags).not.toHaveBeenCalled();
  });

  it('still saves a field the user typed after the read failed', async () => {
    const { controller, api, analyzeView } = makeController();
    await controller.importFile(FILE_A, 'Dropped');
    readFor(api, FILE_A).resolve({ ok: false, error: 'unreadable' });
    await settle();

    analyzeView.type('title', 'Typed');
    await controller._pauseAndFlushTags();

    expect(writesTo(api, FILE_A)).toEqual([{ title: 'Typed' }]);
  });

  it('typed while the read is pending: sends only the typed field, never the empty ones', async () => {
    const { controller, api, analyzeView } = makeController();
    await controller.importFile(FILE_A, 'Dropped');

    analyzeView.type('title', 'Typed');
    await controller._pauseAndFlushTags();

    expect(writesTo(api, FILE_A)).toEqual([{ title: 'Typed' }]);
  });

  it('saves the loaded form, so a field the user really cleared is written', async () => {
    const { controller, api, analyzeView } = makeController();
    await controller.importFile(FILE_A, 'Dropped');
    readFor(api, FILE_A).resolve(metadataReply(TAGS_A));
    await settle();

    analyzeView.type('artist', '');
    await controller._pauseAndFlushTags();

    expect(writesTo(api, FILE_A)).toEqual([{ ...TAGS_A, artist: '' }]);
  });
});
