// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzeView } from '../../../renderer/views/AnalyzeView.js';
import {
  formatDuration,
  formatSampleRate,
  formatChannels,
} from '../../../renderer/utils/wavInfoFormatters.js';

const previews = vi.hoisted(() => []);

vi.mock('../../../renderer/components/WaveformPreview.js', () => ({
  WaveformPreview: vi.fn(function WaveformPreview(options) {
    this.options = options;
    this.mount = vi.fn();
    this.unmount = vi.fn();
    this.setFile = vi.fn();
    this.pause = vi.fn();
    this.clear = vi.fn();
    this.setOnPlaybackStateChange = vi.fn();
    previews.push(this);
  }),
}));

const TAG_FIELDS = ['title', 'artist', 'date', 'genre', 'comment', 'copyright', 'software'];

function checkbox(value, label) {
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.value = value;
  if (label) el.setAttribute('data-label', label);
  return el;
}

function makeElements() {
  const make = (tag) => document.createElement(tag);
  const slider = make('input');
  slider.type = 'range';
  slider.value = '0.5';
  return {
    selectedFileEl: make('span'),
    changeFileBtn: make('button'),
    metaDurationEl: make('span'),
    metaSampleRateEl: make('span'),
    metaChannelsEl: make('span'),
    waveformEl: make('div'),
    tagTitleEl: make('input'),
    tagArtistEl: make('input'),
    tagDateEl: make('input'),
    tagGenreEl: make('input'),
    tagCommentEl: make('input'),
    tagCopyrightEl: make('input'),
    tagSoftwareEl: make('input'),
    protectionStrengthEl: slider,
    protectionStrengthValueEl: make('span'),
    processingModeEls: [
      checkbox('white_noise', 'White noise'),
      checkbox('pink_noise', 'Pink noise'),
      checkbox('spectral_gate'),
    ],
    processingModeLabelEl: make('span'),
    processBtn: make('button'),
  };
}

describe('AnalyzeView', () => {
  let els;
  let view;
  let preview;

  beforeEach(() => {
    previews.length = 0;
    els = makeElements();
    view = new AnalyzeView(els);
    [preview] = previews;
  });

  function toggleMode(index, checked) {
    els.processingModeEls[index].checked = checked;
    els.processingModeEls[index].dispatchEvent(new Event('change'));
  }

  describe('mounting', () => {
    it('mounts a 164px preview and unmounts it with the view', () => {
      expect(preview.options).toEqual({ containerEl: els.waveformEl, height: 164 });

      view.mount();
      expect(preview.mount).toHaveBeenCalledOnce();

      view.unmount();
      expect(preview.unmount).toHaveBeenCalledOnce();
    });

    it('shows the protection strength and keeps it updated while dragging', () => {
      view.mount();
      expect(els.protectionStrengthValueEl.textContent).toBe('50%');

      els.protectionStrengthEl.value = '0.8';
      els.protectionStrengthEl.dispatchEvent(new Event('input'));
      expect(els.protectionStrengthValueEl.textContent).toBe('80%');
    });

    it('reads an empty slider as 0% and skips the readout when it is missing', () => {
      const slider = { value: '', addEventListener: vi.fn(), removeEventListener: vi.fn() };
      const withEmpty = new AnalyzeView({ ...els, protectionStrengthEl: slider });
      withEmpty.mount();
      expect(els.protectionStrengthValueEl.textContent).toBe('0%');

      const noReadout = new AnalyzeView({ ...els, protectionStrengthValueEl: null });
      expect(() => noReadout.mount()).not.toThrow();
    });

    it('mounts without a slider or mode checkboxes', () => {
      const bare = new AnalyzeView({ waveformEl: els.waveformEl });

      expect(() => bare.mount()).not.toThrow();
      expect(bare.processingModeEls).toEqual([]);
    });
  });

  it('passes preview calls through to the waveform', () => {
    const cb = vi.fn();

    view.setAudioPreviewFile('/music/song.wav');
    view.pauseAudioPreview();
    view.clearAudioPreview();
    view.onPlaybackStateChange(cb);

    expect(preview.setFile).toHaveBeenCalledWith('/music/song.wav');
    expect(preview.pause).toHaveBeenCalledOnce();
    expect(preview.clear).toHaveBeenCalledOnce();
    expect(preview.setOnPlaybackStateChange).toHaveBeenCalledWith(cb);
  });

  describe('file chip', () => {
    it('shows the file name with the full path on hover', () => {
      view.setSelectedFile('/Users/luca/music/song.wav');

      expect(els.selectedFileEl.textContent).toBe('song.wav');
      expect(els.selectedFileEl.title).toBe('/Users/luca/music/song.wav');
    });

    it('shows a placeholder when no file is selected', () => {
      view.setSelectedFile(null);

      expect(els.selectedFileEl.textContent).toBe('No file selected');
      expect(els.selectedFileEl.title).toBe('');
    });

    it('does nothing without the chip element', () => {
      expect(() => new AnalyzeView({}).setSelectedFile('/song.wav')).not.toThrow();
    });
  });

  describe('WAV info and tags', () => {
    it('fills in the info panel and the tag form', () => {
      view.setBasicWavInfo({
        durationSec: 186,
        sampleRate: 44100,
        channels: 2,
        tags: { title: 'Song', artist: 'Luca' },
      });

      expect(els.metaDurationEl.textContent).toBe(formatDuration(186));
      expect(els.metaSampleRateEl.textContent).toBe(formatSampleRate(44100));
      expect(els.metaChannelsEl.textContent).toBe(formatChannels(2));
      expect(els.tagTitleEl.value).toBe('Song');
      expect(els.tagArtistEl.value).toBe('Luca');
      expect(els.tagGenreEl.value).toBe('');
    });

    it('shows placeholders without touching the tag form when there is no info', () => {
      els.tagTitleEl.value = 'Keep me';

      view.setBasicWavInfo(null);

      expect(els.metaDurationEl.textContent).toBe(formatDuration(undefined));
      expect(els.tagTitleEl.value).toBe('Keep me');
    });

    it('clears the form when given no tags, and skips missing inputs', () => {
      els.tagTitleEl.value = 'Old';
      view.setMetadataTags();
      expect(els.tagTitleEl.value).toBe('');

      const bare = new AnalyzeView({});
      expect(() => {
        bare.setBasicWavInfo({ tags: { title: 'Song' } });
        bare.setMetadataTags({ title: 'Song' });
      }).not.toThrow();
    });

    it('reports the full, trimmed tag set, with missing inputs as empty strings', () => {
      els.tagTitleEl.value = '  Song  ';
      els.tagDateEl.value = '2026';

      expect(view.getMetadataTags()).toEqual({
        title: 'Song',
        artist: '',
        date: '2026',
        genre: '',
        comment: '',
        copyright: '',
        software: '',
      });
      expect(new AnalyzeView({}).getMetadataTags()).toEqual(
        Object.fromEntries(TAG_FIELDS.map((name) => [name, '']))
      );
    });

    it('reports the tag set whenever a field loses focus', () => {
      const onBlur = vi.fn();
      view.onTagBlur(onBlur);

      els.tagArtistEl.value = 'Luca';
      els.tagArtistEl.dispatchEvent(new Event('blur'));
      els.tagSoftwareEl.dispatchEvent(new Event('blur'));

      expect(onBlur).toHaveBeenCalledTimes(2);
      expect(onBlur.mock.calls[0][0].artist).toBe('Luca');
    });

    it('skips missing inputs when listening for blur', () => {
      const onBlur = vi.fn();
      const title = document.createElement('input');
      new AnalyzeView({ tagTitleEl: title }).onTagBlur(onBlur);

      title.dispatchEvent(new Event('blur'));

      expect(onBlur).toHaveBeenCalledOnce();
    });
  });

  describe('protection controls', () => {
    // A plain object stands in for the slider: a real range input replaces
    // out-of-range and non-numeric values before the view can read them.
    it.each([
      ['0.5', 0.5],
      ['1.7', 1],
      ['-0.2', 0],
      ['not a number', 0.5],
    ])('reads a slider value of %s as %s', (value, expected) => {
      const slider = { value };
      expect(new AnalyzeView({ protectionStrengthEl: slider }).getProtectionStrength()).toBe(
        expected
      );
    });

    it('defaults the strength to 0.5 without a slider', () => {
      expect(new AnalyzeView({}).getProtectionStrength()).toBe(0.5);
    });

    it('reports the checked modes', () => {
      els.processingModeEls[0].checked = true;
      els.processingModeEls[2].checked = true;

      expect(view.getProcessingModes()).toEqual(['white_noise', 'spectral_gate']);
    });

    it('labels the mode picker by what is selected', () => {
      view.mount();
      expect(els.processingModeLabelEl.textContent).toBe('Select modes');

      toggleMode(0, true);
      expect(els.processingModeLabelEl.textContent).toBe('White noise');

      toggleMode(0, false);
      toggleMode(2, true);
      expect(els.processingModeLabelEl.textContent).toBe('spectral_gate');

      toggleMode(1, true);
      expect(els.processingModeLabelEl.textContent).toBe('2 selected');
    });

    it('enables the slider only when processing is enabled and no modes are picked', () => {
      view.mount();

      view.setProcessEnabled(true);
      expect(els.processBtn.disabled).toBe(false);
      expect(els.protectionStrengthEl.disabled).toBe(false);

      toggleMode(1, true);
      expect(els.protectionStrengthEl.disabled).toBe(true);

      toggleMode(1, false);
      view.setProcessEnabled(false);
      expect(els.processBtn.disabled).toBe(true);
      expect(els.protectionStrengthEl.disabled).toBe(true);
    });

    it('updates the controls without a button, label or slider', () => {
      const bare = new AnalyzeView({ processingModeEls: [checkbox('white_noise')] });

      expect(() => bare.setProcessEnabled(true)).not.toThrow();
    });
  });

  describe('buttons', () => {
    it('reports change-file and process clicks', () => {
      const onChangeFile = vi.fn();
      const onProcess = vi.fn();
      view.onChangeFile(onChangeFile);
      view.onProcess(onProcess);

      els.changeFileBtn.click();
      els.processBtn.click();

      expect(onChangeFile).toHaveBeenCalledOnce();
      expect(onProcess).toHaveBeenCalledOnce();
    });

    it('ignores click handlers when the buttons are missing', () => {
      const bare = new AnalyzeView({});

      expect(() => {
        bare.onChangeFile(vi.fn());
        bare.onProcess(vi.fn());
      }).not.toThrow();
    });
  });
});
