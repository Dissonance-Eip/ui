import { describe, it, expect } from 'vitest';
import {
  checkFilePath,
  checkProcessOptions,
  checkTags,
  INVALID_FILE_PATH,
  INVALID_OPTIONS,
  INVALID_TAGS,
} from '../ipcHandlers/core/corePayloads.js';

describe('checkFilePath', () => {
  it.each([undefined, null, '', 42, {}, ['/a.wav'], { filePath: '/a.wav' }])(
    'rejects %j',
    (value) => expect(checkFilePath(value)).toBe(INVALID_FILE_PATH)
  );

  it('accepts a non-empty string', () => expect(checkFilePath('/music/a.wav')).toBeNull());
});

describe('checkProcessOptions', () => {
  it.each([undefined, null, {}, { modes: ['shield'], perturbation: 0.8 }, { extra: 1 }])(
    'accepts %j',
    (value) => expect(checkProcessOptions(value)).toBeNull()
  );

  it.each([
    'fast',
    42,
    ['shield'],
    { modes: 'shield' },
    { modes: ['shield', 3] },
    { perturbation: '0.8' },
    { perturbation: Number.NaN },
  ])('rejects %j', (value) => expect(checkProcessOptions(value)).toBe(INVALID_OPTIONS));
});

describe('checkTags', () => {
  it.each([undefined, null, {}, { title: 'Song', artist: '' }])('accepts %j', (value) =>
    expect(checkTags(value)).toBeNull()
  );

  it.each(['title', 42, ['Song'], { title: 42 }, { title: { nested: 'x' } }, { title: null }])(
    'rejects %j',
    (value) => expect(checkTags(value)).toBe(INVALID_TAGS)
  );
});
