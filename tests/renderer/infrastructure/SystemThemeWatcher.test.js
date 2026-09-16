// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemThemeWatcher } from '../../../renderer/infrastructure/SystemThemeWatcher.js';

describe('SystemThemeWatcher', () => {
  let rootEl;
  let themeEvents;
  const recordTheme = (e) => themeEvents.push(e.detail);

  beforeEach(() => {
    rootEl = document.createElement('div');
    themeEvents = [];
    window.addEventListener('dissonance:theme', recordTheme);
  });

  afterEach(() => {
    window.removeEventListener('dissonance:theme', recordTheme);
    vi.restoreAllMocks();
  });

  it('defaults to the <html> element', () => {
    expect(new SystemThemeWatcher({ api: {} }).rootEl).toBe(document.documentElement);
    expect(new SystemThemeWatcher().rootEl).toBe(document.documentElement);
  });

  it('does nothing without an API', async () => {
    await expect(new SystemThemeWatcher({ rootEl }).start()).resolves.toBeUndefined();
    expect(themeEvents).toEqual([]);
  });

  it('applies the current theme, then follows changes until stopped', async () => {
    let push;
    const unsubscribe = vi.fn();
    const api = {
      getSystemTheme: vi.fn(async () => ({ mode: 'dark' })),
      onSystemTheme: vi.fn((cb) => {
        push = cb;
        return unsubscribe;
      }),
    };
    const watcher = new SystemThemeWatcher({ api, rootEl });

    await watcher.start();
    expect(rootEl.classList.contains('dark')).toBe(true);
    expect(themeEvents).toEqual([{ mode: 'dark' }]);

    push({ mode: 'light' });
    expect(rootEl.classList.contains('dark')).toBe(false);
    expect(themeEvents.at(-1)).toEqual({ mode: 'light' });

    watcher.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(watcher._unsubscribe).toBeNull();
  });

  it('treats a missing or empty theme as light', async () => {
    const watcher = new SystemThemeWatcher({ api: {}, rootEl });
    rootEl.classList.add('dark');

    await watcher.start();
    watcher._onTheme({});

    expect(rootEl.classList.contains('dark')).toBe(false);
    expect(themeEvents).toEqual([{ mode: 'light' }, { mode: 'light' }]);
    expect(watcher._unsubscribe).toBeNull();
  });

  it('still subscribes when the initial fetch fails', async () => {
    const api = {
      getSystemTheme: vi.fn(async () => {
        throw new Error('IPC unavailable');
      }),
      onSystemTheme: vi.fn(() => 'not a function'),
    };
    const watcher = new SystemThemeWatcher({ api, rootEl });

    await watcher.start();

    expect(api.onSystemTheme).toHaveBeenCalledOnce();
    expect(watcher._unsubscribe).toBeNull();
  });

  it('ignores a failing subscription and a failing unsubscribe', async () => {
    const api = {
      getSystemTheme: async () => ({ mode: 'dark' }),
      onSystemTheme: () => {
        throw new Error('no such channel');
      },
    };
    const watcher = new SystemThemeWatcher({ api, rootEl });
    await expect(watcher.start()).resolves.toBeUndefined();

    watcher._unsubscribe = () => {
      throw new Error('already unsubscribed');
    };
    expect(() => watcher.stop()).not.toThrow();
    expect(watcher._unsubscribe).toBeNull();
    expect(() => watcher.stop()).not.toThrow();
  });

  it('still notifies listeners when the root element cannot be styled', () => {
    const watcher = new SystemThemeWatcher({ api: {}, rootEl: {} });

    expect(() => watcher._onTheme({ mode: 'dark' })).not.toThrow();
    expect(themeEvents).toEqual([{ mode: 'dark' }]);
  });

  it('ignores a failure to dispatch the theme event', () => {
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('dispatch failed');
    });
    const watcher = new SystemThemeWatcher({ api: {}, rootEl });

    expect(() => watcher._onTheme({ mode: 'dark' })).not.toThrow();
    expect(rootEl.classList.contains('dark')).toBe(true);
  });
});
