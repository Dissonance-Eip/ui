import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootstrap } from '../renderer/app/bootstrap.js';
import { makeBridge, makeDocument, makeWindow, settle } from './helpers/fakeRenderer.js';

const SCREEN_IDS = ['view-upload', 'view-analyze', 'view-processing', 'view-compare'];

/** Stubs `window` and `document` for one boot; restored after each test. */
function stubRendererGlobals({ bridge = makeBridge() } = {}) {
  const win = makeWindow(bridge);
  const doc = makeDocument();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  return { win, doc, bridge };
}

const loggedLines = (bridge) => bridge.logToMain.mock.calls.map(([, message]) => message);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('bootstrap', () => {
  it('shows the upload screen and hides the others', () => {
    const { doc } = stubRendererGlobals();

    bootstrap();

    const hidden = SCREEN_IDS.map((id) => doc.elements.get(id).hidden);
    expect(hidden).toEqual([false, true, true, true]);
  });

  it('subscribes to the main-process events and reports Ready', () => {
    const { bridge } = stubRendererGlobals();

    bootstrap();

    expect(bridge.onAppFlushRequest).toHaveBeenCalledTimes(1);
    expect(bridge.onPauseFileRequest).toHaveBeenCalledTimes(1);
    expect(bridge.onTagsWrittenElsewhere).toHaveBeenCalledTimes(1);
    expect(bridge.onCoreStatus).toHaveBeenCalledTimes(1);
    expect(loggedLines(bridge)).toContain('STATUS: Ready');
  });

  it('applies the OS theme on start', async () => {
    const { doc } = stubRendererGlobals({ bridge: makeBridge({ themeMode: 'dark' }) });

    bootstrap();
    await settle();

    expect(doc.documentElement.classList.toggle).toHaveBeenCalledWith('dark', true);
  });

  it('opens the file dialog when the drop zone is clicked', async () => {
    const { doc, bridge } = stubRendererGlobals();
    bootstrap();

    doc.elements.get('dropZone').fire('click');
    await settle();

    expect(bridge.openFile).toHaveBeenCalledTimes(1);
  });

  it('exposes the debug globals in a development build only', () => {
    const dev = stubRendererGlobals({ bridge: makeBridge({ isDevelopment: true }) });
    bootstrap();
    const prod = stubRendererGlobals({ bridge: makeBridge({ isDevelopment: false }) });
    bootstrap();

    expect(dev.win.__app).toBeDefined();
    expect(dev.win.__logger).toBeDefined();
    expect(prod.win.__app).toBeUndefined();
    expect(prod.win.__logger).toBeUndefined();
  });

  it('wires nothing when the preload bridge is missing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { doc } = stubRendererGlobals({ bridge: null });

    bootstrap();

    expect(doc.getElementById).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('API NOT available'));
  });
});

describe('bootstrap — errors nothing caught', () => {
  const unhandledLines = (bridge) =>
    bridge.logToMain.mock.calls.filter(([level]) => level === 'unhandled').map(([, line]) => line);

  it('listens once per window for uncaught errors and unhandled rejections', () => {
    const { win } = stubRendererGlobals();

    bootstrap();

    expect(win.listenerCount('error')).toBe(1);
    expect(win.listenerCount('unhandledrejection')).toBe(1);
  });

  it('forwards an uncaught error to main as unhandled, with its stack', () => {
    const { win, bridge } = stubRendererGlobals();
    bootstrap();
    const error = new Error('boom');

    win.fire('error', { error, message: 'Uncaught Error: boom' });

    expect(unhandledLines(bridge)).toEqual([error.stack]);
  });

  it('forwards the message and location of an error event without an error object', () => {
    const { win, bridge } = stubRendererGlobals();
    bootstrap();

    win.fire('error', {
      error: null,
      message: 'Script error.',
      filename: 'app.js',
      lineno: 3,
      colno: 7,
    });

    expect(unhandledLines(bridge)).toEqual(['Script error. (app.js:3:7)']);
  });

  it.each([
    ['an error with its stack', new Error('rejected'), (reason) => reason.stack],
    ['a reason that is not an error as text', 'plain reason', () => 'plain reason'],
    [
      'a reason that cannot become text as a placeholder',
      Object.create(null),
      () => '(unprintable)',
    ],
  ])('forwards an unhandled rejection of %s', (_case, reason, expected) => {
    const { win, bridge } = stubRendererGlobals();
    bootstrap();

    win.fire('unhandledrejection', { reason });

    expect(unhandledLines(bridge)).toEqual([expected(reason)]);
  });

  it("forwards the stack only, never the error's other fields", () => {
    const { win, bridge } = stubRendererGlobals();
    bootstrap();
    const reason = Object.assign(new Error('read failed'), { data: 'secret file contents' });

    win.fire('unhandledrejection', { reason });

    expect(JSON.stringify(bridge.logToMain.mock.calls)).not.toContain('secret file contents');
  });

  it('leaves the error to reach DevTools too', () => {
    const { win } = stubRendererGlobals();
    bootstrap();
    const event = { error: new Error('boom'), preventDefault: vi.fn() };

    win.fire('error', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('still listens when the preload bridge is missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { win } = stubRendererGlobals({ bridge: null });

    bootstrap();
    win.fire('unhandledrejection', { reason: new Error('early') });

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error: early'));
  });
});

describe('renderer entry (index.js)', () => {
  it('boots the app once the DOM has loaded', async () => {
    const { win, bridge } = stubRendererGlobals();
    await import('../renderer/index.js');
    const bootedEarly = loggedLines(bridge).includes('STATUS: Ready');

    win.fire('DOMContentLoaded');

    expect(bootedEarly).toBe(false);
    expect(loggedLines(bridge)).toContain('STATUS: Ready');
  });
});
