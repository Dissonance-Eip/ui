import { describe, it, expect } from 'vitest';
import { ViewRouter } from '../renderer/infrastructure/ViewRouter.js';

function makeScreens() {
  return { upload: { hidden: false }, analyze: { hidden: false }, compare: { hidden: false } };
}

describe('ViewRouter', () => {
  it('shows the named screen and hides every other one', () => {
    const screens = makeScreens();
    const router = new ViewRouter(screens);

    router.show('analyze');

    expect(screens.upload.hidden).toBe(true);
    expect(screens.analyze.hidden).toBe(false);
    expect(screens.compare.hidden).toBe(true);
  });

  it('hides the previous screen when switching', () => {
    const screens = makeScreens();
    const router = new ViewRouter(screens);
    router.show('upload');

    router.show('compare');

    expect(screens.upload.hidden).toBe(true);
    expect(screens.compare.hidden).toBe(false);
  });

  it('skips a screen whose element is missing', () => {
    const screens = { ...makeScreens(), processing: null };
    const router = new ViewRouter(screens);

    expect(() => router.show('processing')).not.toThrow();
    expect(screens.upload.hidden).toBe(true);
  });
});
