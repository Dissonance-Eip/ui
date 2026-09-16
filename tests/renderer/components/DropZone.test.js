// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DropZone } from '../../../renderer/components/DropZone.js';

const DRAGOVER_CLASSES = ['border-amber-400', 'bg-amber-50', 'dark:bg-amber-950/30'];

function dragEvent(type, dataTransfer) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
}

describe('DropZone', () => {
  let el;
  let api;
  let logger;
  let onFileSelected;
  let dropZone;

  beforeEach(() => {
    el = document.createElement('div');
    api = {
      openFile: vi.fn(async () => '/music/picked.wav'),
      getPathForFile: vi.fn(() => '/music/dropped.wav'),
    };
    logger = { log: vi.fn(), error: vi.fn(), setStatus: vi.fn() };
    onFileSelected = vi.fn();
    dropZone = new DropZone({ el, api, logger });
    dropZone.setOnFileSelected(onFileSelected);
    dropZone.mount();
  });

  it('mounts without an element', () => {
    const zone = new DropZone({ el: null, api, logger });

    expect(() => zone.mount()).not.toThrow();
    expect(zone.isMounted).toBe(true);
  });

  describe('clicking', () => {
    it('opens the file picker and passes on the chosen file', async () => {
      el.click();

      await vi.waitFor(() =>
        expect(onFileSelected).toHaveBeenCalledWith('/music/picked.wav', 'Selected')
      );
      expect(logger.setStatus).toHaveBeenCalledWith('Opening file dialog...');
    });

    it('reports a canceled picker without passing anything on', async () => {
      api.openFile.mockResolvedValue(null);

      await dropZone._onClick();

      expect(logger.log).toHaveBeenCalledWith('No file selected');
      expect(logger.setStatus).toHaveBeenCalledWith('Import canceled');
      expect(onFileSelected).not.toHaveBeenCalled();
    });

    it('reports a picker failure', async () => {
      api.openFile.mockRejectedValue(new Error('dialog denied'));

      await dropZone._onClick();

      expect(logger.error).toHaveBeenCalledWith('Import failed: Error: dialog denied');
    });

    it('works without a logger or a file callback', async () => {
      const zone = new DropZone({ el, api });

      await expect(zone._onClick()).resolves.toBeUndefined();
      api.openFile.mockResolvedValue(null);
      await expect(zone._onClick()).resolves.toBeUndefined();
      api.openFile.mockRejectedValue(new Error('dialog denied'));
      await expect(zone._onClick()).resolves.toBeUndefined();
    });

    it('stops listening once unmounted', async () => {
      dropZone.unmount();

      el.click();
      await Promise.resolve();

      expect(api.openFile).not.toHaveBeenCalled();
    });
  });

  describe('dragging', () => {
    it('highlights while a file is dragged over, and clears on leave', () => {
      const enter = dragEvent('dragenter');
      el.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(true);
      expect([...el.classList]).toEqual(DRAGOVER_CLASSES);

      el.dispatchEvent(dragEvent('dragover'));
      el.dispatchEvent(dragEvent('dragleave'));
      expect(el.classList.length).toBe(0);
    });

    it('passes on a dropped file using its resolved path and clears the highlight', () => {
      const file = { name: 'dropped.wav' };
      el.dispatchEvent(dragEvent('dragover'));

      const drop = dragEvent('drop', { files: [file] });
      el.dispatchEvent(drop);

      expect(drop.defaultPrevented).toBe(true);
      expect(api.getPathForFile).toHaveBeenCalledWith(file);
      expect(onFileSelected).toHaveBeenCalledWith('/music/dropped.wav', 'Dropped');
      expect(el.classList.length).toBe(0);
    });

    it.each([
      ['no data', undefined],
      ['no file list', {}],
      ['an empty file list', { files: [] }],
    ])('ignores a drop with %s', (_label, dataTransfer) => {
      el.dispatchEvent(dragEvent('drop', dataTransfer));

      expect(logger.log).toHaveBeenCalledWith('Drop: no files');
      expect(onFileSelected).not.toHaveBeenCalled();
    });

    it('uses the file path when the API cannot resolve one', () => {
      const zone = new DropZone({ el: document.createElement('div'), api: {}, logger });
      zone.setOnFileSelected(onFileSelected);

      zone._onDrop(dragEvent('drop', { files: [{ path: '/music/legacy.wav' }] }));

      expect(onFileSelected).toHaveBeenCalledWith('/music/legacy.wav', 'Dropped');
    });

    it('falls back to the file picker when a dropped file has no path', async () => {
      api.getPathForFile.mockReturnValue(null);

      el.dispatchEvent(dragEvent('drop', { files: [{ name: 'virtual.wav' }] }));

      expect(logger.log).toHaveBeenCalledWith(
        'Drop: file has no path (falling back to file picker)'
      );
      await vi.waitFor(() =>
        expect(onFileSelected).toHaveBeenCalledWith('/music/picked.wav', 'Selected')
      );
    });

    it('falls back to the picker for a pathless file even without getPathForFile', async () => {
      const zone = new DropZone({
        el: document.createElement('div'),
        api: { openFile: api.openFile },
      });

      zone._onDrop(dragEvent('drop', { files: [{ name: 'virtual.wav' }] }));

      await vi.waitFor(() => expect(api.openFile).toHaveBeenCalledOnce());
    });

    it('ignores drops without a logger', () => {
      const zone = new DropZone({ el: document.createElement('div'), api });

      expect(() => zone._onDrop(dragEvent('drop', {}))).not.toThrow();
    });
  });
});
