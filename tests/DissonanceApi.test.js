import { describe, it, expect, vi } from 'vitest';
import { DissonanceApi } from '../renderer/infrastructure/DissonanceApi.js';
import { makeBridge } from './helpers/fakeRenderer.js';

describe('DissonanceApi', () => {
  it('is unavailable without a preload bridge', () => {
    const api = new DissonanceApi(undefined);

    expect(api.isAvailable()).toBe(false);
  });

  it('rejects a call when the preload bridge is missing', async () => {
    const api = new DissonanceApi(null);

    await expect(api.readFileMetadata('/music/song.wav')).rejects.toThrow(
      'API bridge is not available'
    );
  });

  it('names the method the preload bridge does not expose', async () => {
    const api = new DissonanceApi({});

    await expect(api.getSystemTheme()).rejects.toThrow('API method not available: getSystemTheme');
  });

  it('passes the arguments through to the bridge and returns its answer', async () => {
    const bridge = makeBridge();
    const api = new DissonanceApi(bridge);

    const reply = await api.processFile('/music/song.wav', { modes: ['white_noise'] });

    expect(bridge.processFile).toHaveBeenCalledWith('/music/song.wav', { modes: ['white_noise'] });
    expect(reply).toEqual({ ok: true, processedPath: '/tmp/out.wav' });
  });

  it('subscribes to theme changes and hands back the unsubscribe', () => {
    const bridge = makeBridge();
    const api = new DissonanceApi(bridge);
    const onTheme = vi.fn();

    const unsubscribe = api.onSystemTheme(onTheme);
    bridge.listeners.onSystemTheme({ mode: 'dark' });

    expect(onTheme).toHaveBeenCalledWith({ mode: 'dark' });
    expect(unsubscribe).toBe(bridge.unsubscribes.onSystemTheme);
  });

  it.each([
    [true, true],
    [false, false],
    ['yes', false],
  ])(
    'reports a development build only when the bridge says exactly true (%j)',
    (answer, expected) => {
      const api = new DissonanceApi({ isDevelopment: () => answer });

      expect(api.isDevelopment()).toBe(expected);
    }
  );
});
