import { describe, it, expect } from 'vitest';
import { renderWavInfo } from '../renderer/views/renderWavInfo.js';
import { FakeElement } from './helpers/fakeDom.js';

function makeEls() {
  return {
    filenameEl: new FakeElement(),
    durationEl: new FakeElement(),
    sampleRateEl: new FakeElement(),
    channelsEl: new FakeElement(),
  };
}

const text = (els) => Object.values(els).map((el) => el.textContent);

describe('renderWavInfo', () => {
  it('formats every field', () => {
    const els = makeEls();

    renderWavInfo(els, { filename: 'a.wav', durationSec: 59.6, sampleRate: 22050, channels: 2 });

    expect(text(els)).toEqual(['a.wav', '1:00', '22050 Hz', '2']);
  });

  it('renders placeholders for null info', () => {
    const els = makeEls();

    renderWavInfo(els, null);

    expect(text(els)).toEqual(['—', '—', '—', '—']);
  });

  it('skips missing elements', () => {
    const durationEl = new FakeElement();

    expect(() =>
      renderWavInfo({ durationEl }, { filename: 'a.wav', durationSec: 5 })
    ).not.toThrow();
    expect(durationEl.textContent).toBe('0:05');
  });
});
