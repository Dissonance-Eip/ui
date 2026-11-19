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
    alertMessage: { show: vi.fn(), clear: vi.fn() },
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

describe('FileImportFlow — refusing a file that is not a WAV', () => {
  const REFUSAL = 'Only WAV files are supported. "track.mp3" was not imported.';

  function expectRefused({ api, tags, discardProcessedFile, screens, logger, alertMessage }) {
    expect(alertMessage.show).toHaveBeenCalledWith(REFUSAL);
    expect(logger.setStatus).toHaveBeenCalledWith(REFUSAL, true);
    expect(tags.pauseAndFlush).not.toHaveBeenCalled();
    expect(discardProcessedFile).not.toHaveBeenCalled();
    expect(screens.showAnalyze).not.toHaveBeenCalled();
    expect(api.readFileMetadata).not.toHaveBeenCalled();
  }

  it('importFile refuses it and touches nothing', async () => {
    const deps = makeFlow();

    await deps.flow.importFile(MP3, 'Dropped');

    expectRefused(deps);
    expect(deps.state.currentFilePath).toBeNull();
  });

  it('keeps the shown file, its output and its tag edits on Analyze', async () => {
    const deps = makeFlow();
    await deps.flow.importFile(SONG, 'Dropped');
    await settle();
    for (const spy of [
      deps.tags.pauseAndFlush,
      deps.discardProcessedFile,
      deps.screens.showAnalyze,
    ])
      spy.mockClear();
    deps.api.readFileMetadata.mockClear();

    await deps.flow.importFile(MP3, 'Selected');

    expectRefused(deps);
    expect(deps.state.currentFilePath).toBe(SONG);
  });

  it('a window drop of an MP3 is refused', async () => {
    const deps = makeFlow();
    deps.api.getPathForFile.mockReturnValueOnce(MP3);

    deps.flow.handleWindowDrop(makeDragEvent([{ name: 'track.mp3' }]));
    await settle();

    expectRefused(deps);
  });

  it('"Change file" picking an MP3 is refused', async () => {
    const deps = makeFlow();
    deps.api.openFile.mockResolvedValueOnce(MP3);

    await deps.flow.changeFile();
    await settle();

    expectRefused(deps);
  });

  it('a WAV imported next clears the message', async () => {
    const { flow, alertMessage } = makeFlow();
    await flow.importFile(MP3, 'Dropped');

    await flow.importFile(SONG, 'Dropped');

    expect(alertMessage.clear).toHaveBeenCalled();
  });

  it('works without an alert message', async () => {
    const deps = makeFlow();
    const bare = new FileImportFlow({ ...deps, alertMessage: undefined });

    await expect(bare.importFile(MP3, 'Dropped')).resolves.toBeUndefined();
    expect(deps.logger.setStatus).toHaveBeenCalledWith(REFUSAL, true);
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
    const { flow, alertMessage } = makeFlow();

    flow.clear();

    expect(alertMessage.clear).toHaveBeenCalled();
  });
});
