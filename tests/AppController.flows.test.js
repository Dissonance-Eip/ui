import { describe, it, expect, vi, afterEach } from 'vitest';
import { AppController } from '../renderer/controllers/AppController.js';
import { AppState } from '../renderer/state/AppState.js';
import { WavMetadataService } from '../renderer/services/WavMetadataService.js';
import { DissonanceApi } from '../renderer/infrastructure/DissonanceApi.js';
import {
  deferred,
  settle,
  metadataReply,
  makeLogger,
  makeAnalyzeView,
  makeCompareView,
  makeUploadView,
  makeBridge,
  makeEventTarget,
  makeDragEvent,
} from './helpers/fakeRenderer.js';

/*
 * Characterisation tests: they pin how the import, process, export and
 * restart flows behave through AppController's public surface, so the
 * #114 split can be checked against them.
 */

const SONG = '/music/song.wav';
const OTHER = '/music/other.wav';
const PROCESSED = '/tmp/out.wav';
const TAGS = Object.freeze({ title: 'Song', artist: 'Band' });

function startApp({ modes } = {}) {
  const bridge = makeBridge({ processedPath: PROCESSED });
  const win = makeEventTarget();
  vi.stubGlobal('window', Object.assign(win, { dissonance: bridge }));
  const restartBtn = makeEventTarget();
  const views = {
    uploadView: makeUploadView(),
    analyzeView: makeAnalyzeView({ modes }),
    compareView: makeCompareView(),
  };
  const deps = {
    api: new DissonanceApi(bridge),
    logger: makeLogger(),
    router: { show: vi.fn() },
    state: new AppState(),
    headerEl: { hidden: false },
    restartBtn,
    wavMetadataService: new WavMetadataService(),
    ...views,
  };
  const controller = new AppController(deps);
  controller.start();
  return { controller, bridge, win, restartBtn, ...deps };
}

const lastScreen = (router) => router.show.mock.calls.at(-1)[0];
const screens = (router) => router.show.mock.calls.map(([name]) => name);

/** Imports SONG and lets its metadata read (answering TAGS) land. */
async function importSong(app) {
  app.bridge.readFileMetadata.mockResolvedValueOnce(metadataReply(TAGS));
  await app.controller.importFile(SONG, 'Dropped');
  await settle();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppController.start', () => {
  it('mounts the three views, shows Upload with the header and reports Ready', () => {
    const app = startApp();

    for (const view of [app.uploadView, app.analyzeView, app.compareView]) {
      expect(view.mount).toHaveBeenCalled();
    }
    expect(lastScreen(app.router)).toBe('upload');
    expect(app.headerEl.hidden).toBe(false);
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Ready');
  });

  it('logs core status events', () => {
    const app = startApp();

    app.bridge.listeners.onCoreStatus({ message: 'warming up' });

    expect(app.logger.log).toHaveBeenCalledWith('core:status — warming up');
  });

  it('dispose() unmounts the views and drops the core, window and DOM listeners', () => {
    const app = startApp();

    app.controller.dispose();

    for (const view of [app.uploadView, app.analyzeView, app.compareView]) {
      expect(view.unmount).toHaveBeenCalled();
    }
    for (const name of ['onCoreStatus', 'onPauseFileRequest', 'onTagsWrittenElsewhere']) {
      expect(app.bridge.unsubscribes[name]).toHaveBeenCalled();
    }
    expect(app.win.listenerCount('drop')).toBe(0);
    expect(app.win.listenerCount('dragover')).toBe(0);
    expect(app.restartBtn.listenerCount('click')).toBe(0);
  });
});

describe('AppController — quit flush subscription (#114)', () => {
  it('subscribes through DissonanceApi', () => {
    const onAppFlushRequest = vi.spyOn(DissonanceApi.prototype, 'onAppFlushRequest');

    startApp();

    expect(onAppFlushRequest).toHaveBeenCalledTimes(1);
    onAppFlushRequest.mockRestore();
  });

  it('is dropped on dispose()', () => {
    const app = startApp();

    app.controller.dispose();

    expect(app.bridge.unsubscribes.onAppFlushRequest).toHaveBeenCalled();
  });
});

describe('AppController — import flow', () => {
  it('a file from the upload view is shown on Analyze and its tags are read into the form', async () => {
    const app = startApp();
    app.bridge.readFileMetadata.mockResolvedValueOnce(metadataReply(TAGS));

    app.uploadView.callbacks.onFileImported(SONG, 'Dropped');
    await settle();

    expect(app.state.currentFilePath).toBe(SONG);
    expect(app.analyzeView.setSelectedFile).toHaveBeenCalledWith(SONG);
    expect(app.analyzeView.setAudioPreviewFile).toHaveBeenCalledWith(SONG);
    expect(app.analyzeView.setProcessEnabled).toHaveBeenLastCalledWith(true);
    expect(app.compareView.clearAudioPreviews).toHaveBeenCalled();
    expect(lastScreen(app.router)).toBe('analyze');
    expect(app.headerEl.hidden).toBe(true);
    expect(app.analyzeView.getMetadataTags()).toEqual(TAGS);
    expect(app.logger.log).toHaveBeenCalledWith(`Dropped file: ${SONG}`);
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Ready');
  });

  it('flushes the old file’s edits before switching to the new one', async () => {
    const app = startApp();
    await importSong(app);
    app.analyzeView.type('title', 'Edited');

    await app.controller.importFile(OTHER, 'Selected');

    expect(app.bridge.writeTags).toHaveBeenCalledWith(SONG, { ...TAGS, title: 'Edited' });
    expect(app.analyzeView.pauseAudioPreview).toHaveBeenCalled();
    expect(app.compareView.pauseAudioPreviews).toHaveBeenCalled();
  });

  it('cleans up the previous processed temp file on a new import', async () => {
    const app = startApp();
    await importSong(app);
    await app.controller.processCurrentFile();

    await app.controller.importFile(OTHER, 'Selected');

    expect(app.bridge.cleanupProcessedFile).toHaveBeenCalledWith(PROCESSED);
    expect(app.state.processedFilePath).toBeNull();
  });

  it('reports a failed metadata read in the status bar', async () => {
    const app = startApp();
    app.bridge.readFileMetadata.mockResolvedValueOnce({ ok: false, error: 'unreadable' });

    await app.controller.importFile(SONG, 'Dropped');
    await settle();

    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Metadata failed: unreadable', true);
  });

  it('logs a metadata read that throws', async () => {
    const app = startApp();
    app.bridge.readFileMetadata.mockRejectedValueOnce(new Error('ipc down'));

    await app.controller.importFile(SONG, 'Dropped');
    await settle();

    expect(app.logger.error).toHaveBeenCalledWith('Metadata failed: Error: ipc down');
  });
});

describe('AppController — change file from Analyze', () => {
  it('opens the dialog in the last folder and imports the pick', async () => {
    const app = startApp();
    await importSong(app);
    app.bridge.openFile.mockResolvedValueOnce(OTHER);

    await app.analyzeView.callbacks.onChangeFile();
    await settle();

    expect(app.bridge.openFile).toHaveBeenCalledWith(SONG);
    expect(app.logger.setStatus).toHaveBeenCalledWith('Opening file dialog...');
    expect(app.state.currentFilePath).toBe(OTHER);
    expect(app.logger.log).toHaveBeenCalledWith(`Selected file: ${OTHER}`);
  });

  it('keeps the current file when the dialog is cancelled', async () => {
    const app = startApp();
    await importSong(app);

    await app.analyzeView.callbacks.onChangeFile();

    expect(app.state.currentFilePath).toBe(SONG);
    expect(app.logger.log).toHaveBeenCalledWith('No file selected');
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Import canceled');
  });

  it('logs a dialog that fails', async () => {
    const app = startApp();
    app.bridge.openFile.mockRejectedValueOnce(new Error('no dialog'));

    await app.analyzeView.callbacks.onChangeFile();

    expect(app.logger.error).toHaveBeenCalledWith('Import failed: Error: no dialog');
  });
});

describe('AppController — dropping a file anywhere in the window', () => {
  it('imports the dropped file and stops the browser from navigating to it', async () => {
    const app = startApp();
    const file = { name: 'other.wav' };
    app.bridge.getPathForFile.mockReturnValueOnce(OTHER);
    const event = makeDragEvent([file]);

    app.win.fire('drop', event);
    await settle();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(app.bridge.getPathForFile).toHaveBeenCalledWith(file);
    expect(app.state.currentFilePath).toBe(OTHER);
    expect(app.logger.log).toHaveBeenCalledWith(`Dropped file: ${OTHER}`);
  });

  it('ignores a drop without files', async () => {
    const app = startApp();
    const event = makeDragEvent([]);

    app.win.fire('drop', event);
    await settle();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(app.state.currentFilePath).toBeNull();
  });

  it('ignores a dropped file with no path, without opening the dialog', async () => {
    const app = startApp();

    app.win.fire('drop', makeDragEvent([{ name: 'x.wav' }]));
    await settle();

    expect(app.state.currentFilePath).toBeNull();
    expect(app.bridge.openFile).not.toHaveBeenCalled();
  });

  it('dragover shows the copy cursor', () => {
    const app = startApp();
    const event = makeDragEvent([]);

    app.win.fire('dragover', event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });
});

describe('AppController — tag auto-save', () => {
  it('a tag blur saves the form to the shown file', async () => {
    const app = startApp();
    await importSong(app);

    app.analyzeView.callbacks.onTagBlur({ ...TAGS, title: 'Blurred' });
    await settle();

    expect(app.bridge.writeTags).toHaveBeenCalledWith(SONG, { ...TAGS, title: 'Blurred' });
  });

  it('holds the write while audio plays and saves it on pause', async () => {
    const app = startApp();
    await importSong(app);

    app.analyzeView.callbacks.onPlaybackStateChange(true);
    app.analyzeView.callbacks.onTagBlur({ ...TAGS, title: 'Blurred' });
    await settle();
    expect(app.bridge.writeTags).not.toHaveBeenCalled();

    app.analyzeView.callbacks.onPlaybackStateChange(false);
    await settle();
    expect(app.bridge.writeTags).toHaveBeenCalledWith(SONG, { ...TAGS, title: 'Blurred' });
  });

  it('a quit flush request pauses the players and saves the form', async () => {
    const app = startApp();
    await importSong(app);
    app.analyzeView.type('artist', 'New band');

    await app.bridge.listeners.onAppFlushRequest();

    expect(app.analyzeView.pauseAudioPreview).toHaveBeenCalled();
    expect(app.compareView.pauseAudioPreviews).toHaveBeenCalled();
    expect(app.bridge.writeTags).toHaveBeenCalledWith(SONG, { ...TAGS, artist: 'New band' });
  });
});

describe('AppController — process flow', () => {
  it('says so when there is no file', async () => {
    const app = startApp();

    await app.controller.processCurrentFile();

    expect(app.logger.setStatus).toHaveBeenLastCalledWith('No file to process', true);
    expect(app.bridge.processFile).not.toHaveBeenCalled();
  });

  it('needs at least one processing mode', async () => {
    const app = startApp({ modes: [] });
    await importSong(app);

    await app.controller.processCurrentFile();

    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Select at least one processing mode');
    expect(app.bridge.processFile).not.toHaveBeenCalled();
  });

  it('shows Processing, then tags the output and reveals Compare', async () => {
    const app = startApp();
    await importSong(app);
    app.analyzeView.type('title', 'Edited');
    app.router.show.mockClear();

    app.analyzeView.callbacks.onProcess();
    await settle();

    expect(screens(app.router)).toEqual(['processing', 'compare']);
    expect(app.bridge.processFile).toHaveBeenCalledWith(SONG, expect.any(Object));
    expect(app.bridge.writeTags.mock.calls).toEqual([
      [SONG, { ...TAGS, title: 'Edited' }],
      [PROCESSED, { ...TAGS, title: 'Edited' }],
    ]);
    expect(app.bridge.readFileMetadata).toHaveBeenLastCalledWith(PROCESSED);
    expect(app.state.processedFilePath).toBe(PROCESSED);
    expect(app.compareView.setOriginalInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: TAGS })
    );
    expect(app.compareView.setProcessedInfo).toHaveBeenLastCalledWith(expect.any(Object));
    expect(app.compareView.setAudioPreviewFiles).toHaveBeenCalledWith({
      originalPath: SONG,
      processedPath: PROCESSED,
    });
    expect(app.compareView.setExportEnabled).toHaveBeenLastCalledWith(true);
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Processed');
  });

  it('goes back to Analyze when the core reports a failure', async () => {
    const app = startApp();
    await importSong(app);
    app.bridge.processFile.mockResolvedValueOnce({ ok: false, error: 'bad wav' });

    await app.controller.processCurrentFile();

    expect(lastScreen(app.router)).toBe('analyze');
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Processing failed: bad wav', true);
    expect(app.state.processedFilePath).toBeNull();
  });

  it('goes back to Analyze when the core call throws', async () => {
    const app = startApp();
    await importSong(app);
    app.bridge.processFile.mockRejectedValueOnce(new Error('crashed'));

    await app.controller.processCurrentFile();

    expect(lastScreen(app.router)).toBe('analyze');
    expect(app.logger.error).toHaveBeenCalledWith('Processing failed: Error: crashed');
  });

  it('discards a result that arrives after a restart', async () => {
    const app = startApp();
    await importSong(app);
    const reply = deferred();
    app.bridge.processFile.mockReturnValueOnce(reply.promise);

    const processing = app.controller.processCurrentFile();
    await settle();
    await app.controller.restart();
    reply.resolve({ ok: true, processedPath: PROCESSED });
    await processing;

    expect(lastScreen(app.router)).toBe('upload');
    expect(app.state.processedFilePath).toBeNull();
    expect(app.compareView.setAudioPreviewFiles).not.toHaveBeenCalled();
    expect(app.logger.log).toHaveBeenCalledWith('Discarding processing result — app was restarted');
  });

  it('ignores an error that arrives after a restart', async () => {
    const app = startApp();
    await importSong(app);
    const reply = deferred();
    app.bridge.processFile.mockReturnValueOnce(reply.promise);

    const processing = app.controller.processCurrentFile();
    await settle();
    await app.controller.restart();
    reply.reject(new Error('late'));
    await processing;

    expect(lastScreen(app.router)).toBe('upload');
    expect(app.logger.error).not.toHaveBeenCalled();
  });
});

describe('AppController — export flow', () => {
  async function processedApp() {
    const app = startApp();
    await importSong(app);
    await app.controller.processCurrentFile();
    return app;
  }

  it('says so when nothing was processed', async () => {
    const app = startApp();

    await app.controller.exportProcessedFile();

    expect(app.logger.setStatus).toHaveBeenLastCalledWith('No processed file to export', true);
    expect(app.bridge.exportFile).not.toHaveBeenCalled();
  });

  it('exports from the Compare button and goes back to Upload', async () => {
    const app = await processedApp();

    await app.compareView.callbacks.onExport();

    expect(app.bridge.exportFile).toHaveBeenCalledWith(PROCESSED);
    expect(app.state.currentFilePath).toBeNull();
    expect(app.state.processedFilePath).toBeNull();
    expect(lastScreen(app.router)).toBe('upload');
    expect(app.headerEl.hidden).toBe(false);
    expect(app.analyzeView.clearAudioPreview).toHaveBeenCalled();
    expect(app.compareView.setOriginalInfo).toHaveBeenLastCalledWith(null);
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Exported');
    expect(app.bridge.cleanupProcessedFile).not.toHaveBeenCalled();
  });

  it('stays on Compare when the export fails', async () => {
    const app = await processedApp();
    app.bridge.exportFile.mockResolvedValueOnce({ ok: false, error: 'disk full' });

    await app.controller.exportProcessedFile();

    expect(lastScreen(app.router)).toBe('compare');
    expect(app.state.processedFilePath).toBe(PROCESSED);
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Export failed: disk full', true);
  });

  it('logs an export that throws', async () => {
    const app = await processedApp();
    app.bridge.exportFile.mockRejectedValueOnce(new Error('ipc down'));

    await app.controller.exportProcessedFile();

    expect(app.logger.error).toHaveBeenCalledWith('Export failed: Error: ipc down');
    expect(app.state.processedFilePath).toBe(PROCESSED);
  });
});

describe('AppController — restart', () => {
  it('the restart button saves edits, removes the temp output and resets to Upload', async () => {
    const app = startApp();
    await importSong(app);
    await app.controller.processCurrentFile();
    app.analyzeView.type('title', 'Late edit');
    app.bridge.writeTags.mockClear();

    app.restartBtn.fire('click');
    await settle();

    expect(app.bridge.writeTags).toHaveBeenCalledWith(SONG, { ...TAGS, title: 'Late edit' });
    expect(app.bridge.cleanupProcessedFile).toHaveBeenCalledWith(PROCESSED);
    expect(app.state.currentFilePath).toBeNull();
    expect(lastScreen(app.router)).toBe('upload');
    expect(app.logger.setStatus).toHaveBeenLastCalledWith('Ready');
  });

  it('a late metadata reply after a restart does not refill the form', async () => {
    const app = startApp();
    const reply = deferred();
    app.bridge.readFileMetadata.mockReturnValueOnce(reply.promise);
    await app.controller.importFile(SONG, 'Dropped');

    await app.controller.restart();
    reply.resolve(metadataReply(TAGS));
    await settle();

    expect(app.analyzeView.setBasicWavInfo).toHaveBeenLastCalledWith(null);
  });
});
