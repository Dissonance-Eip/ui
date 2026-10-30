import { describe, it, expect } from 'vitest';
import { exposeDebugGlobals } from '../renderer/app/debugGlobals.js';

describe('exposeDebugGlobals', () => {
  const logger = { name: 'logger' };
  const controller = { name: 'controller' };

  it('exposes the logger and controller in development', () => {
    const target = {};

    exposeDebugGlobals({ target, isDevelopment: true, logger, controller });

    expect(target.__logger).toBe(logger);
    expect(target.__app).toBe(controller);
  });

  it('exposes nothing in a production build', () => {
    const target = {};

    exposeDebugGlobals({ target, isDevelopment: false, logger, controller });

    expect(target).toEqual({});
  });
});
