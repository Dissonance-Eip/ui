import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { toFileUrl } from '../renderer/utils/fileUrl.js';

// Names that broke the preview: `#` and `?` were read as fragment / query,
// and `%` was left unescaped (ui#113).
const AWKWARD_NAMES = [
  'a#b?c%d.wav',
  'a b#1?.wav',
  'percent 100%.wav',
  'already%20encoded.wav',
  'two spaces  here.wav',
  'café – naïve.wav',
  '日本語の曲.wav',
  'emoji 🎵.wav',
];

/** A URL that parses with no query or fragment, so the whole path survives. */
function expectWholePath(url) {
  const parsed = new URL(url);
  expect(parsed.protocol).toBe('file:');
  expect(parsed.search).toBe('');
  expect(parsed.hash).toBe('');
}

describe('toFileUrl — POSIX paths', () => {
  it('builds a plain file URL for an ordinary path', () => {
    expect(toFileUrl('/Users/luca/Music/song.wav')).toBe('file:///Users/luca/Music/song.wav');
  });

  it.each(AWKWARD_NAMES)('round-trips a file named %j', (name) => {
    const filePath = `/Users/luca/My Music/#dir?/${name}`;

    const url = toFileUrl(filePath);

    expectWholePath(url);
    expect(fileURLToPath(url, { windows: false })).toBe(filePath);
  });

  it('percent-encodes #, ? and % instead of leaving them raw', () => {
    expect(toFileUrl('/music/a#b?c%d.wav')).toBe('file:///music/a%23b%3Fc%25d.wav');
  });

  it('encodes a backslash as part of the name (it is not a separator on POSIX)', () => {
    const filePath = '/music/back\\slash.wav';

    const url = toFileUrl(filePath);

    expect(fileURLToPath(url, { windows: false })).toBe(filePath);
  });
});

describe('toFileUrl — Windows paths', () => {
  it('builds a file URL for a drive path', () => {
    expect(toFileUrl('C:\\Users\\luca\\song.wav')).toBe('file:///C:/Users/luca/song.wav');
  });

  it.each(AWKWARD_NAMES)('round-trips a drive path to %j', (name) => {
    const filePath = `C:\\Users\\luca\\My Music\\#dir?\\${name}`;

    const url = toFileUrl(filePath);

    expectWholePath(url);
    expect(fileURLToPath(url, { windows: true })).toBe(filePath);
  });

  it.each(AWKWARD_NAMES)('round-trips a UNC path to %j', (name) => {
    const filePath = `\\\\server\\share\\#dir?\\${name}`;

    const url = toFileUrl(filePath);

    expectWholePath(url);
    expect(fileURLToPath(url, { windows: true })).toBe(filePath);
  });
});

describe('toFileUrl — invalid input', () => {
  it.each([null, undefined, ''])('returns null for %j', (value) => {
    expect(toFileUrl(value)).toBeNull();
  });

  it('returns null for a relative path (it has no file URL)', () => {
    expect(toFileUrl('song.wav')).toBeNull();
    expect(toFileUrl('music/song.wav')).toBeNull();
  });
});
