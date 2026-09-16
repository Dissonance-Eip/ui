// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompareView } from '../../../renderer/views/CompareView.js';
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
    previews.push(this);
  }),
}));

function makeElements() {
  const make = (tag) => document.createElement(tag);
  return {
    origFilenameEl: make('span'),
    origDurationEl: make('span'),
    origSampleRateEl: make('span'),
    origChannelsEl: make('span'),
    origWaveformEl: make('div'),
    procFilenameEl: make('span'),
    procDurationEl: make('span'),
    procSampleRateEl: make('span'),
    procChannelsEl: make('span'),
    procWaveformEl: make('div'),
    exportBtn: make('button'),
  };
}

describe('CompareView', () => {
  let els;
  let view;
  let original;
  let processed;

  beforeEach(() => {
    previews.length = 0;
    els = makeElements();
    view = new CompareView(els);
    [original, processed] = previews;
  });

  it('creates a 140px preview for each waveform container', () => {
    expect(original.options).toEqual({ containerEl: els.origWaveformEl, height: 140 });
    expect(processed.options).toEqual({ containerEl: els.procWaveformEl, height: 140 });
  });

  it('mounts both previews and unmounts them with the view', () => {
    view.mount();
    expect(original.mount).toHaveBeenCalledOnce();
    expect(processed.mount).toHaveBeenCalledOnce();

    view.unmount();
    expect(original.unmount).toHaveBeenCalledOnce();
    expect(processed.unmount).toHaveBeenCalledOnce();
  });

  it('loads, pauses and clears the previews', () => {
    view.setAudioPreviewFiles({ originalPath: '/a.wav', processedPath: '/b.wav' });
    expect(original.setFile).toHaveBeenCalledWith('/a.wav');
    expect(processed.setFile).toHaveBeenCalledWith('/b.wav');

    view.setOriginalAudioPreviewFile('/c.wav');
    view.setProcessedAudioPreviewFile('/d.wav');
    expect(original.setFile).toHaveBeenLastCalledWith('/c.wav');
    expect(processed.setFile).toHaveBeenLastCalledWith('/d.wav');

    view.pauseAudioPreviews();
    view.clearAudioPreviews();
    for (const preview of [original, processed]) {
      expect(preview.pause).toHaveBeenCalledOnce();
      expect(preview.clear).toHaveBeenCalledOnce();
    }
  });

  it('fills in the original and processed info panels', () => {
    const info = { filename: 'song.wav', durationSec: 186, sampleRate: 44100, channels: 2 };

    view.setOriginalInfo(info);
    view.setProcessedInfo({ ...info, filename: 'song-processed.wav' });

    expect(els.origFilenameEl.textContent).toBe('song.wav');
    expect(els.origDurationEl.textContent).toBe(formatDuration(186));
    expect(els.origSampleRateEl.textContent).toBe(formatSampleRate(44100));
    expect(els.origChannelsEl.textContent).toBe(formatChannels(2));
    expect(els.procFilenameEl.textContent).toBe('song-processed.wav');
  });

  it('shows placeholders when there is no info', () => {
    view.setProcessedInfo(null);

    expect(els.procFilenameEl.textContent).toBe('—');
    expect(els.procDurationEl.textContent).toBe(formatDuration(undefined));
    expect(els.procSampleRateEl.textContent).toBe(formatSampleRate(undefined));
    expect(els.procChannelsEl.textContent).toBe(formatChannels(undefined));
  });

  it('enables export and reports clicks', () => {
    const onExport = vi.fn();

    view.setExportEnabled(false);
    expect(els.exportBtn.disabled).toBe(true);
    view.setExportEnabled(true);
    expect(els.exportBtn.disabled).toBe(false);

    view.onExport(onExport);
    els.exportBtn.click();
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('works when its elements are missing', () => {
    const bare = new CompareView({});

    expect(() => {
      bare.setOriginalInfo({ filename: 'song.wav' });
      bare.setExportEnabled(true);
      bare.onExport(vi.fn());
    }).not.toThrow();
  });
});
