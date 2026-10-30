import { describe, it, expect, vi } from 'vitest';
import { TagEditSession } from '../renderer/controllers/TagEditSession.js';
import { AppState } from '../renderer/state/AppState.js';
import { makeAnalyzeView, makeLogger } from './helpers/fakeRenderer.js';

const SONG = '/music/song.wav';
const OUT = '/tmp/out.wav';
const TAGS = Object.freeze({ title: 'Song', artist: 'Band' });

/** A queue double that records what it is asked to do. */
function makeQueue() {
  return { enqueue: vi.fn(), setBlocked: vi.fn(), flush: vi.fn(async () => {}) };
}

function makeSession() {
  const state = new AppState();
  state.setCurrentFilePath(SONG);
  const analyzeView = makeAnalyzeView();
  const queue = makeQueue();
  const pausePreviews = vi.fn();
  const session = new TagEditSession({
    api: {},
    logger: makeLogger(),
    state,
    analyzeView,
    pausePreviews,
    queue,
  });
  return { session, state, analyzeView, queue, pausePreviews };
}

describe('TagEditSession', () => {
  it('pauseAndFlush pauses the players, queues the loaded form, then drains', async () => {
    const { session, analyzeView, queue, pausePreviews } = makeSession();
    analyzeView.setBasicWavInfo({ tags: TAGS });
    session.setFormFill(SONG, { loaded: true, tags: TAGS });

    await session.pauseAndFlush();

    expect(pausePreviews).toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith(SONG, TAGS);
    expect(queue.flush).toHaveBeenCalled();
  });

  it('queues only typed fields while the file’s tags are not loaded', () => {
    const { session, queue } = makeSession();
    session.setFormFill(SONG, { loaded: false, tags: {} });

    session.saveBlurredForm({ title: 'Typed', artist: '' });

    expect(queue.enqueue).toHaveBeenCalledWith(SONG, { title: 'Typed' });
  });

  it('queues nothing for an untouched placeholder form', () => {
    const { session, queue } = makeSession();
    session.setFormFill(SONG, { loaded: false, tags: {} });

    session.saveBlurredForm({ title: '', artist: '' });

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('ignores a form fill recorded for another file', () => {
    const { session } = makeSession();
    session.setFormFill('/music/other.wav', { loaded: true, tags: TAGS });

    expect(session.tagsToSave(SONG, { title: '', artist: '' })).toBeNull();
  });

  it('forgets the form fill once cleared', () => {
    const { session } = makeSession();
    session.setFormFill(SONG, { loaded: true, tags: TAGS });

    session.clearFormFill();

    expect(session.tagsToSave(SONG, { title: '' })).toBeNull();
  });

  it('copies the form edits to the processed output', () => {
    const { session, analyzeView, queue } = makeSession();
    analyzeView.setBasicWavInfo({ tags: TAGS });
    session.setFormFill(SONG, { loaded: true, tags: TAGS });

    session.copyFormTo(OUT);

    expect(queue.enqueue).toHaveBeenCalledWith(OUT, TAGS);
  });

  it('has nothing to save with no file shown', () => {
    const { session, state } = makeSession();
    state.setCurrentFilePath(null);

    expect(session.formTagsToSave()).toBeNull();
  });

  it('blocks the queue while playing', () => {
    const { session, queue } = makeSession();

    session.setPlaying(true);
    session.setPlaying(false);

    expect(queue.setBlocked.mock.calls).toEqual([[true], [false]]);
  });

  it('builds its queue over api.writeTags when none is given', async () => {
    const api = { writeTags: vi.fn(async () => ({ ok: true })) };
    const state = new AppState();
    state.setCurrentFilePath(SONG);
    const session = new TagEditSession({
      api,
      state,
      analyzeView: makeAnalyzeView(),
      pausePreviews: vi.fn(),
    });

    session.saveBlurredForm({ title: 'Typed' });
    await session.flush();

    expect(api.writeTags).toHaveBeenCalledWith(SONG, { title: 'Typed' });
  });
});
