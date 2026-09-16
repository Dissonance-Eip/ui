import { describe, it, expect, vi } from 'vitest';
import { BaseComponent } from '../../../renderer/base/BaseComponent.js';

function fakeElement() {
  return { addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

describe('BaseComponent', () => {
  it('tracks the mounted state across mount() and unmount()', () => {
    const component = new BaseComponent();
    expect(component.isMounted).toBe(false);

    component.mount();
    expect(component.isMounted).toBe(true);

    component.unmount();
    expect(component.isMounted).toBe(false);
    expect(component.isDisposed).toBe(true);
  });

  it('adds a listener and removes it on unmount()', () => {
    const component = new BaseComponent();
    const el = fakeElement();
    const handler = vi.fn();
    const options = { passive: true };

    expect(component.listen(el, 'click', handler, options)).toBe(handler);
    expect(el.addEventListener).toHaveBeenCalledWith('click', handler, options);

    component.unmount();
    expect(el.removeEventListener).toHaveBeenCalledWith('click', handler, options);
  });

  it('ignores missing elements and objects that cannot listen', () => {
    const component = new BaseComponent();

    expect(component.listen(null, 'click', vi.fn())).toBeNull();
    expect(component.listen({}, 'click', vi.fn())).toBeNull();
  });

  it('ignores errors when removing a listener', () => {
    const component = new BaseComponent();
    const el = fakeElement();
    el.removeEventListener.mockImplementation(() => {
      throw new Error('element detached');
    });
    component.listen(el, 'click', vi.fn());

    expect(() => component.unmount()).not.toThrow();
  });
});
