import { describe, it, expect, vi } from 'vitest';
import { WaveformPreview } from '../renderer/components/WaveformPreview.js';
import { getWaveformColors } from '../renderer/utils/waveformColors.js';

/**
 * Helper: a stand-in for the third-party WaveformPlayer exposing only what
 * WaveformPreview touches on a theme change. `audio` mimics a track that is
 * playing mid-way through.
 */
function makeStubPlayer() {
  const audio = { currentTime: 42, paused: false, play: vi.fn(), pause: vi.fn() };
  return {
    audio,
    isPlaying: true,
    options: { waveformStyle: 'mirror', ...getWaveformColors('light') },
    playBtn: { style: {} },
    drawWaveform: vi.fn(),
    destroy: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
  };
}

function makePreviewWithPlayer() {
  const preview = new WaveformPreview({ containerEl: {} });
  const player = makeStubPlayer();
  preview._player = player;
  preview._currentFilePath = '/music/song.wav';
  preview._themeMode = 'light';
  return { preview, player };
}

const themeEvent = (mode) => ({ detail: { mode } });

describe('WaveformPreview — theme change during playback', () => {
  it('keeps the same player and audio element (no rebuild, no reload)', () => {
    const { preview, player } = makePreviewWithPlayer();
    const audioBefore = player.audio;

    preview._onThemeChanged(themeEvent('dark'));

    expect(preview._player).toBe(player);
    expect(player.audio).toBe(audioBefore);
    expect(player.destroy).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.audio.pause).not.toHaveBeenCalled();
    expect(player.audio.currentTime).toBe(42);
  });

  it('repaints the waveform with the new theme colours', () => {
    const { preview, player } = makePreviewWithPlayer();

    preview._onThemeChanged(themeEvent('dark'));

    const dark = getWaveformColors('dark');
    expect(player.options).toMatchObject(dark);
    expect(player.options.waveformStyle).toBe('mirror');
    expect(player.playBtn.style.color).toBe(dark.buttonColor);
    expect(player.playBtn.style.borderColor).toBe(dark.buttonColor);
    expect(player.drawWaveform).toHaveBeenCalledTimes(1);
  });

  it('replaces the options object instead of mutating it', () => {
    const { preview, player } = makePreviewWithPlayer();
    const optionsBefore = player.options;

    preview._onThemeChanged(themeEvent('dark'));

    expect(player.options).not.toBe(optionsBefore);
    expect(optionsBefore).toMatchObject(getWaveformColors('light'));
  });

  it('does nothing when the mode has not changed', () => {
    const { preview, player } = makePreviewWithPlayer();

    preview._onThemeChanged(themeEvent('light'));

    expect(player.drawWaveform).not.toHaveBeenCalled();
  });

  it('remembers the mode when no player exists yet', () => {
    const preview = new WaveformPreview({ containerEl: {} });

    expect(() => preview._onThemeChanged(themeEvent('dark'))).not.toThrow();
    expect(preview._themeMode).toBe('dark');
  });

  it('tolerates a player without a play button', () => {
    const { preview, player } = makePreviewWithPlayer();
    player.playBtn = null;

    expect(() => preview._onThemeChanged(themeEvent('dark'))).not.toThrow();
    expect(player.drawWaveform).toHaveBeenCalledTimes(1);
  });
});
