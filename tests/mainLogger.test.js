import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { logger, logUnhandledErrors } from '../main/logger.js';

afterEach(() => vi.restoreAllMocks());

describe('main logger', () => {
  it('log writes the line as it is', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.log('message', 42);

    expect(spy).toHaveBeenCalledWith('message', 42);
  });

  it.each(['warn', 'error'])('%s marks the line [handled]', (level) => {
    const spy = vi.spyOn(console, level).mockImplementation(() => {});

    logger[level]('message', 42);

    expect(spy).toHaveBeenCalledWith('[handled]', 'message', 42);
  });

  it('unhandled marks the line [unhandled] on console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.unhandled('boom');

    expect(spy).toHaveBeenCalledWith('[unhandled]', 'boom');
  });

  it('at() picks the named level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.at('error', 'boom');
    logger.at('unhandled', 'bang');

    expect(spy.mock.calls).toEqual([
      ['[handled]', 'boom'],
      ['[unhandled]', 'bang'],
    ]);
  });

  it('at() falls back to log for an unknown level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.at('trace', 'hello');

    expect(spy).toHaveBeenCalledWith('hello');
  });
});

describe('logUnhandledErrors', () => {
  /** Hooks a process double and silences console.error. */
  function setup() {
    const proc = new EventEmitter();
    logUnhandledErrors(proc);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    return { proc, error };
  }

  it('logs an uncaught exception with its stack', () => {
    const { proc, error } = setup();
    const err = new Error('boom');

    proc.emit('uncaughtExceptionMonitor', err, 'uncaughtException');

    expect(error).toHaveBeenCalledWith('[unhandled]', 'Uncaught exception:', err.stack);
  });

  it('only watches uncaught exceptions, so Electron still shows its error dialog', () => {
    const { proc } = setup();

    // Electron skips its dialog as soon as the app adds an uncaughtException listener.
    expect(proc.listenerCount('uncaughtException')).toBe(0);
    expect(proc.listenerCount('uncaughtExceptionMonitor')).toBe(1);
  });

  it('logs an unhandled rejection with its stack and sets the exit code Electron would', () => {
    const { proc, error } = setup();
    const err = new Error('rejected');

    proc.emit('unhandledRejection', err);

    expect(error).toHaveBeenCalledWith('[unhandled]', 'Unhandled rejection:', err.stack);
    expect(proc.exitCode).toBe(1);
  });

  it.each([
    ['a reason that is not an error as text', 'plain reason', 'plain reason'],
    ['a reason that cannot become text as a placeholder', Object.create(null), '(unprintable)'],
  ])('logs %s', (_case, reason, expected) => {
    const { proc, error } = setup();

    proc.emit('unhandledRejection', reason);

    expect(error).toHaveBeenCalledWith('[unhandled]', 'Unhandled rejection:', expected);
  });

  it("logs the stack only, never the error's other fields", () => {
    const { proc, error } = setup();
    const err = Object.assign(new Error('read failed'), { data: 'secret file contents' });

    proc.emit('uncaughtExceptionMonitor', err, 'uncaughtException');

    expect(JSON.stringify(error.mock.calls)).not.toContain('secret file contents');
  });
});
