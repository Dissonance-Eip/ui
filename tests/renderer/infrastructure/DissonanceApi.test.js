import { describe, it, expect, vi } from 'vitest';
import { DissonanceApi } from '../../../renderer/infrastructure/DissonanceApi.js';

describe('DissonanceApi', () => {
  const calls = [
    ['openFile', []],
    ['getSystemTheme', []],
    ['getPathForFile', [{ name: 'song.wav' }]],
    ['readFileMetadata', ['/music/song.wav']],
    ['cleanupProcessedFile', ['/tmp/song-processed.wav']],
    ['processFile', ['/music/song.wav', { perturbation: 0.5 }]],
    ['writeTags', ['/music/song.wav', { title: 'Song' }]],
    ['exportFile', ['/tmp/song-processed.wav']],
    ['onCoreStatus', [() => {}]],
    ['onSystemTheme', [() => {}]],
  ];

  it.each(calls)(
    '%s() passes through to the bridge method of the same name',
    async (method, args) => {
      const bridge = { [method]: vi.fn(() => 'result') };
      const api = new DissonanceApi(bridge);

      expect(await api[method](...args)).toBe('result');
      expect(bridge[method]).toHaveBeenCalledWith(...args);
    }
  );
});
