import { describe, it, expect, beforeEach } from 'vitest';
import { AppState } from '../../../renderer/state/AppState.js';

describe('AppState', () => {
  let state;

  beforeEach(() => {
    state = new AppState();
  });

  it('starts with both file paths null', () => {
    expect(state.currentFilePath).toBeNull();
    expect(state.processedFilePath).toBeNull();
    expect(state.hasCurrentFile()).toBe(false);
    expect(state.hasProcessedFile()).toBe(false);
  });

  it('setCurrentFilePath stores the path', () => {
    state.setCurrentFilePath('/a.wav');
    expect(state.currentFilePath).toBe('/a.wav');
    expect(state.hasCurrentFile()).toBe(true);
  });

  it('setCurrentFilePath CLEARS processedFilePath (the side effect)', () => {
    state.setCurrentFilePath('/a.wav');
    state.setProcessedFilePath('/tmp/a-processed.wav');
    expect(state.hasProcessedFile()).toBe(true);

    // Switching the source must invalidate the previously processed result.
    state.setCurrentFilePath('/b.wav');
    expect(state.currentFilePath).toBe('/b.wav');
    expect(state.processedFilePath).toBeNull();
    expect(state.hasProcessedFile()).toBe(false);
  });

  it('setProcessedFilePath does NOT clear currentFilePath', () => {
    state.setCurrentFilePath('/a.wav');
    state.setProcessedFilePath('/tmp/out.wav');
    expect(state.currentFilePath).toBe('/a.wav');
    expect(state.processedFilePath).toBe('/tmp/out.wav');
  });

  it('setProcessedFilePath(null) is the explicit reset path', () => {
    state.setCurrentFilePath('/a.wav');
    state.setProcessedFilePath('/tmp/out.wav');
    state.setProcessedFilePath(null);
    expect(state.processedFilePath).toBeNull();
    expect(state.currentFilePath).toBe('/a.wav'); // untouched
  });
});
