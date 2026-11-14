import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemThemeWatcher } from '../renderer/infrastructure/SystemThemeWatcher.js';

const makeLogger = () => ({ log: vi.fn(), error: vi.fn(), setStatus: vi.fn() });
const makeRoot = () => ({ classList: { toggle: vi.fn() } });

let themeEvents;

beforeEach(() => {
  const target = new EventTarget();
  themeEvents = [];
  target.addEventListener('dissonance:theme', (e) => themeEvents.push(e.detail.mode));
  vi.stubGlobal('window', target);
});

afterEach(() => vi.unstubAllGlobals());

describe('SystemThemeWatcher', () => {
  it('applies the current theme, follows changes and unsubscribes on stop', async () => {
    let push;
    const unsubscribe = vi.fn();
    const api = {
      getSystemTheme: async () => ({ mode: 'dark' }),
      onSystemTheme: (cb) => {
        push = cb;
        return unsubscribe;
      },
    };
    const rootEl = makeRoot();
    const watcher = new SystemThemeWatcher({ api, rootEl, logger: makeLogger() });

    await watcher.start();
    push({ mode: 'light' });
    watcher.stop();

    expect(rootEl.classList.toggle.mock.calls).toEqual([
      ['dark', true],
      ['dark', false],
    ]);
    expect(themeEvents).toEqual(['dark', 'light']);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('logs failures instead of throwing', async () => {
    const logger = makeLogger();
    const api = {
      getSystemTheme: async () => {
        throw new Error('no theme');
      },
      onSystemTheme: () => {
        throw new Error('no subscription');
      },
    };
    const watcher = new SystemThemeWatcher({ api, rootEl: makeRoot(), logger });

    await expect(watcher.start()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('Could not read the system theme: Error: no theme');
    expect(logger.error).toHaveBeenCalledWith(
      'Could not subscribe to system theme changes: Error: no subscription'
    );
  });

  it('logs a failing unsubscribe', async () => {
    const logger = makeLogger();
    const api = {
      getSystemTheme: async () => ({ mode: 'light' }),
      onSystemTheme: () => () => {
        throw new Error('stuck');
      },
    };
    const watcher = new SystemThemeWatcher({ api, rootEl: makeRoot(), logger });
    await watcher.start();

    watcher.stop();

    expect(logger.error).toHaveBeenCalledWith(
      'Could not unsubscribe from system theme changes: Error: stuck'
    );
  });

  it('logs a theme it cannot apply', () => {
    const logger = makeLogger();
    const rootEl = {
      classList: {
        toggle: () => {
          throw new Error('no root');
        },
      },
    };
    const watcher = new SystemThemeWatcher({ api: {}, rootEl, logger });

    watcher._onTheme({ mode: 'dark' });

    expect(logger.error).toHaveBeenCalledWith('Could not apply the dark theme: Error: no root');
    expect(themeEvents).toEqual(['dark']);
  });
});
