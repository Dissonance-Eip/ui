import { describe, it, expect } from 'vitest';
import { diffTags, hasTagChanges } from '../ipcHandlers/core/tagMerge.js';

describe('diffTags', () => {
  it('keeps only the fields the window changed', () => {
    const base = { title: 'Old', artist: 'Someone', genre: '' };
    const next = { title: 'New', artist: 'Someone', genre: '' };

    expect(diffTags(base, next)).toEqual({ title: 'New' });
  });

  it('reports a cleared field as a change to an empty string', () => {
    expect(diffTags({ title: 'Old' }, { title: '' })).toEqual({ title: '' });
  });

  it('treats missing and empty values as equal', () => {
    expect(diffTags({}, { title: '' })).toEqual({});
    expect(diffTags({ title: undefined }, { title: '' })).toEqual({});
  });

  it('reports only filled fields when the window never read the file (#111)', () => {
    // With no baseline an empty field means "never loaded", not "cleared".
    const next = { title: 'A', artist: '', genre: '  ' };

    expect(diffTags(null, next)).toEqual({ title: 'A' });
  });

  it('reports nothing for an empty form the window never read (#111)', () => {
    expect(diffTags(undefined, { title: '', artist: '' })).toEqual({});
  });

  it('does not modify its inputs', () => {
    const base = Object.freeze({ title: 'Old' });
    const next = Object.freeze({ title: 'New' });

    expect(() => diffTags(base, next)).not.toThrow();
    expect(base).toEqual({ title: 'Old' });
  });
});

describe('hasTagChanges', () => {
  it('is false for an empty change set and true otherwise', () => {
    expect(hasTagChanges({})).toBe(false);
    expect(hasTagChanges({ title: '' })).toBe(true);
  });
});
