import { describe, it, expect, vi } from 'vitest';
import { DropZone } from '../renderer/components/DropZone.js';
import { DissonanceApi } from '../renderer/infrastructure/DissonanceApi.js';
import { settle, makeLogger, makeBridge, makeDragEvent } from './helpers/fakeRenderer.js';

const SONG = '/music/song.wav';
const LAST = '/music/last.wav';

function makeDropZone() {
  const bridge = makeBridge();
  const logger = makeLogger();
  const onFileSelected = vi.fn();
  const dropZone = new DropZone({
    el: null,
    api: new DissonanceApi(bridge),
    logger,
    getLastFilePath: () => LAST,
  });
  dropZone.setOnFileSelected(onFileSelected);
  return { dropZone, bridge, logger, onFileSelected };
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
