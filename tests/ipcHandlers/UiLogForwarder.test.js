import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadModule } from '../helpers/loadModule.js';

describe('UiLogForwarder', () => {
  let forward;

  beforeEach(() => {
    const listeners = {};
    const ipcMain = {
      on: vi.fn((channel, handler) => {
        listeners[channel] = handler;
      }),
    };
    const { UiLogForwarder } = loadModule('ipcHandlers/UiLogForwarder.js', {
      electron: { ipcMain },
    });

    new UiLogForwarder().register();
    forward = listeners['ui:log'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints renderer lines at their level with a [UI] prefix', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    forward({}, { level: 'error', message: 42 });

    expect(error).toHaveBeenCalledWith('[UI] 42');
  });

  it('defaults to console.log and an empty message', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    forward({}, null);
    forward({}, { level: 'verbose', message: null });

    expect(log).toHaveBeenNthCalledWith(1, '[UI] ');
    expect(log).toHaveBeenNthCalledWith(2, '[UI] ');
  });

  it('reports lines it cannot print', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const unprintable = {
      toString() {
        throw new Error('cannot convert');
      },
    };

    forward({}, { level: unprintable, message: 'x' });

    expect(log).toHaveBeenCalledWith('[UI] (log forwarding failed)', expect.any(Error));
  });
});
