import { describe, it, expect, vi } from 'vitest';
import { Disposable } from '../renderer/base/Disposable.js';

describe('Disposable', () => {
  it('runs teardowns once, newest first', () => {
    const order = [];
    const d = new Disposable();
    d.track(() => order.push('first'));
    d.track(() => order.push('second'));

    d.dispose();
    d.dispose();

    expect(order).toEqual(['second', 'first']);
  });

  it('runs every teardown even when one throws, then throws them all', () => {
    const d = new Disposable();
    const after = vi.fn();
    const boom = new Error('boom');
    d.track(after);
    d.track(() => {
      throw boom;
    });

    let thrown;
    try {
      d.dispose();
    } catch (e) {
      thrown = e;
    }

    expect(after).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown.errors).toEqual([boom]);
  });

  it('runs a teardown tracked after dispose right away', () => {
    const d = new Disposable();
    d.dispose();
    const late = vi.fn();

    d.track(late);

    expect(late).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-function', () => {
    const d = new Disposable();

    expect(d.track(null)).toBeNull();
    expect(() => d.dispose()).not.toThrow();
  });
});
