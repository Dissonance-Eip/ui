import { describe, it, expect, vi } from 'vitest';
import { ProcessingFlow } from '../renderer/controllers/ProcessingFlow.js';
import { AppState } from '../renderer/state/AppState.js';
import { WavMetadataService } from '../renderer/services/WavMetadataService.js';
import {
  deferred,
  settle,
  makeAnalyzeView,
  makeBridge,
  makeCompareView,
  makeLogger,
  makeScreens,
  makeTagSession,
} from './helpers/fakeRenderer.js';

const SONG = '/music/song.wav';
const OUT = '/tmp/out.wav';
const ORIGINAL_INFO = Object.freeze({ fileName: 'song.wav', tags: {} });

function makeFlow({ modes } = {}) {
  const state = new AppState();
  state.setCurrentFilePath(SONG);
  const deps = {
    api: makeBridge({ processedPath: OUT }),
    logger: makeLogger(),
    state,
    analyzeView: makeAnalyzeView({ modes }),
    compareView: makeCompareView(),
    wavMetadataService: new WavMetadataService(),
    tags: makeTagSession(),
    screens: makeScreens(),
    getOriginalInfo: () => ORIGINAL_INFO,
    resetToUpload: vi.fn(),
  };
  return { flow: new ProcessingFlow(deps), ...deps };
}

describe('ProcessingFlow.process', () => {
  it('flushes tags before the core runs, then tags the output and shows Compare', async () => {
    const { flow, api, tags, screens, compareView, state } = makeFlow();

    await flow.process();

    expect(screens.showProcessing).toHaveBeenCalled();
    expect(tags.pauseAndFlush.mock.invocationCallOrder[0]).toBeLessThan(
      api.processFile.mock.invocationCallOrder[0]
    );
    expect(tags.copyFormTo).toHaveBeenCalledWith(OUT);
    expect(state.processedFilePath).toBe(OUT);
    expect(compareView.setOriginalInfo).toHaveBeenCalledWith(ORIGINAL_INFO);
    expect(screens.showCompare).toHaveBeenCalled();
  });

  it('still shows Compare when the output’s metadata cannot be read', async () => {
    const { flow, api, screens, compareView } = makeFlow();
    api.readFileMetadata.mockRejectedValueOnce(new Error('gone'));

    await flow.process();

    expect(compareView.setProcessedInfo).toHaveBeenCalled();
    expect(screens.showCompare).toHaveBeenCalled();
  });

  it('reports an unknown error when the core gives no reason', async () => {
    const { flow, api, logger, screens } = makeFlow();
    api.processFile.mockResolvedValueOnce(null);

    await flow.process();

    expect(logger.setStatus).toHaveBeenLastCalledWith('Processing failed: Unknown error', true);
    expect(screens.showAnalyze).toHaveBeenCalled();
  });

  it('does not run the core without a mode', async () => {
    const { flow, api } = makeFlow({ modes: [] });

    await flow.process();

    expect(api.processFile).not.toHaveBeenCalled();
  });

  it('a restart invalidates the in-flight run', async () => {
    const { flow, api, screens, resetToUpload } = makeFlow();
    const reply = deferred();
    api.processFile.mockReturnValueOnce(reply.promise);

    const run = flow.process();
    await settle();
    await flow.restart();
    reply.resolve({ ok: true, processedPath: OUT });
    await run;

    expect(resetToUpload).toHaveBeenCalled();
    expect(screens.showCompare).not.toHaveBeenCalled();
  });
});

describe('ProcessingFlow.restart', () => {
  it('still resets when the tag flush fails', async () => {
    const { flow, tags, resetToUpload, logger } = makeFlow();
    tags.pauseAndFlush.mockRejectedValueOnce(new Error('disk'));

    await flow.restart();

    expect(resetToUpload).toHaveBeenCalled();
    expect(logger.setStatus).toHaveBeenLastCalledWith('Ready');
  });

  it('removes the processed temp file', async () => {
    const { flow, api, state } = makeFlow();
    state.setProcessedFilePath(OUT);

    await flow.restart();

    expect(api.cleanupProcessedFile).toHaveBeenCalledWith(OUT);
  });
});

describe('ProcessingFlow.discardProcessedFile', () => {
  it('does nothing without a processed file', () => {
    const { flow, api } = makeFlow();

    flow.discardProcessedFile();

    expect(api.cleanupProcessedFile).not.toHaveBeenCalled();
  });

  it('swallows a failed cleanup', async () => {
    const { flow, api, state } = makeFlow();
    state.setProcessedFilePath(OUT);
    api.cleanupProcessedFile.mockRejectedValueOnce(new Error('busy'));

    expect(() => flow.discardProcessedFile()).not.toThrow();
    await settle();
  });
});

describe('ProcessingFlow.exportResult', () => {
  it('resets to Upload after a successful export', async () => {
    const { flow, state, resetToUpload, logger } = makeFlow();
    state.setProcessedFilePath(OUT);

    await flow.exportResult();

    expect(state.processedFilePath).toBeNull();
    expect(resetToUpload).toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('Exported to: /out/song.wav');
  });

  it('keeps the result when the export is cancelled or fails', async () => {
    const { flow, api, state, resetToUpload, logger } = makeFlow();
    state.setProcessedFilePath(OUT);
    api.exportFile.mockResolvedValueOnce({ ok: false });

    await flow.exportResult();

    expect(state.processedFilePath).toBe(OUT);
    expect(resetToUpload).not.toHaveBeenCalled();
    expect(logger.setStatus).toHaveBeenLastCalledWith('Export failed: Unknown error', true);
  });
});
