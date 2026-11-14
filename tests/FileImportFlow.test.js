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
});
