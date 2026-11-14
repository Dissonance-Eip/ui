import { describe, it, expect } from 'vitest';
import { basename } from '../renderer/utils/pathUtils.js';

describe('basename', () => {
  it('extracts the last segment of a POSIX path', () => {
    expect(basename('/Users/luca/Music/song.wav')).toBe('song.wav');
    expect(basename('/song.wav')).toBe('song.wav');
  });

  it('extracts the last segment of a Windows path', () => {
    expect(basename('C:\\Users\\luca\\Music\\song.wav')).toBe('song.wav');
  });

  it('handles mixed separators (drag/drop weirdness)', () => {
    expect(basename('/foo\\bar/baz.wav')).toBe('baz.wav');
  });

  it('returns the filename itself when no directory is present', () => {
    expect(basename('song.wav')).toBe('song.wav');
  });

  it('returns null for null / undefined / empty input', () => {
    expect(basename(null)).toBeNull();
    expect(basename(undefined)).toBeNull();
    expect(basename('')).toBeNull();
  });

  it('returns null for a path that ends in a separator', () => {
    expect(basename('/Users/luca/')).toBeNull();
  });
});
