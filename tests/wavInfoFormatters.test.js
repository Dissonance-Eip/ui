import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatSampleRate,
  formatChannels,
} from '../renderer/utils/wavInfoFormatters.js';

describe('formatDuration', () => {
  it('returns m:ss with zero-padded seconds for normal durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3666)).toBe('61:06');
  });

  it('rounds the seconds to the nearest integer', () => {
    expect(formatDuration(59.4)).toBe('0:59');
    expect(formatDuration(59.6)).toBe('1:00');
  });

  it('returns "—" for missing or invalid input', () => {
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration('30')).toBe('—'); // non-number
  });
});

describe('formatSampleRate', () => {
  it('appends " Hz" to truthy values', () => {
    expect(formatSampleRate(44100)).toBe('44100 Hz');
    expect(formatSampleRate(48000)).toBe('48000 Hz');
  });

  it('returns "—" for falsy values', () => {
    expect(formatSampleRate(0)).toBe('—');
    expect(formatSampleRate(null)).toBe('—');
    expect(formatSampleRate(undefined)).toBe('—');
  });
});

describe('formatChannels', () => {
  it('stringifies truthy numbers', () => {
    expect(formatChannels(1)).toBe('1');
    expect(formatChannels(2)).toBe('2');
    expect(formatChannels(6)).toBe('6');
  });

  it('returns "—" for falsy values', () => {
    expect(formatChannels(0)).toBe('—');
    expect(formatChannels(null)).toBe('—');
    expect(formatChannels(undefined)).toBe('—');
  });
});
