import { describe, it, expect, vi } from 'vitest';
import { DropZone } from '../renderer/components/DropZone.js';
import { DissonanceApi } from '../renderer/infrastructure/DissonanceApi.js';
import {
  settle,
  makeLogger,
  makeBridge,
  makeDragEvent,
  makeElement,
} from './helpers/fakeRenderer.js';

const SONG = '/music/song.wav';
const LAST = '/music/last.wav';
const HIGHLIGHT = 'border-amber-400';
const DRAG_EVENTS = ['click', 'dragenter', 'dragover', 'dragleave', 'drop'];

function makeDropZone({ el = null } = {}) {
  const bridge = makeBridge();
  const logger = makeLogger();
  const onFileSelected = vi.fn();
  const dropZone = new DropZone({
    el,
    api: new DissonanceApi(bridge),
    logger,
    getLastFilePath: () => LAST,
  });
  dropZone.setOnFileSelected(onFileSelected);
  return { dropZone, bridge, logger, onFileSelected };
}

/** A DropZone mounted on a fake element, driven by firing DOM events at it. */
function makeMountedDropZone() {
  const el = makeElement();
  const parts = makeDropZone({ el });
  parts.dropZone.mount();
  return { el, ...parts };
}

describe('DropZone — click to browse', () => {
  it('opens the dialog in the last folder and emits the pick', async () => {
    const { dropZone, bridge, logger, onFileSelected } = makeDropZone();
    bridge.openFile.mockResolvedValueOnce(SONG);

    await dropZone._onClick();

    expect(bridge.openFile).toHaveBeenCalledWith(LAST);
    expect(logger.setStatus).toHaveBeenCalledWith('Opening file dialog...');
    expect(onFileSelected).toHaveBeenCalledWith(SONG, 'Selected');
  });

  it('emits nothing when the dialog is cancelled', async () => {
    const { dropZone, logger, onFileSelected } = makeDropZone();

    await dropZone._onClick();

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('No file selected');
    expect(logger.setStatus).toHaveBeenLastCalledWith('Import canceled');
  });

  it('logs a dialog that fails', async () => {
    const { dropZone, bridge, logger } = makeDropZone();
    bridge.openFile.mockRejectedValueOnce(new Error('no dialog'));

    await dropZone._onClick();

    expect(logger.error).toHaveBeenCalledWith('Import failed: Error: no dialog');
  });
});

describe('DropZone — drop', () => {
  it('emits the dropped file’s path and keeps the drop from reaching the window', () => {
    const { dropZone, bridge, onFileSelected } = makeDropZone();
    const file = { name: 'song.wav' };
    bridge.getPathForFile.mockReturnValueOnce(SONG);
    const event = makeDragEvent([file]);

    dropZone._onDrop(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(bridge.getPathForFile).toHaveBeenCalledWith(file);
    expect(onFileSelected).toHaveBeenCalledWith(SONG, 'Dropped');
  });

  it('logs a drop without files', () => {
    const { dropZone, logger, onFileSelected } = makeDropZone();

    dropZone._onDrop(makeDragEvent([]));

    expect(logger.log).toHaveBeenCalledWith('Drop: no files');
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('falls back to the dialog when the dropped file has no path', async () => {
    const { dropZone, bridge, onFileSelected } = makeDropZone();
    bridge.openFile.mockResolvedValueOnce(SONG);

    dropZone._onDrop(makeDragEvent([{ name: 'x.wav' }]));
    await settle();

    expect(bridge.openFile).toHaveBeenCalledWith(LAST);
    expect(onFileSelected).toHaveBeenCalledWith(SONG, 'Selected');
  });
});

describe('DropZone — mounted on its element', () => {
  it('a click on the zone opens the dialog and emits the pick', async () => {
    const { el, bridge, onFileSelected } = makeMountedDropZone();
    bridge.openFile.mockResolvedValueOnce(SONG);

    el.fire('click');
    await settle();

    expect(bridge.openFile).toHaveBeenCalledWith(LAST);
    expect(onFileSelected).toHaveBeenCalledWith(SONG, 'Selected');
  });

  it.each(['dragenter', 'dragover'])('%s highlights the zone and claims the drag', (type) => {
    const { el } = makeMountedDropZone();
    const event = makeDragEvent();

    el.fire(type, event);

    expect(el.classList.has(HIGHLIGHT)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('dragleave removes the highlight', () => {
    const { el } = makeMountedDropZone();
    el.fire('dragenter', makeDragEvent());

    el.fire('dragleave', makeDragEvent());

    expect(el.classList.size).toBe(0);
  });

  it('a drop removes the highlight and emits the dropped file once', () => {
    const { el, bridge, onFileSelected } = makeMountedDropZone();
    bridge.getPathForFile.mockReturnValue(SONG);
    el.fire('dragover', makeDragEvent());

    el.fire('drop', makeDragEvent([{ name: 'song.wav' }]));

    expect(el.classList.size).toBe(0);
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(SONG, 'Dropped');
  });

  it('stops listening once unmounted', () => {
    const { el, dropZone, bridge, onFileSelected } = makeMountedDropZone();
    bridge.getPathForFile.mockReturnValue(SONG);

    dropZone.unmount();
    el.fire('dragenter', makeDragEvent());
    el.fire('drop', makeDragEvent([{ name: 'song.wav' }]));

    expect(DRAG_EVENTS.map((type) => el.listenerCount(type))).toEqual([0, 0, 0, 0, 0]);
    expect(el.classList.size).toBe(0);
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('mounts without an element and emits nothing', () => {
    const { dropZone, onFileSelected } = makeDropZone();

    dropZone.mount();

    expect(dropZone.isMounted).toBe(true);
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('works with no file-selected callback set', () => {
    const { el, dropZone, bridge } = makeMountedDropZone();
    dropZone.setOnFileSelected(null);
    bridge.getPathForFile.mockReturnValue(SONG);

    expect(() => el.fire('drop', makeDragEvent([{ name: 'song.wav' }]))).not.toThrow();
  });
});
