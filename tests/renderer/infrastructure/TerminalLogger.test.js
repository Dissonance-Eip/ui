import { describe, it, expect, vi, afterEach } from 'vitest';
import { TerminalLogger } from '../../../renderer/infrastructure/TerminalLogger.js';

describe('TerminalLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards log and error lines to the main process as strings', () => {
    const bridge = { logToMain: vi.fn() };
    const logger = new TerminalLogger(bridge);

    logger.log(42);
    logger.error('failed');

    expect(bridge.logToMain).toHaveBeenNthCalledWith(1, 'log', '42');
    expect(bridge.logToMain).toHaveBeenNthCalledWith(2, 'error', 'failed');
  });

  it('prefixes status messages and marks errors', () => {
    const bridge = { logToMain: vi.fn() };
    const logger = new TerminalLogger(bridge);

    logger.setStatus('Ready');
    logger.setStatus('Processing failed', true);

    expect(bridge.logToMain).toHaveBeenNthCalledWith(1, 'log', 'STATUS: Ready');
    expect(bridge.logToMain).toHaveBeenNthCalledWith(2, 'log', 'STATUS(ERROR): Processing failed');
  });

  it('falls back to the console when there is no bridge', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new TerminalLogger(null);

    logger.log('hello');
    logger.error('oops');

    expect(log).toHaveBeenCalledWith('hello');
    expect(error).toHaveBeenCalledWith('oops');
  });

  it('falls back to the console when the bridge cannot log', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    new TerminalLogger({}).log('bridge has no logToMain');
    new TerminalLogger({
      logToMain: () => {
        throw new Error('IPC closed');
      },
    }).log('bridge threw');

    expect(log).toHaveBeenCalledWith('bridge has no logToMain');
    expect(log).toHaveBeenCalledWith('bridge threw');
  });

  it('uses console.log for levels the console does not have', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    new TerminalLogger(null)._send('verbose', 'detail');

    expect(log).toHaveBeenCalledWith('detail');
  });
});
