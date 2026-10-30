import { describe, it, expect, vi } from 'vitest';
import { AnalyzeView } from '../renderer/views/AnalyzeView.js';
import { FakeElement } from './helpers/fakeDom.js';

const TAG_NAMES = ['title', 'artist', 'date', 'genre', 'comment', 'copyright', 'software'];

/** The view wired the way bootstrap.js wires it, with one input per tag. */
function makeView({ tagNames = TAG_NAMES } = {}) {
  const els = {
    selectedFileEl: new FakeElement(),
    metaDurationEl: new FakeElement(),
    metaSampleRateEl: new FakeElement(),
    metaChannelsEl: new FakeElement(),
  };
  const tagInputs = Object.fromEntries(
    tagNames.map((name) => [name, new FakeElement({ 'data-tag': name })])
  );
  const view = new AnalyzeView({ ...els, tagInputEls: Object.values(tagInputs) });
  return { view, els, tagInputs };
}

const infoText = (els) =>
  [els.metaDurationEl, els.metaSampleRateEl, els.metaChannelsEl].map((el) => el.textContent);

describe('AnalyzeView.setBasicWavInfo', () => {
  it('renders placeholders for null', () => {
    const { view, els } = makeView();

    view.setBasicWavInfo(null);

    expect(infoText(els)).toEqual(['—', '—', '—']);
  });

  it('renders placeholders for an empty object', () => {
    const { view, els } = makeView();

    view.setBasicWavInfo({});

    expect(infoText(els)).toEqual(['—', '—', '—']);
  });

  it('formats duration, sample rate and channels', () => {
    const { view, els } = makeView();

    view.setBasicWavInfo({ durationSec: 125.4, sampleRate: 44100, channels: 2 });

    expect(infoText(els)).toEqual(['2:05', '44100 Hz', '2']);
  });

  it('leaves the tag inputs alone when no tags are given', () => {
    const { view, tagInputs } = makeView();
    tagInputs.title.value = 'typed';

    view.setBasicWavInfo({ durationSec: 1 });

    expect(tagInputs.title.value).toBe('typed');
  });

  it('fills the tag inputs when tags are given', () => {
    const { view, tagInputs } = makeView();

    view.setBasicWavInfo({ tags: { title: 'Song', artist: 'Band' } });

    expect(tagInputs.title.value).toBe('Song');
    expect(tagInputs.artist.value).toBe('Band');
    expect(tagInputs.genre.value).toBe('');
  });
});

describe('AnalyzeView.setSelectedFile', () => {
  it('shows the file name and keeps the full path in the tooltip', () => {
    const { view, els } = makeView();

    view.setSelectedFile('/music/album/song.wav');

    expect(els.selectedFileEl.textContent).toBe('song.wav');
    expect(els.selectedFileEl.title).toBe('/music/album/song.wav');
  });

  it('shows the empty state without a file', () => {
    const { view, els } = makeView();

    view.setSelectedFile(null);

    expect(els.selectedFileEl.textContent).toBe('No file selected');
    expect(els.selectedFileEl.title).toBe('');
  });
});

describe('AnalyzeView tag inputs', () => {
  it('sets every field, clearing the ones missing from the tags', () => {
    const { view, tagInputs } = makeView();
    tagInputs.comment.value = 'old';

    view.setMetadataTags({ title: 'Song', software: 'DAW' });

    expect(Object.fromEntries(TAG_NAMES.map((n) => [n, tagInputs[n].value]))).toEqual({
      title: 'Song',
      artist: '',
      date: '',
      genre: '',
      comment: '',
      copyright: '',
      software: 'DAW',
    });
  });

  it('reads back the full field set, trimmed', () => {
    const { view, tagInputs } = makeView();
    tagInputs.title.value = '  Song  ';
    tagInputs.date.value = '2026';

    expect(view.getMetadataTags()).toEqual({
      title: 'Song',
      artist: '',
      date: '2026',
      genre: '',
      comment: '',
      copyright: '',
      software: '',
    });
  });

  it('reports a missing input as an empty string', () => {
    const { view } = makeView({ tagNames: ['title'] });

    expect(view.getMetadataTags()).toEqual({
      title: '',
      artist: '',
      date: '',
      genre: '',
      comment: '',
      copyright: '',
      software: '',
    });
  });

  it('snapshots the whole form when any field loses focus', () => {
    const { view, tagInputs } = makeView();
    const onBlur = vi.fn();
    view.onTagBlur(onBlur);
    tagInputs.artist.value = 'Band';

    tagInputs.artist.fire('blur');

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onBlur.mock.calls[0][0]).toMatchObject({ artist: 'Band', title: '' });
  });

  it('ignores inputs whose data-tag is not a known field', () => {
    const stray = new FakeElement({ 'data-tag': 'album' });
    stray.value = 'Record';
    const view = new AnalyzeView({ tagInputEls: [stray] });
    const onBlur = vi.fn();
    view.onTagBlur(onBlur);

    stray.fire('blur');

    expect(onBlur).not.toHaveBeenCalled();
    expect(view.getMetadataTags()).not.toHaveProperty('album');
  });

  it('listens for blur on every tag input', () => {
    const { view, tagInputs } = makeView();
    const onBlur = vi.fn();
    view.onTagBlur(onBlur);

    TAG_NAMES.forEach((name) => tagInputs[name].fire('blur'));

    expect(onBlur).toHaveBeenCalledTimes(TAG_NAMES.length);
  });
});
