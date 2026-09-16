// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppController } from '../../../renderer/controllers/AppController.js';
import { AppState } from '../../../renderer/state/AppState.js';
import { WavMetadataService } from '../../../renderer/services/WavMetadataService.js';

const SONG = '/music/song.wav';
const PROCESSED = '/tmp/dissonance/song-processed.wav';
const METADATA = {
  ok: true,
  audio: { sampleRate: 44100, numChannels: 2, durationSec: 186 },
  tags: { title: 'Song' },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function dragEvent(type, dataTransfer) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
}

describe('AppController', () => {
  let hooks;
  let api;
  let logger;
  let router;
  let state;
  let metadata;
  let uploadView;
  let analyzeView;
  let compareView;
  let headerEl;
  let restartBtn;
  let unsubscribeCore;
  let controllers;
  let controller;

  beforeEach(() => {
    hooks = {};
    controllers = [];
    unsubscribeCore = vi.fn();
    api = {
      openFile: vi.fn(async () => '/music/other.wav'),
      cleanupProcessedFile: vi.fn(async () => ({ ok: true })),
      readFileMetadata: vi.fn(async () => METADATA),
      processFile: vi.fn(async () => ({ ok: true, processedPath: PROCESSED })),
      writeTags: vi.fn(async () => ({ ok: true })),
      exportFile: vi.fn(async () => ({ ok: true, exportedPath: '/music/protected.wav' })),
      getPathForFile: vi.fn(() => '/music/dropped.wav'),
      onCoreStatus: vi.fn((cb) => {
        hooks.coreStatus = cb;
        return unsubscribeCore;
      }),
    };
    logger = { log: vi.fn(), error: vi.fn(), setStatus: vi.fn() };
    router = { show: vi.fn() };
    state = new AppState();
    metadata = new WavMetadataService();
    uploadView = {
      mount: vi.fn(),
      unmount: vi.fn(),
      onFileImported: vi.fn((cb) => {
        hooks.fileImported = cb;
      }),
    };
    analyzeView = {
      mount: vi.fn(),
      unmount: vi.fn(),
      onChangeFile: vi.fn((cb) => {
        hooks.changeFile = cb;
      }),
      onProcess: vi.fn((cb) => {
        hooks.process = cb;
      }),
      onTagBlur: vi.fn((cb) => {
        hooks.tagBlur = cb;
      }),
      onPlaybackStateChange: vi.fn((cb) => {
        hooks.playback = cb;
      }),
      setSelectedFile: vi.fn(),
      setBasicWavInfo: vi.fn(),
      setAudioPreviewFile: vi.fn(),
      setProcessEnabled: vi.fn(),
      pauseAudioPreview: vi.fn(),
      clearAudioPreview: vi.fn(),
      getMetadataTags: vi.fn(() => ({ title: 'Song' })),
      getProcessingModes: vi.fn(() => []),
      getProtectionStrength: vi.fn(() => 0),
    };
    compareView = {
      mount: vi.fn(),
      unmount: vi.fn(),
      onExport: vi.fn((cb) => {
        hooks.export = cb;
      }),
      setOriginalInfo: vi.fn(),
      setProcessedInfo: vi.fn(),
      setAudioPreviewFiles: vi.fn(),
      setExportEnabled: vi.fn(),
      pauseAudioPreviews: vi.fn(),
      clearAudioPreviews: vi.fn(),
    };
    headerEl = document.createElement('header');
    restartBtn = document.createElement('button');
    window.dissonance = {
      onAppFlushRequest: vi.fn((cb) => {
        hooks.flushRequest = cb;
      }),
      notifyFlushDone: vi.fn(),
    };
    controller = createController();
  });

  afterEach(() => {
    controllers.forEach((c) => c.stop());
    delete window.dissonance;
    vi.restoreAllMocks();
  });

  function createController(overrides = {}) {
    const created = new AppController({
      api,
      logger,
      router,
      state,
      uploadView,
      analyzeView,
      compareView,
      headerEl,
      restartBtn,
      wavMetadataService: metadata,
      ...overrides,
    });
    controllers.push(created);
    return created;
  }

  const lastView = () => router.show.mock.lastCall?.[0];

  describe('starting', () => {
    it('mounts the views and opens on the upload screen', () => {
      controller.start();

      for (const view of [uploadView, analyzeView, compareView]) {
        expect(view.mount).toHaveBeenCalledOnce();
      }
      expect(lastView()).toBe('upload');
      expect(headerEl.hidden).toBe(false);
      expect(analyzeView.setProcessEnabled).toHaveBeenLastCalledWith(false);
      expect(compareView.setExportEnabled).toHaveBeenLastCalledWith(false);
      expect(logger.setStatus).toHaveBeenLastCalledWith('Ready');
    });

    it('releases everything it wired up when stopped', async () => {
      controller.start();
      const restart = vi.spyOn(controller, 'restart');

      controller.stop();
      restartBtn.click();
      window.dispatchEvent(dragEvent('drop', { files: [{ name: 'dropped.wav' }] }));
      await settle();

      for (const view of [uploadView, analyzeView, compareView]) {
        expect(view.unmount).toHaveBeenCalledOnce();
      }
      expect(unsubscribeCore).toHaveBeenCalledOnce();
      expect(restart).not.toHaveBeenCalled();
      expect(api.getPathForFile).not.toHaveBeenCalled();
    });

    it('logs core status updates', () => {
      controller.start();

      hooks.coreStatus({ message: 'Processing started' });
      hooks.coreStatus({ status: 'processed' });

      expect(logger.log).toHaveBeenCalledWith('core:status — Processing started');
      expect(logger.log).toHaveBeenCalledWith('core:status — {"status":"processed"}');
    });

    it('starts without a restart button, header, or core status unsubscribe', () => {
      api.onCoreStatus.mockReturnValue(undefined);
      const bare = createController({ restartBtn: null, headerEl: null });

      expect(() => {
        bare.start();
        bare.stop();
      }).not.toThrow();
    });
  });

  describe('importing a file', () => {
    beforeEach(() => {
      controller.start();
    });

    it('shows the file on the analyze screen, then fills in its metadata', async () => {
      await controller.importFile(SONG, 'Dropped');

      expect(state.currentFilePath).toBe(SONG);
      expect(compareView.clearAudioPreviews).toHaveBeenCalled();
      expect(analyzeView.setSelectedFile).toHaveBeenCalledWith(SONG);
      expect(analyzeView.setBasicWavInfo).toHaveBeenCalledWith(metadata.toBasicInfo(SONG, null));
      expect(analyzeView.setAudioPreviewFile).toHaveBeenCalledWith(SONG);
      expect(analyzeView.setProcessEnabled).toHaveBeenCalledWith(true);
      expect(logger.log).toHaveBeenCalledWith(`Dropped file: ${SONG}`);
      expect(lastView()).toBe('analyze');
      expect(headerEl.hidden).toBe(true);

      await vi.waitFor(() =>
        expect(analyzeView.setBasicWavInfo).toHaveBeenLastCalledWith(
          metadata.toBasicInfoFromMetadata(SONG, METADATA)
        )
      );
      expect(api.readFileMetadata).toHaveBeenCalledWith(SONG);
      expect(logger.setStatus).toHaveBeenLastCalledWith('Ready');
    });

    it('saves tag edits for the previous file before switching', async () => {
      await controller.importFile(SONG, 'Selected');
      analyzeView.getMetadataTags.mockReturnValue({ title: 'Edited' });

      await controller.importFile('/music/next.wav', 'Selected');

      expect(analyzeView.pauseAudioPreview).toHaveBeenCalled();
      expect(compareView.pauseAudioPreviews).toHaveBeenCalled();
      expect(api.writeTags).toHaveBeenCalledWith(SONG, { title: 'Edited' });
    });

    it('cleans up the previous processed file, ignoring failures', async () => {
      state.setProcessedFilePath(PROCESSED);
      api.cleanupProcessedFile.mockRejectedValue(new Error('already gone'));

      await controller.importFile(SONG, 'Selected');
      await settle();

      expect(api.cleanupProcessedFile).toHaveBeenCalledWith(PROCESSED);
      expect(state.processedFilePath).toBeNull();
    });

    it.each([
      ['an error response', { ok: false, error: 'bad header' }, 'Metadata failed: bad header'],
      ['a response without audio info', { ok: true }, 'Metadata failed: Unknown error'],
      ['no response', null, 'Metadata failed: Unknown error'],
    ])('reports %s when reading metadata', async (_label, response, status) => {
      api.readFileMetadata.mockResolvedValue(response);

      await controller.importFile(SONG, 'Selected');

      await vi.waitFor(() => expect(logger.setStatus).toHaveBeenLastCalledWith(status, true));
    });

    it('reports a metadata read that throws', async () => {
      api.readFileMetadata.mockRejectedValue(new Error('IPC closed'));

      await controller.importFile(SONG, 'Selected');

      await vi.waitFor(() =>
        expect(logger.error).toHaveBeenCalledWith('Metadata failed: Error: IPC closed')
      );
    });

    it('skips reading metadata without a path', async () => {
      await controller._readFileMetadata(null);

      expect(api.readFileMetadata).not.toHaveBeenCalled();
    });

    it('imports files handed over by the upload screen', async () => {
      hooks.fileImported(SONG, 'Dropped');

      await vi.waitFor(() => expect(state.currentFilePath).toBe(SONG));
    });
  });

  describe('changing the file', () => {
    beforeEach(() => {
      controller.start();
    });

    it('imports the file picked in the dialog', async () => {
      await hooks.changeFile();

      await vi.waitFor(() => expect(state.currentFilePath).toBe('/music/other.wav'));
      expect(logger.setStatus).toHaveBeenCalledWith('Opening file dialog...');
    });

    it('reports a canceled dialog', async () => {
      api.openFile.mockResolvedValue(null);

      await hooks.changeFile();

      expect(logger.log).toHaveBeenCalledWith('No file selected');
      expect(logger.setStatus).toHaveBeenLastCalledWith('Import canceled');
      expect(state.currentFilePath).toBeNull();
    });

    it('reports a dialog failure', async () => {
      api.openFile.mockRejectedValue(new Error('denied'));

      await hooks.changeFile();

      expect(logger.error).toHaveBeenCalledWith('Import failed: Error: denied');
    });
  });

  describe('auto-saving tags', () => {
    beforeEach(() => {
      controller.start();
    });

    it('saves edits for the current file when a field loses focus', async () => {
      hooks.tagBlur({ title: 'Ignored' });
      await settle();
      expect(api.writeTags).not.toHaveBeenCalled();

      state.setCurrentFilePath(SONG);
      hooks.tagBlur({ title: 'Edited' });

      await vi.waitFor(() => expect(api.writeTags).toHaveBeenCalledWith(SONG, { title: 'Edited' }));
    });

    it('holds saves while audio plays and writes them once it stops', async () => {
      state.setCurrentFilePath(SONG);

      hooks.playback(true);
      hooks.tagBlur({ title: 'Edited' });
      await settle();
      expect(api.writeTags).not.toHaveBeenCalled();

      hooks.playback(false);
      await vi.waitFor(() => expect(api.writeTags).toHaveBeenCalledOnce());
    });

    it('reports failed saves', async () => {
      api.writeTags.mockRejectedValue(new Error('read-only'));
      state.setCurrentFilePath(SONG);

      hooks.tagBlur({ title: 'Edited' });

      await vi.waitFor(() =>
        expect(logger.log).toHaveBeenCalledWith('Auto-save tags failed: Error: read-only')
      );
    });
  });

  describe('processing', () => {
    beforeEach(async () => {
      controller.start();
      await controller.importFile(SONG, 'Selected');
      await settle();
      api.writeTags.mockClear();
    });

    it('refuses to process without a file', async () => {
      state.setCurrentFilePath(null);

      await controller.processCurrentFile();

      expect(logger.setStatus).toHaveBeenLastCalledWith('No file to process', true);
      expect(api.processFile).not.toHaveBeenCalled();
    });

    it('processes the file and shows the comparison', async () => {
      analyzeView.getMetadataTags.mockReturnValue({ title: 'Edited' });

      await hooks.process();

      expect(router.show).toHaveBeenCalledWith('processing');
      expect(api.processFile).toHaveBeenCalledWith(SONG, {});
      expect(api.writeTags).toHaveBeenCalledWith(SONG, { title: 'Edited' });
      expect(api.writeTags).toHaveBeenCalledWith(PROCESSED, { title: 'Edited' });
      expect(state.processedFilePath).toBe(PROCESSED);
      expect(api.readFileMetadata).toHaveBeenCalledWith(PROCESSED);
      expect(compareView.setOriginalInfo).toHaveBeenCalledWith(
        metadata.toBasicInfoFromMetadata(SONG, METADATA)
      );
      expect(compareView.setProcessedInfo).toHaveBeenCalledWith(
        metadata.toBasicInfoFromMetadata(PROCESSED, METADATA)
      );
      expect(compareView.setAudioPreviewFiles).toHaveBeenCalledWith({
        originalPath: SONG,
        processedPath: PROCESSED,
      });
      expect(compareView.setExportEnabled).toHaveBeenLastCalledWith(true);
      expect(logger.setStatus).toHaveBeenCalledWith('Processed');
      expect(lastView()).toBe('compare');
    });

    it.each([
      [0.2, ['white_noise']],
      [0.3, ['white_noise', 'phase_distortion']],
      [0.6, ['white_noise', 'phase_distortion', 'spectral_gate']],
      [0.9, ['white_noise', 'phase_distortion', 'spectral_gate', 'pink_noise']],
    ])('stacks modes for a slider strength of %s', async (strength, modes) => {
      analyzeView.getProtectionStrength.mockReturnValue(strength);

      await controller.processCurrentFile();

      expect(api.processFile).toHaveBeenCalledWith(SONG, { modes, perturbation: strength });
    });

    it('uses picked modes at a fixed strength instead of the slider', async () => {
      analyzeView.getProcessingModes.mockReturnValue(['pink_noise']);
      analyzeView.getProtectionStrength.mockReturnValue(0.9);

      await controller.processCurrentFile();

      expect(api.processFile).toHaveBeenCalledWith(SONG, {
        modes: ['pink_noise'],
        perturbation: 0.5,
      });
    });

    it('copes with views missing optional methods and unreadable processed metadata', async () => {
      delete analyzeView.getProcessingModes;
      delete compareView.setAudioPreviewFiles;
      api.processFile.mockImplementation(async () => {
        delete analyzeView.getMetadataTags;
        return { ok: true, processedPath: PROCESSED };
      });
      api.readFileMetadata.mockRejectedValue(new Error('unreadable'));

      await controller.processCurrentFile();

      expect(api.writeTags).toHaveBeenCalledWith(PROCESSED, {});
      expect(compareView.setProcessedInfo).toHaveBeenCalledWith(
        metadata.toBasicInfoFromMetadata(PROCESSED, {})
      );
      expect(lastView()).toBe('compare');
    });

    it('treats a failed processed metadata read as empty', async () => {
      api.readFileMetadata.mockResolvedValue({ ok: false, error: 'bad header' });

      await controller.processCurrentFile();

      expect(compareView.setProcessedInfo).toHaveBeenCalledWith(
        metadata.toBasicInfoFromMetadata(PROCESSED, {})
      );
    });

    it.each([
      ['an error response', { ok: false, error: 'bad header' }, 'bad header'],
      ['no response', null, 'Unknown error'],
      ['a response without a path', { ok: true }, 'Unknown error'],
    ])('goes back to analyze on %s', async (_label, response, message) => {
      api.processFile.mockResolvedValue(response);

      await controller.processCurrentFile();

      expect(logger.setStatus).toHaveBeenLastCalledWith(`Processing failed: ${message}`, true);
      expect(logger.log).toHaveBeenCalledWith(`Processing failed: ${message}`);
      expect(lastView()).toBe('analyze');
    });

    it('goes back to analyze when processing throws', async () => {
      api.processFile.mockRejectedValue(new Error('addon crashed'));

      await controller.processCurrentFile();

      expect(logger.error).toHaveBeenCalledWith('Processing failed: Error: addon crashed');
      expect(lastView()).toBe('analyze');
    });

    it('discards a result that arrives after a restart', async () => {
      const pending = deferred();
      api.processFile.mockReturnValue(pending.promise);

      const processing = controller.processCurrentFile();
      await vi.waitFor(() => expect(api.processFile).toHaveBeenCalled());
      await controller.restart();
      pending.resolve({ ok: true, processedPath: PROCESSED });
      await processing;

      expect(logger.log).toHaveBeenCalledWith('Discarding processing result — app was restarted');
      expect(compareView.setAudioPreviewFiles).not.toHaveBeenCalled();
      expect(lastView()).toBe('upload');
    });

    it('stays quiet about a failure that arrives after a restart', async () => {
      const pending = deferred();
      api.processFile.mockReturnValue(pending.promise);

      const processing = controller.processCurrentFile();
      await vi.waitFor(() => expect(api.processFile).toHaveBeenCalled());
      await controller.restart();
      pending.reject(new Error('addon crashed'));
      await processing;

      expect(logger.error).not.toHaveBeenCalled();
      expect(lastView()).toBe('upload');
    });
  });

  describe('exporting', () => {
    beforeEach(() => {
      controller.start();
    });

    it('refuses to export without a processed file', async () => {
      await controller.exportProcessedFile();

      expect(logger.setStatus).toHaveBeenLastCalledWith('No processed file to export', true);
      expect(api.exportFile).not.toHaveBeenCalled();
    });

    it('exports the processed file and returns to the upload screen', async () => {
      state.setCurrentFilePath(SONG);
      state.setProcessedFilePath(PROCESSED);

      await hooks.export();

      expect(api.exportFile).toHaveBeenCalledWith(PROCESSED);
      expect(state.processedFilePath).toBeNull();
      expect(state.currentFilePath).toBeNull();
      expect(logger.setStatus).toHaveBeenCalledWith('Exported');
      expect(logger.log).toHaveBeenCalledWith('Exported to: /music/protected.wav');
      expect(analyzeView.setSelectedFile).toHaveBeenLastCalledWith(null);
      expect(analyzeView.clearAudioPreview).toHaveBeenCalled();
      expect(compareView.setOriginalInfo).toHaveBeenLastCalledWith(null);
      expect(lastView()).toBe('upload');
      expect(headerEl.hidden).toBe(false);
    });

    it.each([
      ['an error response', { ok: false, error: 'disk full' }, 'disk full'],
      ['no response', null, 'Unknown error'],
    ])('reports %s', async (_label, response, message) => {
      state.setProcessedFilePath(PROCESSED);
      api.exportFile.mockResolvedValue(response);

      await controller.exportProcessedFile();

      expect(logger.setStatus).toHaveBeenLastCalledWith(`Export failed: ${message}`, true);
      expect(logger.log).toHaveBeenCalledWith(`Export failed: ${message}`);
      expect(state.processedFilePath).toBe(PROCESSED);
    });

    it('reports an export that throws', async () => {
      state.setProcessedFilePath(PROCESSED);
      api.exportFile.mockRejectedValue(new Error('IPC closed'));

      await controller.exportProcessedFile();

      expect(logger.error).toHaveBeenCalledWith('Export failed: Error: IPC closed');
    });
  });

  describe('restarting', () => {
    beforeEach(() => {
      controller.start();
      logger.setStatus.mockClear();
    });

    it('saves edits, discards the processed file and returns to upload', async () => {
      state.setCurrentFilePath(SONG);
      state.setProcessedFilePath(PROCESSED);
      api.cleanupProcessedFile.mockRejectedValue(new Error('already gone'));

      restartBtn.click();

      await vi.waitFor(() => expect(logger.setStatus).toHaveBeenLastCalledWith('Ready'));
      expect(logger.log).toHaveBeenCalledWith('Restarting');
      expect(api.writeTags).toHaveBeenCalledWith(SONG, { title: 'Song' });
      expect(api.cleanupProcessedFile).toHaveBeenCalledWith(PROCESSED);
      expect(state.currentFilePath).toBeNull();
      expect(lastView()).toBe('upload');
    });

    it('still resets when saving edits fails', async () => {
      analyzeView.pauseAudioPreview.mockImplementationOnce(() => {
        throw new Error('player gone');
      });

      await controller.restart();

      expect(lastView()).toBe('upload');
      expect(api.cleanupProcessedFile).not.toHaveBeenCalled();
    });
  });

  it('saves pending edits and confirms when the app is about to quit', async () => {
    controller.start();
    state.setCurrentFilePath(SONG);

    await hooks.flushRequest();

    expect(analyzeView.pauseAudioPreview).toHaveBeenCalled();
    expect(api.writeTags).toHaveBeenCalledWith(SONG, { title: 'Song' });
    expect(window.dissonance.notifyFlushDone).toHaveBeenCalledOnce();
  });

  describe('dropping files anywhere in the window', () => {
    beforeEach(() => {
      controller.start();
    });

    it('allows copying a file dragged over the window', () => {
      const withData = dragEvent('dragover', {});
      const withoutData = dragEvent('dragover', undefined);

      window.dispatchEvent(withData);
      window.dispatchEvent(withoutData);

      expect(withData.defaultPrevented).toBe(true);
      expect(withData.dataTransfer.dropEffect).toBe('copy');
      expect(withoutData.defaultPrevented).toBe(true);
    });

    it('imports a file dropped anywhere', async () => {
      const file = { name: 'dropped.wav' };
      const drop = dragEvent('drop', { files: [file] });

      window.dispatchEvent(drop);

      expect(drop.defaultPrevented).toBe(true);
      expect(api.getPathForFile).toHaveBeenCalledWith(file);
      await vi.waitFor(() => expect(state.currentFilePath).toBe('/music/dropped.wav'));
    });

    it.each([
      ['no data', undefined],
      ['no file list', {}],
      ['an empty file list', { files: [] }],
    ])('ignores a drop with %s', async (_label, dataTransfer) => {
      window.dispatchEvent(dragEvent('drop', dataTransfer));
      await settle();

      expect(state.currentFilePath).toBeNull();
    });

    it('uses the file path when the API cannot resolve one, and ignores pathless files', async () => {
      delete api.getPathForFile;

      window.dispatchEvent(dragEvent('drop', { files: [{ name: 'virtual.wav' }] }));
      await settle();
      expect(state.currentFilePath).toBeNull();

      window.dispatchEvent(dragEvent('drop', { files: [{ path: '/music/legacy.wav' }] }));
      await vi.waitFor(() => expect(state.currentFilePath).toBe('/music/legacy.wav'));
    });
  });

  describe('without logging', () => {
    async function runEveryPath(ctrl) {
      ctrl.start();
      hooks.coreStatus({ message: 'Processing started' });

      await ctrl.importFile(SONG, 'Selected');
      await settle();
      api.readFileMetadata.mockResolvedValueOnce({ ok: false });
      await ctrl._readFileMetadata(SONG);
      api.readFileMetadata.mockRejectedValueOnce(new Error('IPC closed'));
      await ctrl._readFileMetadata(SONG);

      api.openFile.mockResolvedValueOnce(null);
      await hooks.changeFile();
      api.openFile.mockRejectedValueOnce(new Error('denied'));
      await hooks.changeFile();

      api.writeTags.mockRejectedValueOnce(new Error('read-only'));
      hooks.tagBlur({ title: 'Edited' });
      await settle();

      api.processFile.mockResolvedValueOnce({ ok: false });
      await ctrl.processCurrentFile();
      api.processFile.mockRejectedValueOnce(new Error('addon crashed'));
      await ctrl.processCurrentFile();

      const pending = deferred();
      api.processFile.mockReturnValueOnce(pending.promise);
      const processing = ctrl.processCurrentFile();
      await settle();
      await ctrl.restart();
      pending.resolve({ ok: true, processedPath: PROCESSED });
      await processing;

      await ctrl.importFile(SONG, 'Selected');
      await settle();
      await ctrl.processCurrentFile();

      api.exportFile.mockResolvedValueOnce({ ok: false });
      await ctrl.exportProcessedFile();
      api.exportFile.mockRejectedValueOnce(new Error('IPC closed'));
      await ctrl.exportProcessedFile();
      await ctrl.exportProcessedFile();

      await ctrl.processCurrentFile();
      await ctrl.exportProcessedFile();
    }

    it.each([
      ['no logger', undefined],
      ['a logger without methods', {}],
    ])('runs every path with %s', async (_label, quietLogger) => {
      delete compareView.clearAudioPreviews;
      delete compareView.pauseAudioPreviews;
      delete compareView.setAudioPreviewFiles;
      const quiet = createController({ logger: quietLogger });

      await expect(runEveryPath(quiet)).resolves.toBeUndefined();

      expect(lastView()).toBe('upload');
      expect(api.exportFile).toHaveBeenCalledTimes(3);
    });
  });
});
