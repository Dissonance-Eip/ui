import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../main/logger.js';

afterEach(() => vi.restoreAllMocks());

describe('main logger', () => {
  it.each(['log', 'warn', 'error'])('%s writes to console.%s', (level) => {
    const spy = vi.spyOn(console, level).mockImplementation(() => {});

    logger[level]('message', 42);

    expect(spy).toHaveBeenCalledWith('message', 42);
  });

  it('at() picks the named level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.at('error', 'boom');

    expect(spy).toHaveBeenCalledWith('boom');
  });

  it('at() falls back to log for an unknown level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.at('trace', 'hello');

    expect(spy).toHaveBeenCalledWith('hello');
  });
});
