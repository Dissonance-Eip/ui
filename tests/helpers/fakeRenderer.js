import { vi } from 'vitest';

/**
 * Stand-ins for the renderer's views, preload bridge and logger, so the
 * controller and its flows run under plain Node. Views record every call;
 * the bridge keeps each subscription callback so a test can fire it, and
 * hands back a spy as the unsubscribe function.
 */

/** A promise plus the function that resolves it. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every queued microtask and promise continuation run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

export const metadataReply = (tags = {}) => ({
  ok: true,
  audio: { sampleRate: 44100 },
  tags: { ...tags },
});

export function makeLogger() {
  return { log: vi.fn(), setStatus: vi.fn(), error: vi.fn() };
}

/** Records the callbacks a view registers under `on<Name>(cb)`. */
function makeCallbackSlots(names) {
  const callbacks = {};
  const registrars = Object.fromEntries(
    names.map((name) => [name, vi.fn((cb) => (callbacks[name] = cb))])
  );
  return { callbacks, registrars };
}

/**
 * An AnalyzeView whose tag form behaves like the real one: setBasicWavInfo
 * fills it, getMetadataTags reads it back, type() is the user.
 */
export function makeAnalyzeView({ modes = ['white_noise'] } = {}) {
  const emptyForm = { title: '', artist: '' };
  let form = { ...emptyForm };
  const { callbacks, registrars } = makeCallbackSlots([
    'onChangeFile',
    'onProcess',
    'onTagBlur',
    'onPlaybackStateChange',
  ]);
  return {
    callbacks,
    ...registrars,
    type(field, value) {
      form = { ...form, [field]: value };
    },
    mount: vi.fn(),
    unmount: vi.fn(),
    setBasicWavInfo: vi.fn((info) => {
      if (info && info.tags) form = { ...emptyForm, ...info.tags };
    }),
    getMetadataTags: vi.fn(() => ({ ...form })),
    getProcessingModes: vi.fn(() => modes),
    setSelectedFile: vi.fn(),
    setAudioPreviewFile: vi.fn(),
    clearAudioPreview: vi.fn(),
    pauseAudioPreview: vi.fn(),
    setProcessEnabled: vi.fn(),
  };
}

export function makeCompareView() {
  const { callbacks, registrars } = makeCallbackSlots(['onExport']);
  return {
    callbacks,
    ...registrars,
    mount: vi.fn(),
    unmount: vi.fn(),
    setOriginalInfo: vi.fn(),
    setProcessedInfo: vi.fn(),
    setAudioPreviewFiles: vi.fn(),
    setOriginalAudioPreviewFile: vi.fn(),
    pauseAudioPreviews: vi.fn(),
    clearAudioPreviews: vi.fn(),
    setExportEnabled: vi.fn(),
  };
}

export function makeUploadView() {
  const { callbacks, registrars } = makeCallbackSlots(['onFileImported']);
  return { callbacks, ...registrars, mount: vi.fn(), unmount: vi.fn() };
}

const SUBSCRIPTIONS = ['onAppFlushRequest', 'onPauseFileRequest', 'onTagsWrittenElsewhere'];

/**
 * A `window.dissonance`-like bridge. Request methods are async spies with
 * happy-path answers (override per test); subscriptions store their
 * callback in `listeners` and return a spy kept in `unsubscribes`.
 */
export function makeBridge({ processedPath = '/tmp/out.wav' } = {}) {
  const listeners = {};
  const unsubscribes = {};
  const subscription = (name) =>
    vi.fn((cb) => {
      listeners[name] = cb;
      unsubscribes[name] = vi.fn();
      return unsubscribes[name];
    });
  return {
    listeners,
    unsubscribes,
    openFile: vi.fn(async () => null),
    getPathForFile: vi.fn(() => null),
    readFileMetadata: vi.fn(async () => metadataReply()),
    processFile: vi.fn(async () => ({ ok: true, processedPath })),
    writeTags: vi.fn(async () => ({ ok: true })),
    exportFile: vi.fn(async () => ({ ok: true, exportedPath: '/out/song.wav' })),
    cleanupProcessedFile: vi.fn(async () => {}),
    onCoreStatus: subscription('onCoreStatus'),
    ...Object.fromEntries(SUBSCRIPTIONS.map((name) => [name, subscription(name)])),
  };
}

/** A window-like event target: `fire(type, event)` runs the listeners added for `type`. */
export function makeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, fn) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    }),
    removeEventListener: vi.fn((type, fn) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((listener) => listener !== fn)
      );
    }),
    fire(type, event) {
      (listeners.get(type) ?? []).forEach((fn) => fn(event));
    },
    listenerCount: (type) => (listeners.get(type) ?? []).length,
  };
}

/**
 * A DOM-element-like event target with a working `classList`
 * (`classList.has(name)` reads it back).
 */
export function makeElement() {
  const classes = new Set();
  return Object.assign(makeEventTarget(), {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      has: (name) => classes.has(name),
      get size() {
        return classes.size;
      },
    },
  });
}

/** A drag event carrying `files`; preventDefault/stopPropagation are spies. */
export function makeDragEvent(files = []) {
  return {
    dataTransfer: { files, dropEffect: 'none' },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

/** A ScreenNavigator double: every method is a spy. */
export function makeScreens() {
  return {
    showAnalyze: vi.fn(),
    showProcessing: vi.fn(),
    showCompare: vi.fn(),
    showUpload: vi.fn(),
    clearFileScreens: vi.fn(),
    pauseAllPreviews: vi.fn(),
    syncButtons: vi.fn(),
    setHeaderVisible: vi.fn(),
  };
}

/** A TagEditSession double whose flushes resolve at once. */
export function makeTagSession() {
  return {
    setFormFill: vi.fn(),
    clearFormFill: vi.fn(),
    saveBlurredForm: vi.fn(),
    setPlaying: vi.fn(),
    copyFormTo: vi.fn(),
    flush: vi.fn(async () => {}),
    pauseAndFlush: vi.fn(async () => {}),
  };
}
