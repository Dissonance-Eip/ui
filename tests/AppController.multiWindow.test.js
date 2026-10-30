import { describe, it, expect, vi } from 'vitest';
import { AppController } from '../renderer/controllers/AppController.js';
import { AppState } from '../renderer/state/AppState.js';
import { WavMetadataService } from '../renderer/services/WavMetadataService.js';

const SONG = '/music/song.wav';
const OTHER = '/music/other.wav';

function makeController({ currentFilePath = SONG, processedFilePath = null } = {}) {
  const calls = [];
  const record = (name) => vi.fn(() => calls.push(name));
  const api = {
    writeTags: vi.fn(async () => {
      calls.push('writeTags');
      return { ok: true };
    }),
    readFileMetadata: vi.fn(async () => {
      calls.push('readFileMetadata');
      return { ok: true, audio: { sampleRate: 44100 }, tags: { title: 'From B' } };
    }),
  };
  const analyzeView = {
    pauseAudioPreview: record('analyze.pause'),
    getMetadataTags: vi.fn(() => ({ title: 'Mine' })),
    setBasicWavInfo: record('analyze.setBasicWavInfo'),
    setAudioPreviewFile: record('analyze.reloadPlayer'),
  };
  const compareView = {
    pauseAudioPreviews: record('compare.pause'),
    setOriginalAudioPreviewFile: record('compare.reloadOriginalPlayer'),
  };
  const state = new AppState();
  state.setCurrentFilePath(currentFilePath);
  state.setProcessedFilePath(processedFilePath);

  const controller = new AppController({
    api,
    logger: { log: vi.fn(), setStatus: vi.fn(), error: vi.fn() },
    router: { show: vi.fn() },
    state,
    uploadView: {},
    analyzeView,
    compareView,
    headerEl: null,
    restartBtn: null,
    wavMetadataService: new WavMetadataService(),
  });
  return { controller, api, analyzeView, compareView, calls };
}

describe('AppController — another window is about to rewrite a file', () => {
  it('pauses every player showing that file', () => {
    const { controller, analyzeView, compareView } = makeController();

    controller.pauseIfShowing(SONG);

    expect(analyzeView.pauseAudioPreview).toHaveBeenCalled();
    expect(compareView.pauseAudioPreviews).toHaveBeenCalled();
  });

  it('leaves playback alone for a file this window is not showing', () => {
    const { controller, analyzeView, compareView } = makeController();

    controller.pauseIfShowing(OTHER);

    expect(analyzeView.pauseAudioPreview).not.toHaveBeenCalled();
    expect(compareView.pauseAudioPreviews).not.toHaveBeenCalled();
  });
});

describe('AppController — another window rewrote a file', () => {
  it('saves its own edits, re-reads the tags, then reloads the player', async () => {
    const { controller, calls, api, analyzeView } = makeController();

    await controller.refreshAfterWriteElsewhere(SONG);

    expect(api.writeTags).toHaveBeenCalledWith(SONG, { title: 'Mine' });
    const order = ['writeTags', 'readFileMetadata', 'analyze.reloadPlayer'].map((name) =>
      calls.indexOf(name)
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order).not.toContain(-1);
    expect(analyzeView.setBasicWavInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: { title: 'From B' } })
    );
    expect(analyzeView.setAudioPreviewFile).toHaveBeenCalledWith(SONG);
  });

  it('also reloads the original player on the compare screen', async () => {
    const { controller, compareView } = makeController({ processedFilePath: '/tmp/out.wav' });

    await controller.refreshAfterWriteElsewhere(SONG);

    expect(compareView.setOriginalAudioPreviewFile).toHaveBeenCalledWith(SONG);
  });

  it('does not reload the compare player when no processed result is shown', async () => {
    const { controller, compareView } = makeController();

    await controller.refreshAfterWriteElsewhere(SONG);

    expect(compareView.setOriginalAudioPreviewFile).not.toHaveBeenCalled();
  });

  it('ignores files this window is not showing', async () => {
    const { controller, api, analyzeView } = makeController();

    await controller.refreshAfterWriteElsewhere(OTHER);

    expect(api.writeTags).not.toHaveBeenCalled();
    expect(api.readFileMetadata).not.toHaveBeenCalled();
    expect(analyzeView.setAudioPreviewFile).not.toHaveBeenCalled();
  });
});

describe('AppController — refresh failures', () => {
  it('logs instead of throwing when the re-read fails', async () => {
    const { controller } = makeController();
    controller._readFileMetadata = vi.fn(() => Promise.reject(new Error('gone')));

    await expect(controller.refreshAfterWriteElsewhere(SONG)).resolves.toBeUndefined();
    expect(controller.logger.error).toHaveBeenCalled();
  });
});
