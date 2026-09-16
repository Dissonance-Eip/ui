// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WaveformPreview } from '../../../renderer/components/WaveformPreview.js';

const LIGHT_COLORS = {
  waveformColor: 'rgba(15, 23, 42, 0.25)',
  progressColor: 'rgba(15, 23, 42, 0.9)',
  buttonColor: 'rgba(15, 23, 42, 0.9)',
};
const DARK_COLORS = {
  waveformColor: 'rgba(226, 232, 240, 0.30)',
  progressColor: 'rgba(226, 232, 240, 0.95)',
  buttonColor: 'rgba(226, 232, 240, 0.95)',
};

function fakeAudio(props = {}) {
  return Object.assign(new EventTarget(), {
    duration: 120,
    currentTime: 0,
    readyState: 4,
    play: vi.fn(() => Promise.resolve()),
    ...props,
  });
}

function pointer(type, props) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, props);
  return event;
}

describe('WaveformPreview', () => {
  let players;
  let nextAudio;
  let containerEl;
  let preview;

  beforeEach(() => {
    players = [];
    nextAudio = () => fakeAudio();

    class FakeWaveformPlayer {
      constructor(container, options) {
        this.container = container;
        this.options = options;
        this.containerHtmlAtCreation = container.innerHTML;
        this.audio = nextAudio();
        this.canvas = document.createElement('canvas');
        this.canvas.getBoundingClientRect = () => ({ left: 0, width: 200 });
        this.isPlaying = false;
        this.play = vi.fn(() => Promise.resolve());
        this.pause = vi.fn();
        this.destroy = vi.fn();
        this.seekToPercent = vi.fn();
        // Like the real library, loadTrack() always ends by calling play().
        this.loadTrack = vi.fn(async () => {
          this.play();
        });
        players.push(this);
      }
    }

    window.WaveformPlayer = FakeWaveformPlayer;
    document.documentElement.classList.remove('dark');
    containerEl = document.createElement('div');
    preview = new WaveformPreview({ containerEl, height: 140 });
  });

  afterEach(() => {
    preview.unmount();
    delete window.WaveformPlayer;
    vi.restoreAllMocks();
  });

  describe('loading files', () => {
    it('creates a paused player for the first file, with the light theme', () => {
      containerEl.innerHTML = '<p>stale</p>';

      preview.setFile('/music/song.wav');

      const [player] = players;
      expect(player.container).toBe(containerEl);
      expect(player.containerHtmlAtCreation).toBe('');
      expect(player.options).toEqual({
        url: 'file:///music/song.wav',
        autoplay: false,
        waveformStyle: 'mirror',
        height: 140,
        samples: 400,
        showInfo: false,
        showTime: false,
        showBPM: false,
        showPlaybackSpeed: false,
        showHoverTime: true,
        ...LIGHT_COLORS,
      });
      expect(preview.audio).toBe(player.audio);
    });

    it('uses the dark colours when the page is in dark mode', () => {
      document.documentElement.classList.add('dark');

      preview.setFile('/music/song.wav');

      expect(players[0].options).toMatchObject(DARK_COLORS);
    });

    it('reuses the player for the next file without letting it auto-play', async () => {
      preview.setFile('/music/first.wav');
      const [player] = players;
      const originalPlay = player.play;

      preview.setFile('/music/second.wav');
      expect(player.loadTrack).toHaveBeenCalledWith('file:///music/second.wav');
      expect(originalPlay).not.toHaveBeenCalled();
      expect(players).toHaveLength(1);

      await vi.waitFor(() => expect(player.play).not.toBe(player.loadTrack));
      player.play();
      expect(originalPlay).toHaveBeenCalledOnce();
    });

    it('does not restore play() on a player cleared mid-load', async () => {
      preview.setFile('/music/first.wav');
      const [player] = players;
      let finishLoad;
      player.loadTrack.mockImplementation(() => new Promise((resolve) => (finishLoad = resolve)));

      preview.setFile('/music/second.wav');
      preview.clear();
      finishLoad();
      await Promise.resolve();

      expect(preview._player).toBeNull();
    });

    it('does nothing without a container', () => {
      new WaveformPreview({}).setFile('/music/song.wav');

      expect(players).toHaveLength(0);
    });

    it('clears the preview for an empty path or an unusable one', () => {
      preview.setFile('/music/song.wav');
      preview.setFile(null);
      expect(players[0].destroy).toHaveBeenCalledOnce();
      expect(preview._currentFilePath).toBeNull();

      preview.setFile('[::1');
      expect(players).toHaveLength(1);
      expect(preview.audio).toBeNull();
    });

    it('shows nothing when the waveform library is not loaded', () => {
      delete window.WaveformPlayer;
      containerEl.innerHTML = '<p>stale</p>';

      preview.setFile('/music/song.wav');

      expect(containerEl.innerHTML).toBe('');
      expect(preview.audio).toBeNull();
    });
  });

  describe('playback controls', () => {
    it('pauses the player and ignores pause errors', () => {
      expect(() => preview.pause()).not.toThrow();

      preview.setFile('/music/song.wav');
      preview.pause();
      expect(players[0].pause).toHaveBeenCalledOnce();

      players[0].pause.mockImplementation(() => {
        throw new Error('not loaded');
      });
      expect(() => preview.pause()).not.toThrow();
    });

    it('destroys the player on clear, ignoring errors', () => {
      preview.setFile('/music/song.wav');
      players[0].destroy.mockImplementation(() => {
        throw new Error('already destroyed');
      });

      expect(() => preview.clear()).not.toThrow();
      expect(preview._player).toBeNull();
      expect(() => new WaveformPreview({}).clear()).not.toThrow();
    });

    it('reports whether it is playing', () => {
      expect(preview.isPlaying).toBe(false);
      expect(preview.audio).toBeNull();

      preview.setFile('/music/song.wav');
      players[0].isPlaying = true;
      expect(preview.isPlaying).toBe(true);
    });

    it('clears the player when unmounted', () => {
      preview.mount();
      preview.setFile('/music/song.wav');

      preview.unmount();

      expect(players[0].destroy).toHaveBeenCalledOnce();
    });
  });

  describe('playback state callback', () => {
    it('reports play, pause and ended once wired to a player', () => {
      const onChange = vi.fn();
      preview.setOnPlaybackStateChange(onChange);
      preview.setFile('/music/song.wav');
      const { audio } = players[0];

      players[0].isPlaying = true;
      audio.dispatchEvent(new Event('play'));
      players[0].isPlaying = false;
      audio.dispatchEvent(new Event('pause'));
      audio.dispatchEvent(new Event('ended'));

      expect(onChange.mock.calls).toEqual([[true], [false], [false]]);
    });

    it('wires a callback set after the player exists, only once per audio element', () => {
      preview.setFile('/music/song.wav');
      const onChange = vi.fn();

      preview.setOnPlaybackStateChange(onChange);
      preview.setOnPlaybackStateChange(onChange);
      players[0].audio.dispatchEvent(new Event('play'));

      expect(onChange).toHaveBeenCalledOnce();
    });

    it('stops reporting once cleared, ignoring errors while detaching', () => {
      const onChange = vi.fn();
      preview.setOnPlaybackStateChange(onChange);
      preview.setFile('/music/song.wav');
      const { audio } = players[0];

      preview.clear();
      audio.dispatchEvent(new Event('play'));
      expect(onChange).not.toHaveBeenCalled();

      preview._removeAudioListeners = () => {
        throw new Error('audio element gone');
      };
      expect(() => preview.clear()).not.toThrow();
    });

    it('does not wire a player without an audio element', () => {
      nextAudio = () => null;
      preview.setFile('/music/song.wav');

      preview.setOnPlaybackStateChange(vi.fn());

      expect(preview._listenersAttachedTo).toBeNull();
    });
  });

  describe('drag to scrub', () => {
    let player;

    beforeEach(() => {
      preview.setFile('/music/song.wav');
      [player] = players;
    });

    it('seeks while the primary button is held down and dragged', () => {
      const down = pointer('pointerdown', { button: 0, clientX: 50 });
      player.canvas.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      expect(player.seekToPercent).toHaveBeenLastCalledWith(0.25);

      window.dispatchEvent(pointer('pointermove', { clientX: -40 }));
      expect(player.seekToPercent).toHaveBeenLastCalledWith(0);
      window.dispatchEvent(pointer('pointermove', { clientX: 900 }));
      expect(player.seekToPercent).toHaveBeenLastCalledWith(1);

      window.dispatchEvent(pointer('pointerup', {}));
      window.dispatchEvent(pointer('pointermove', { clientX: 100 }));
      expect(player.seekToPercent).toHaveBeenCalledTimes(3);
    });

    it('treats touch input without a button as primary, and stops on cancel', () => {
      player.canvas.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      expect(player.seekToPercent).toHaveBeenLastCalledWith(0.5);

      window.dispatchEvent(pointer('pointercancel', {}));
      window.dispatchEvent(pointer('pointermove', { clientX: 150 }));
      expect(player.seekToPercent).toHaveBeenCalledOnce();
    });

    it('ignores other buttons, moves without a press, and tracks without a duration', () => {
      player.canvas.dispatchEvent(pointer('pointerdown', { button: 2, clientX: 50 }));
      window.dispatchEvent(pointer('pointermove', { clientX: 50 }));
      expect(player.seekToPercent).not.toHaveBeenCalled();

      player.audio.duration = 0;
      player.canvas.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50 }));
      expect(player.seekToPercent).not.toHaveBeenCalled();
    });

    it('seeks safely on players without seekToPercent', () => {
      delete player.seekToPercent;

      expect(() =>
        player.canvas.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50 }))
      ).not.toThrow();
    });

    it('wires each canvas once and stops scrubbing once cleared', () => {
      preview._attachDragScrub();
      player.canvas.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50 }));
      expect(player.seekToPercent).toHaveBeenCalledOnce();

      preview.clear();
      player.canvas.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50 }));
      expect(player.seekToPercent).toHaveBeenCalledOnce();

      preview._removeDragScrub = () => {
        throw new Error('canvas gone');
      };
      expect(() => preview.clear()).not.toThrow();
    });

    it('skips scrubbing for a player without a canvas', () => {
      preview.clear();
      nextAudio = () => fakeAudio();
      window.WaveformPlayer = class extends window.WaveformPlayer {
        constructor(...args) {
          super(...args);
          this.canvas = null;
        }
      };

      preview.setFile('/music/other.wav');

      expect(preview._dragAttachedTo).toBeNull();
    });
  });

  describe('theme changes', () => {
    const theme = (mode) => new CustomEvent('dissonance:theme', { detail: { mode } });

    beforeEach(() => {
      preview.mount();
    });

    it('only records the theme while nothing is loaded', () => {
      window.dispatchEvent(theme('dark'));

      expect(preview._themeMode).toBe('dark');
      expect(players).toHaveLength(0);
    });

    it('rebuilds the player, keeping the position and resuming playback', () => {
      preview.setFile('/music/song.wav');
      const [old] = players;
      old.isPlaying = true;
      old.audio.currentTime = 42;

      window.dispatchEvent(theme('dark'));

      expect(old.destroy).toHaveBeenCalledOnce();
      const [, rebuilt] = players;
      expect(rebuilt.options.url).toBe('file:///music/song.wav');
      expect(rebuilt.audio.currentTime).toBe(42);
      expect(rebuilt.audio.play).toHaveBeenCalledOnce();
    });

    it('ignores a repeat of the current theme', () => {
      preview.setFile('/music/song.wav');
      window.dispatchEvent(theme('dark'));
      window.dispatchEvent(theme('dark'));

      expect(players).toHaveLength(2);
    });

    it('rebuilds on a theme event without a mode', () => {
      preview.setFile('/music/song.wav');

      window.dispatchEvent(new CustomEvent('dissonance:theme'));
      preview._onThemeChanged(undefined);

      expect(players).toHaveLength(3);
    });

    it('waits for metadata before restoring, clamping to the duration', () => {
      preview.setFile('/music/song.wav');
      const [old] = players;
      old.isPlaying = true;
      old.audio.currentTime = 500;
      nextAudio = () => fakeAudio({ readyState: 0, duration: 120 });

      window.dispatchEvent(theme('dark'));
      const rebuilt = players[1];
      expect(rebuilt.audio.play).not.toHaveBeenCalled();

      rebuilt.audio.dispatchEvent(new Event('loadedmetadata'));
      rebuilt.audio.dispatchEvent(new Event('loadedmetadata'));
      expect(rebuilt.audio.currentTime).toBe(120);
      expect(rebuilt.audio.play).toHaveBeenCalledOnce();
    });

    it('does not seek or play when there is nothing to restore', () => {
      preview.setFile('/music/song.wav');
      nextAudio = () => fakeAudio({ duration: Number.NaN, currentTime: 7 });
      players[0].audio.currentTime = 30;

      window.dispatchEvent(theme('dark'));
      expect(players[1].audio.currentTime).toBe(7);
      expect(players[1].audio.play).not.toHaveBeenCalled();

      players[1].audio.currentTime = 0;
      window.dispatchEvent(theme('light'));
      expect(players[2].audio.currentTime).toBe(7);
    });

    it('ignores errors while restoring playback', () => {
      preview.setFile('/music/song.wav');
      players[0].isPlaying = true;
      players[0].audio.currentTime = 10;
      nextAudio = () => {
        const audio = fakeAudio({
          play: vi.fn(() => Promise.reject(new Error('autoplay blocked'))),
        });
        Object.defineProperty(audio, 'currentTime', {
          get: () => 0,
          set: () => {
            throw new Error('not seekable');
          },
        });
        return audio;
      };

      expect(() => window.dispatchEvent(theme('dark'))).not.toThrow();
    });

    it('resumes playback even when the rebuilt audio rejects play()', async () => {
      preview.setFile('/music/song.wav');
      players[0].isPlaying = true;
      nextAudio = () =>
        fakeAudio({ play: vi.fn(() => Promise.reject(new Error('autoplay blocked'))) });

      window.dispatchEvent(theme('dark'));
      await Promise.resolve();

      expect(players[1].audio.play).toHaveBeenCalledOnce();
    });

    it('stops after the rebuild when the new player has no audio', () => {
      preview.setFile('/music/song.wav');
      nextAudio = () => null;

      window.dispatchEvent(theme('dark'));

      expect(players).toHaveLength(2);
      expect(preview.audio).toBeNull();
    });

    it('restores from the start when the old player had no audio', () => {
      nextAudio = () => null;
      preview.setFile('/music/song.wav');
      players[0].isPlaying = true;
      nextAudio = () => fakeAudio({ currentTime: 3 });

      window.dispatchEvent(theme('dark'));

      expect(players[1].audio.currentTime).toBe(3);
      expect(players[1].audio.play).toHaveBeenCalledOnce();
    });

    it('does not restore without a player', () => {
      expect(() => preview._restorePlaybackState(10, true)).not.toThrow();
    });
  });
});
