import { describe, it, expect } from 'vitest';
import { getWaveformColors } from '../renderer/utils/waveformColors.js';

describe('getWaveformColors', () => {
  it('returns light-on-dark colours for the dark theme', () => {
    expect(getWaveformColors('dark')).toEqual({
      waveformColor: 'rgba(226, 232, 240, 0.30)',
      progressColor: 'rgba(226, 232, 240, 0.95)',
      buttonColor: 'rgba(226, 232, 240, 0.95)',
    });
  });

  it('returns dark-on-light colours for the light theme', () => {
    expect(getWaveformColors('light')).toEqual({
      waveformColor: 'rgba(15, 23, 42, 0.25)',
      progressColor: 'rgba(15, 23, 42, 0.9)',
      buttonColor: 'rgba(15, 23, 42, 0.9)',
    });
  });

  it('defaults to the light colours for an unknown mode', () => {
    expect(getWaveformColors(undefined)).toEqual(getWaveformColors('light'));
    expect(getWaveformColors('sepia')).toEqual(getWaveformColors('light'));
  });

  it('returns a fresh object so callers cannot mutate the palette', () => {
    const colors = getWaveformColors('dark');
    colors.waveformColor = 'red';
    expect(getWaveformColors('dark').waveformColor).toBe('rgba(226, 232, 240, 0.30)');
  });
});
