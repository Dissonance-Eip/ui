import { describe, it, expect } from 'vitest';
import { ViewRouter } from '../../../renderer/infrastructure/ViewRouter.js';

describe('ViewRouter', () => {
  it('shows the named view and hides the others', () => {
    const views = {
      upload: { hidden: false },
      analyze: { hidden: true },
      compare: { hidden: false },
    };
    const router = new ViewRouter(views);
    expect(router.getCurrent()).toBeNull();

    router.show('analyze');

    expect(views.upload.hidden).toBe(true);
    expect(views.analyze.hidden).toBe(false);
    expect(views.compare.hidden).toBe(true);
    expect(router.getCurrent()).toBe('analyze');
  });

  it('skips views whose element is missing', () => {
    const views = { upload: { hidden: true }, processing: null };
    const router = new ViewRouter(views);

    expect(() => router.show('upload')).not.toThrow();
    expect(views.upload.hidden).toBe(false);
  });
});
