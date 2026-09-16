// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { UploadView } from '../../../renderer/views/UploadView.js';

describe('UploadView', () => {
  it('passes on files picked in its drop zone', async () => {
    const dropZoneEl = document.createElement('div');
    const api = { openFile: vi.fn(async () => '/music/song.wav') };
    const view = new UploadView({ dropZoneEl, api, logger: null });
    const onFileImported = vi.fn();

    view.onFileImported(onFileImported);
    view.mount();
    dropZoneEl.click();

    await vi.waitFor(() =>
      expect(onFileImported).toHaveBeenCalledWith('/music/song.wav', 'Selected')
    );
  });

  it('mounts and unmounts its drop zone', () => {
    const view = new UploadView({ dropZoneEl: document.createElement('div'), api: {} });

    view.mount();
    expect(view.dropZone.isMounted).toBe(true);

    view.unmount();
    expect(view.dropZone.isMounted).toBe(false);
  });
});
