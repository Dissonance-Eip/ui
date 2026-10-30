import { describe, it, expect, vi, afterEach } from 'vitest';
import { TerminalLogger } from '../renderer/infrastructure/TerminalLogger.js';

afterEach(() => vi.restoreAllMocks());

describe('TerminalLogger', () => {
  it('forwards lines over the bridge', () => {
    const bridge = { logToMain: vi.fn() };
    const logger = new TerminalLogger(bridge);

    logger.log('hi');
    logger.error('bad');
    logger.setStatus('Ready');
    logger.setStatus('Broken', true);

    expect(bridge.logToMain.mock.calls).toEqual([
      ['log', 'hi'],
      ['error', 'bad'],
      ['log', 'STATUS: Ready'],
      ['log', 'STATUS(ERROR): Broken'],
    ]);
  });

  it('falls back to the console without a bridge', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    new TerminalLogger().log('local');

    expect(log).toHaveBeenCalledWith('local');
  });

  it('reports a failing bridge and still logs the line locally', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('bridge gone');
    const bridge = {
      logToMain: () => {
        throw failure;
      },
    };

    new TerminalLogger(bridge).error('lost?');

    expect(error).toHaveBeenCalledWith('logToMain failed, logging here instead', failure);
    expect(error).toHaveBeenCalledWith('lost?');
  });
});
