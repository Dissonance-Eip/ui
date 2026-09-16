import { describe, it, expect } from 'vitest';
import { Logger } from '../../../renderer/base/Logger.js';

describe('Logger', () => {
  it('provides no-op defaults for subclasses to override', () => {
    const logger = new Logger();

    expect(logger.log('message')).toBeUndefined();
    expect(logger.error('message')).toBeUndefined();
    expect(logger.setStatus('message')).toBeUndefined();
    expect(logger.setStatus('message', true)).toBeUndefined();
  });
});
