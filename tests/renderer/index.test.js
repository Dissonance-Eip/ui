// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { bootstrap } from '../../renderer/app/bootstrap.js';
import '../../renderer/index.js';

vi.mock('../../renderer/app/bootstrap.js', () => ({ bootstrap: vi.fn() }));

describe('renderer entry point', () => {
  it('bootstraps the app once the page has loaded', () => {
    expect(bootstrap).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('DOMContentLoaded'));

    expect(bootstrap).toHaveBeenCalledOnce();
  });
});
