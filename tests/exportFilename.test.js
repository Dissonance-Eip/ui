import { describe, it, expect } from 'vitest';
import { buildExportFilename } from '../ipcHandlers/core/exportFilename.js';

const SONG = '/music/song.wav';

describe('buildExportFilename', () => {
  it('appends the mode and intensity to the input name', () => {
    expect(buildExportFilename(SONG, { modes: ['white_noise'], perturbation: 0.8 })).toBe(
      'song_white-noise_0.8.wav'
    );
  });

  it('joins several modes with "+" in the order they were used', () => {
    const options = { modes: ['spectral_gate', 'pink_noise'], perturbation: 0.8 };

    expect(buildExportFilename(SONG, options)).toBe('song_spectral-gate+pink-noise_0.8.wav');
  });

  it('rounds the intensity to two decimals', () => {
    const options = { modes: ['white_noise'], perturbation: 0.1 + 0.2 };

    expect(buildExportFilename(SONG, options)).toBe('song_white-noise_0.3.wav');
  });

  it('leaves the intensity out when it is not a finite number', () => {
    const options = { modes: ['white_noise'], perturbation: Number.NaN };

    expect(buildExportFilename(SONG, options)).toBe('song_white-noise.wav');
  });

  it('reduces hostile mode strings to filename-safe characters', () => {
    const options = { modes: ['../a/b', 'C:\\x', 'Pink Noise', '***'], perturbation: 0.8 };

    expect(buildExportFilename(SONG, options)).toBe('song_a-b+c-x+pink-noise_0.8.wav');
  });

  it('drops duplicate modes', () => {
    const options = { modes: ['white_noise', 'white_noise'], perturbation: 0.8 };

    expect(buildExportFilename(SONG, options)).toBe('song_white-noise_0.8.wav');
  });

  it('caps the mode identifier length', () => {
    const options = { modes: Array.from({ length: 20 }, (_, i) => `mode_${i}`) };

    const name = buildExportFilename(SONG, options);

    expect(name.length).toBeLessThanOrEqual('song_'.length + 64 + '.wav'.length);
    expect(name).toMatch(/^song_mode-0\+mode-1\+.*[a-z0-9]\.wav$/);
  });

  it('marks the output as processed when no usable mode is left', () => {
    expect(buildExportFilename(SONG, { modes: ['///'] })).toBe('song_processed.wav');
    expect(buildExportFilename(SONG, undefined)).toBe('song_processed.wav');
  });

  it('drops the input extension whatever its case', () => {
    expect(buildExportFilename('/music/track.WAV', { modes: ['white_noise'] })).toBe(
      'track_white-noise.wav'
    );
  });
});
