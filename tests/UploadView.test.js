import { describe, it, expect, vi } from 'vitest';
import { UploadView } from '../renderer/views/UploadView.js';
import { DissonanceApi } from '../renderer/infrastructure/DissonanceApi.js';
import { makeBridge, makeElement, makeLogger, settle } from './helpers/fakeRenderer.js';

const PICKED = '/music/picked.wav';
const LAST = '/music/last.wav';

function makeUploadView() {
  const el = makeElement();
  const bridge = makeBridge();
  bridge.openFile = vi.fn(async () => PICKED);
  const view = new UploadView({
    dropZoneEl: el,
    api: new DissonanceApi(bridge),
    logger: makeLogger(),
    getLastFilePath: () => LAST,
  });
  return { view, el, bridge };
}

describe('UploadView', () => {
  it('reports a file picked from the drop zone', async () => {
    const { view, el } = makeUploadView();
    const onFileImported = vi.fn();
    view.onFileImported(onFileImported);
    view.mount();

    el.fire('click');
    await settle();

    expect(onFileImported).toHaveBeenCalledWith(PICKED, 'Selected');
  });

  it('opens the picker in the last imported folder', async () => {
    const { view, el, bridge } = makeUploadView();
    view.mount();

    el.fire('click');
    await settle();

    expect(bridge.openFile).toHaveBeenCalledWith(LAST);
  });

  it('stops listening to the drop zone once unmounted', () => {
    const { view, el } = makeUploadView();
    view.mount();

    view.unmount();

    expect(el.listenerCount('click')).toBe(0);
    expect(el.listenerCount('drop')).toBe(0);
  });
});

describe('UploadView error message', () => {
  const makeView = () => {
    const errorEl = { textContent: '', hidden: true };
    return { view: new UploadView({ errorEl }), errorEl };
  };

  it('shows the message in the alert', () => {
    const { view, errorEl } = makeView();

    view.showError('Only WAV files are supported.');

    expect(errorEl.textContent).toBe('Only WAV files are supported.');
    expect(errorEl.hidden).toBe(false);
  });

  it('hides and empties the alert on clearError', () => {
    const { view, errorEl } = makeView();
    view.showError('boom');

    view.clearError();

    expect(errorEl.textContent).toBe('');
    expect(errorEl.hidden).toBe(true);
  });

  it('does nothing without an error element', () => {
    const view = new UploadView({});

    expect(() => view.showError('boom')).not.toThrow();
    expect(() => view.clearError()).not.toThrow();
  });
});
