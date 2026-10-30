import { describe, it, expect } from 'vitest';
import { CompareView } from '../renderer/views/CompareView.js';
import { FakeElement } from './helpers/fakeDom.js';

const SIDES = ['orig', 'proc'];
const FIELDS = ['Filename', 'Duration', 'SampleRate', 'Channels'];

function makeView() {
  const els = {};
  for (const side of SIDES)
    for (const field of FIELDS) els[`${side}${field}El`] = new FakeElement();
  return { view: new CompareView(els), els };
}

const panelText = (els, side) => FIELDS.map((field) => els[`${side}${field}El`].textContent);

describe('CompareView info panels', () => {
  it('renders the original file info', () => {
    const { view, els } = makeView();

    view.setOriginalInfo({ filename: 'song.wav', durationSec: 61, sampleRate: 48000, channels: 1 });

    expect(panelText(els, 'orig')).toEqual(['song.wav', '1:01', '48000 Hz', '1']);
    expect(panelText(els, 'proc')).toEqual(['', '', '', '']);
  });

  it('renders the processed file info', () => {
    const { view, els } = makeView();

    view.setProcessedInfo({ filename: 'out.wav', durationSec: 3, sampleRate: 44100, channels: 2 });

    expect(panelText(els, 'proc')).toEqual(['out.wav', '0:03', '44100 Hz', '2']);
    expect(panelText(els, 'orig')).toEqual(['', '', '', '']);
  });

  it('renders placeholders, filename included, for null info', () => {
    const { view, els } = makeView();

    view.setOriginalInfo(null);
    view.setProcessedInfo({});

    expect(panelText(els, 'orig')).toEqual(['—', '—', '—', '—']);
    expect(panelText(els, 'proc')).toEqual(['—', '—', '—', '—']);
  });

  it('enables and disables export', () => {
    const exportBtn = new FakeElement();
    const view = new CompareView({ exportBtn });

    view.setExportEnabled(true);
    const enabled = !exportBtn.disabled;
    view.setExportEnabled(false);

    expect([enabled, exportBtn.disabled]).toEqual([true, true]);
  });
});
