import { describe, it, expect, vi } from 'vitest';
import { BaseController } from '../../../renderer/base/BaseController.js';

describe('BaseController', () => {
  it('tracks the started state across start() and stop()', () => {
    const controller = new BaseController();
    expect(controller.isStarted).toBe(false);

    controller.start();
    expect(controller.isStarted).toBe(true);

    controller.stop();
    expect(controller.isStarted).toBe(false);
  });

  it('disposes tracked resources on stop()', () => {
    const controller = new BaseController();
    const cleanup = vi.fn();
    controller.track(cleanup);

    controller.stop();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(controller.isDisposed).toBe(true);
  });
});
