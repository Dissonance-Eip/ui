import { describe, it, expect, vi } from 'vitest';
import { Disposable } from '../../../renderer/base/Disposable.js';

describe('Disposable', () => {
  it('returns non-function values from track() without registering them', () => {
    const disposable = new Disposable();

    expect(disposable.track(null)).toBeNull();
    expect(disposable.track('not a function')).toBe('not a function');
    expect(() => disposable.dispose()).not.toThrow();
  });

  it('runs tracked callbacks in reverse order on dispose()', () => {
    const disposable = new Disposable();
    const order = [];
    const second = () => order.push('second');

    disposable.track(() => order.push('first'));
    expect(disposable.track(second)).toBe(second);
    expect(disposable.isDisposed).toBe(false);

    disposable.dispose();

    expect(order).toEqual(['second', 'first']);
    expect(disposable.isDisposed).toBe(true);
  });

  it('disposes only once', () => {
    const disposable = new Disposable();
    const cleanup = vi.fn();
    disposable.track(cleanup);

    disposable.dispose();
    disposable.dispose();

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('keeps disposing when a callback throws', () => {
    const disposable = new Disposable();
    const earlier = vi.fn();
    disposable.track(earlier);
    disposable.track(() => {
      throw new Error('boom');
    });

    expect(() => disposable.dispose()).not.toThrow();
    expect(earlier).toHaveBeenCalledOnce();
  });

  it('runs callbacks tracked after dispose() immediately, ignoring errors', () => {
    const disposable = new Disposable();
    disposable.dispose();
    const late = vi.fn();

    expect(disposable.track(late)).toBe(late);
    expect(late).toHaveBeenCalledOnce();
    expect(() =>
      disposable.track(() => {
        throw new Error('boom');
      })
    ).not.toThrow();
  });
});
