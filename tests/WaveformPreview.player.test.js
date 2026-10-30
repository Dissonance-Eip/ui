import { describe, it, expect, vi, afterEach } from 'vitest';
import { WaveformPreview } from '../renderer/components/WaveformPreview.js';
import { getWaveformColors } from '../renderer/utils/waveformColors.js';
import { toFileUrl } from '../renderer/utils/fileUrl.js';
import { makeEventTarget, makeWindow, settle } from './helpers/fakeRenderer.js';

const SONG = '/music/song.wav';
const OTHER_SONG = '/music/other.wav';
const CANVAS_RECT = { left: 100, width: 200 };

/**
 * A stand-in for the third-party WaveformPlayer. Like the real one,
 * loadTrack() ends by calling play(); `audio` and `canvas` are event targets.
 */
class FakeWaveformPlayer {
  static created = [];

  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.isPlaying = false;
    this.audio = Object.assign(makeEventTarget(), { duration: 120 });
    this.canvas = Object.assign(makeEventTarget(), { getBoundingClientRect: () => CANVAS_RECT });
    this.play = vi.fn(async () => {
      this.isPlaying = true;
    });
    this.pause = vi.fn();
    this.destroy = vi.fn();
    this.seekToPercent = vi.fn();
    this.loadTrack = vi.fn(async (url) => {
      this.options = { ...this.options, url };
      await this.play();
    });
    FakeWaveformPlayer.created.push(this);
  }
}

function stubWindowWithPlayer() {
  FakeWaveformPlayer.created = [];
  const win = Object.assign(makeWindow(undefined), { WaveformPlayer: FakeWaveformPlayer });
  vi.stubGlobal('window', win);
  return win;
}

function makePreview(options = {}) {
  const win = stubWindowWithPlayer();
  const containerEl = { innerHTML: '<p>old</p>' };
  const preview = new WaveformPreview({ containerEl, ...options });
  return { preview, containerEl, win };
}

/** A preview showing SONG; `player` is the WaveformPlayer it created. */
function makeLoadedPreview(options) {
  const parts = makePreview(options);
  parts.preview.setFile(SONG);
  return { ...parts, player: FakeWaveformPlayer.created[0] };
}

const pointer = (clientX, extra = {}) => ({ clientX, preventDefault: vi.fn(), ...extra });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WaveformPreview — loading a file', () => {
  it('creates a paused player for the file URL in the container', () => {
    const { player, containerEl } = makeLoadedPreview({ height: 140 });

    expect(player.container).toBe(containerEl);
    expect(player.options).toMatchObject({ url: toFileUrl(SONG), autoplay: false, height: 140 });
  });

  it('paints a new player in the light theme until told otherwise', () => {
    const { player } = makeLoadedPreview();

    expect(player.options).toMatchObject(getWaveformColors('light'));
  });

  it('paints a new player in the theme announced before it existed', () => {
    const { preview } = makePreview();
    preview._onThemeChanged({ detail: { mode: 'dark' } });

    preview.setFile(SONG);

    expect(FakeWaveformPlayer.created[0].options).toMatchObject(getWaveformColors('dark'));
  });

  it('reuses the player for the next file without starting playback', async () => {
    const { preview, player } = makeLoadedPreview();

    preview.setFile(OTHER_SONG);
    await settle();

    expect(FakeWaveformPlayer.created).toHaveLength(1);
    expect(player.loadTrack).toHaveBeenCalledWith(toFileUrl(OTHER_SONG));
    expect(player.isPlaying).toBe(false);
  });

  it('lets the user play again once the next file has loaded', async () => {
    const { preview, player } = makeLoadedPreview();
    preview.setFile(OTHER_SONG);
    await settle();

    await player.play();

    expect(player.isPlaying).toBe(true);
  });

  it('destroys the player and empties the container when the file is cleared', () => {
    const { preview, player, containerEl } = makeLoadedPreview();

    preview.setFile(null);

    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(containerEl.innerHTML).toBe('');
    expect(preview.isPlaying).toBe(false);
  });

  it('shows nothing when the path cannot be turned into a URL', () => {
    const { preview } = makePreview();

    preview.setFile('relative/song.wav');

    expect(FakeWaveformPlayer.created).toHaveLength(0);
  });

  it('shows nothing when the player library is not loaded', () => {
    const { preview, win } = makePreview();
    win.WaveformPlayer = undefined;

    expect(() => preview.setFile(SONG)).not.toThrow();
    expect(preview.isPlaying).toBe(false);
  });

  it('does nothing without a container', () => {
    stubWindowWithPlayer();
    const preview = new WaveformPreview({ containerEl: null });

    preview.setFile(SONG);

    expect(FakeWaveformPlayer.created).toHaveLength(0);
  });
});

describe('WaveformPreview — playback state', () => {
  it('reports play, pause and end of the track', () => {
    const onPlaybackStateChange = vi.fn();
    const { player } = makeLoadedPreview({ onPlaybackStateChange });

    player.isPlaying = true;
    player.audio.fire('play');
    player.isPlaying = false;
    player.audio.fire('pause');
    player.audio.fire('ended');

    expect(onPlaybackStateChange.mock.calls).toEqual([[true], [false], [false]]);
  });

  it('wires a callback registered after the file loaded, once', () => {
    const { preview, player } = makeLoadedPreview();
    const onPlaybackStateChange = vi.fn();

    preview.setOnPlaybackStateChange(onPlaybackStateChange);
    preview.setOnPlaybackStateChange(onPlaybackStateChange);
    player.audio.fire('play');

    expect(onPlaybackStateChange).toHaveBeenCalledTimes(1);
  });

  it('stops reporting once the preview is cleared', () => {
    const onPlaybackStateChange = vi.fn();
    const { preview, player } = makeLoadedPreview({ onPlaybackStateChange });

    preview.clear();
    player.audio.fire('play');

    expect(onPlaybackStateChange).not.toHaveBeenCalled();
    expect(player.audio.listenerCount('play')).toBe(0);
  });

  it('pauses the player', () => {
    const { preview, player } = makeLoadedPreview();

    preview.pause();

    expect(player.pause).toHaveBeenCalledTimes(1);
  });
});

describe('WaveformPreview — drag to scrub', () => {
  it('seeks to where the canvas is pressed and follows the drag', () => {
    const { player, win } = makeLoadedPreview();

    player.canvas.fire('pointerdown', pointer(150, { button: 0 }));
    win.fire('pointermove', pointer(250));

    expect(player.seekToPercent.mock.calls).toEqual([[0.25], [0.75]]);
  });

  it('keeps the seek inside the track when the drag leaves the canvas', () => {
    const { player, win } = makeLoadedPreview();

    player.canvas.fire('pointerdown', pointer(150));
    win.fire('pointermove', pointer(0));
    win.fire('pointermove', pointer(999));

    expect(player.seekToPercent.mock.calls).toEqual([[0.25], [0], [1]]);
  });

  it('stops following the pointer once it is released', () => {
    const { player, win } = makeLoadedPreview();
    player.canvas.fire('pointerdown', pointer(150));

    win.fire('pointerup', pointer(150));
    win.fire('pointermove', pointer(250));

    expect(player.seekToPercent).toHaveBeenCalledTimes(1);
  });

  it('ignores a press with a button other than the primary one', () => {
    const { player, win } = makeLoadedPreview();

    player.canvas.fire('pointerdown', pointer(150, { button: 2 }));
    win.fire('pointermove', pointer(250));

    expect(player.seekToPercent).not.toHaveBeenCalled();
  });

  it('does not seek before the track duration is known', () => {
    const { player } = makeLoadedPreview();
    player.audio.duration = 0;

    player.canvas.fire('pointerdown', pointer(150));

    expect(player.seekToPercent).not.toHaveBeenCalled();
  });

  it('removes the scrub listeners when the preview is cleared', () => {
    const { preview, player, win } = makeLoadedPreview();

    preview.clear();

    expect(player.canvas.listenerCount('pointerdown')).toBe(0);
    expect(win.listenerCount('pointermove')).toBe(0);
    expect(win.listenerCount('pointerup')).toBe(0);
  });
});

describe('WaveformPreview — mount', () => {
  it('repaints on the window theme event while mounted', () => {
    const { preview, player, win } = makeLoadedPreview();
    preview.mount();

    win.fire('dissonance:theme', { detail: { mode: 'dark' } });

    expect(player.options).toMatchObject(getWaveformColors('dark'));
  });

  it('destroys the player and stops listening for theme changes on unmount', () => {
    const { preview, player, win } = makeLoadedPreview();
    preview.mount();

    preview.unmount();

    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(win.listenerCount('dissonance:theme')).toBe(0);
  });
});
