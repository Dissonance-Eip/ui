import { describe, it, expect, vi } from 'vitest';
import { BaseApi } from '../../../renderer/base/BaseApi.js';

describe('BaseApi', () => {
  it('reports whether a bridge is available', () => {
    expect(new BaseApi({}).isAvailable()).toBe(true);
    expect(new BaseApi(null).isAvailable()).toBe(false);
    expect(new BaseApi().isAvailable()).toBe(false);
  });

  it('calls the bridge method with its arguments and returns the result', () => {
    const bridge = { add: vi.fn((a, b) => a + b) };

    expect(new BaseApi(bridge)._call('add', 2, 3)).toBe(5);
    expect(bridge.add).toHaveBeenCalledWith(2, 3);
  });

  it('throws when there is no bridge', () => {
    expect(() => new BaseApi(null)._call('openFile')).toThrow('API bridge is not available');
  });

  it('throws when the bridge has no function of that name', () => {
    expect(() => new BaseApi({})._call('missing')).toThrow('API method not available: missing');
    expect(() => new BaseApi({ version: 1 })._call('version')).toThrow(
      'API method not available: version'
    );
  });
});
