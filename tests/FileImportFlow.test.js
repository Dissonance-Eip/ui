import { describe, it, expect, vi } from 'vitest';
import { FileImportFlow } from '../renderer/controllers/FileImportFlow.js';
import { AppState } from '../renderer/state/AppState.js';
import { WavMetadataService } from '../renderer/services/WavMetadataService.js';
import {
  deferred,
  settle,
  metadataReply,
  makeAnalyzeView,
  makeBridge,
  makeCompareView,
  makeDragEvent,
  makeLogger,
  makeScreens,
  makeTagSession,
  makeUploadView,
} from './helpers/fakeRenderer.js';

const SONG = '/music/song.wav';
const OTHER = '/music/other.wav';
const MP3 = '/music/track.mp3';
const TAGS = Object.freeze({ title: 'Song' });

function makeFlow() {
  const deps = {
    api: makeBridge(),
    logger: makeLogger(),
    state: new AppState(),
    analyzeView: makeAnalyzeView(),
    compareView: makeCompareView(),
    wavMetadataService: new WavMetadataService(),
    tags: makeTagSession(),
    screens: makeScreens(),
    discardProcessedFile: vi.fn(),
    uploadView: makeUploadView(),
  };
  return { flow: new FileImportFlow(deps), ...deps };
}

describe('FileImportFlow.importFile', () => {
  it('flushes the old file, drops its output, then shows the new file', async () => {
    const { flow, tags, discardProcessedFile, state, screens } = makeFlow();

    await flow.importFile(SONG, 'Dropped');

    expect(tags.pauseAndFlush).toHaveBeenCalled();
    expect(discardProcessedFile).toHaveBeenCalled();
    expect(tags.pauseAndFlush.mock.invocationCallOrder[0]).toBeLessThan(
      discardProcessedFile.mock.invocationCallOrder[0]
    );
    expect(state.currentFilePath).toBe(SONG);
    expect(tags.setFormFill).toHaveBeenCalledWith(SONG, { loaded: false, tags: {} });
    expect(screens.showAnalyze).toHaveBeenCalled();
  });

  it('records the read tags as the loaded form fill', async () => {
    const { flow, api, tags } = makeFlow();
    api.readFileMetadata.mockResolvedValueOnce(metadataReply(TAGS));

    await flow.importFile(SONG, 'Dropped');
    await settle();

    expect(tags.setFormFill).toHaveBeenLastCalledWith(SONG, { loaded: true, tags: TAGS });
    expect(flow.originalInfo).toEqual(expect.objectContaining({ tags: TAGS }));
  });

  it('drops a reply that arrives after another file was imported', async () => {
    const { flow, api, tags, logger } = makeFlow();
    const first = deferred();
    api.readFileMetadata.mockReturnValueOnce(first.promise);

    await flow.importFile(SONG, 'Dropped');
    await flow.importFile(OTHER, 'Dropped');
    first.resolve(metadataReply(TAGS));
    await settle();

    expect(tags.setFormFill).not.toHaveBeenCalledWith(SONG, { loaded: true, tags: TAGS });
    expect(logger.log).toHaveBeenCalledWith(
      `Ignoring metadata for ${SONG} — another file is shown now`
    );
  });

  it('stays quiet about a stale read that fails', async () => {
    const { flow, api, logger } = makeFlow();
    const first = deferred();
    api.readFileMetadata.mockReturnValueOnce(first.promise);

    await flow.importFile(SONG, 'Dropped');
    await flow.importFile(OTHER, 'Dropped');
    first.reject(new Error('late'));
    await settle();

    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('FileImportFlow — metadata errors', () => {
  it('shows a read that throws on Analyze', async () => {
    const { flow, api, analyzeView } = makeFlow();
    api.readFileMetadata.mockRejectedValueOnce(new Error('ipc down'));

    await flow.importFile(SONG, 'Dropped');
    await settle();

    expect(analyzeView.showError).toHaveBeenCalledWith('Could not read this file: ipc down');
  });

  it('shows nothing for a stale read that fails', async () => {
    const { flow, api, analyzeView } = makeFlow();
    const first = deferred();
    api.readFileMetadata.mockReturnValueOnce(first.promise);

    await flow.importFile(SONG, 'Dropped');
    await flow.importFile(OTHER, 'Dropped');
    first.resolve({ ok: false, error: 'Error: late' });
    await settle();

    expect(analyzeView.showError).not.toHaveBeenCalled();
  });
});

describe('FileImportFlow — other entry points', () => {
  it('readFileMetadata ignores an empty path', async () => {
    const { flow, api } = makeFlow();

    await flow.readFileMetadata(null);

    expect(api.readFileMetadata).not.toHaveBeenCalled();
  });

  it('changeFile imports the picked file', async () => {
    const { flow, api, state } = makeFlow();
    api.openFile.mockResolvedValueOnce(SONG);

    await flow.changeFile();
    await settle();

    expect(state.currentFilePath).toBe(SONG);
  });

  it('a window drop imports the resolved path', async () => {
    const { flow, api, state } = makeFlow();
    api.getPathForFile.mockReturnValueOnce(SONG);

    flow.handleWindowDrop(makeDragEvent([{ name: 'song.wav' }]));
    await settle();

    expect(state.currentFilePath).toBe(SONG);
  });

  it('dragover without a dataTransfer only prevents the default', () => {
    const { flow } = makeFlow();
    const event = { preventDefault: vi.fn() };

    flow.handleWindowDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('clear() forgets the shown file’s info', async () => {
    const { flow } = makeFlow();
    await flow.importFile(SONG, 'Dropped');

    flow.clear();

    expect(flow.originalInfo).toBeNull();
  });

  it('clear() hides the refusal message', () => {
    const { flow, uploadView } = makeFlow();

    flow.clear();

    expect(uploadView.clearError).toHaveBeenCalled();
  });
});

describe('FileImportFlow — refusing a file that is not a WAV', () => {
  const REFUSAL = 'Only WAV files are supported. "track.mp3" was not imported.';

  /** Imports SONG, then forgets the calls it made, so only the refusal's show. */
  async function onAnalyzeWithSong() {
    const deps = makeFlow();
    await deps.flow.importFile(SONG, 'Dropped');
    await settle();
    vi.clearAllMocks();
    return deps;
  }

  function expectRefused(deps, shownOn, notOn) {
    expect(shownOn.showError).toHaveBeenCalledWith(REFUSAL);
    expect(notOn.showError).not.toHaveBeenCalled();
    expect(deps.logger.setStatus).toHaveBeenCalledWith(REFUSAL, true);
    expect(deps.tags.pauseAndFlush).not.toHaveBeenCalled();
    expect(deps.discardProcessedFile).not.toHaveBeenCalled();
    expect(deps.screens.showAnalyze).not.toHaveBeenCalled();
    expect(deps.api.readFileMetadata).not.toHaveBeenCalled();
  }

  it('on Upload: refused there, nothing else changes', async () => {
    const deps = makeFlow();

    await deps.flow.importFile(MP3, 'Dropped');

    expectRefused(deps, deps.uploadView, deps.analyzeView);
    expect(deps.state.currentFilePath).toBeNull();
  });

  it('on Analyze: refused there, keeping the shown file, its output and its tag edits', async () => {
    const deps = await onAnalyzeWithSong();

    await deps.flow.importFile(MP3, 'Selected');

    expectRefused(deps, deps.analyzeView, deps.uploadView);
    expect(deps.state.currentFilePath).toBe(SONG);
  });

  it('a window drop of an MP3 is refused', async () => {
    const deps = makeFlow();
    deps.api.getPathForFile.mockReturnValueOnce(MP3);

    deps.flow.handleWindowDrop(makeDragEvent([{ name: 'track.mp3' }]));
    await settle();

    expectRefused(deps, deps.uploadView, deps.analyzeView);
  });

  it('"Change file" picking an MP3 is refused on Analyze', async () => {
    const deps = await onAnalyzeWithSong();
    deps.api.openFile.mockResolvedValueOnce(MP3);

    await deps.flow.changeFile();
    await settle();

    expectRefused(deps, deps.analyzeView, deps.uploadView);
  });

  it('a WAV imported next clears the Upload message', async () => {
    const { flow, uploadView } = makeFlow();
    await flow.importFile(MP3, 'Dropped');

    await flow.importFile(SONG, 'Dropped');

    expect(uploadView.clearError).toHaveBeenCalled();
  });
});
