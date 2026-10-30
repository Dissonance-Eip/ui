import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { routeLaunchesToFirstInstance } from '../main/singleInstance.js';

function makeApp({ gotLock }) {
  const app = new EventEmitter();
  app.requestSingleInstanceLock = vi.fn(() => gotLock);
  app.quit = vi.fn();
  return app;
}

describe('routeLaunchesToFirstInstance', () => {
  it('opens a new window in the running instance when the app is launched again', () => {
    const app = makeApp({ gotLock: true });
    const openWindow = vi.fn();

    const isPrimary = routeLaunchesToFirstInstance({ app, openWindow });
    app.emit('second-instance');
    app.emit('second-instance');

    expect(isPrimary).toBe(true);
    expect(openWindow).toHaveBeenCalledTimes(2);
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('quits a second launch so it never runs a parallel main process', () => {
    const app = makeApp({ gotLock: false });
    const openWindow = vi.fn();

    const isPrimary = routeLaunchesToFirstInstance({ app, openWindow });

    expect(isPrimary).toBe(false);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.listenerCount('second-instance')).toBe(0);
  });
});
