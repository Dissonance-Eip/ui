/**
 * The tag form's auto-save: owns the TagWriteQueue and what the form was
 * last filled with, and decides what a snapshot of the form may write.
 *
 *   • tag blur → snapshot the form into the queue for the shown file
 *   • playback → the queue holds writes while audio plays, flushes on pause
 *   • pauseAndFlush() → the one chokepoint used before a file switch, before
 *     processing, on restart and on quit (see its comment)
 *
 * The form fill guards against #111: until the form holds the file's own
 * tags (read pending or failed), only fields the user changed are saved, so
 * an empty placeholder form can never wipe the file's tags.
 */
import { TagWriteQueue } from '../services/TagWriteQueue.js';

const asText = (value) => (value == null ? '' : String(value));

export class TagEditSession {
  /**
   * @param {{ api: object, logger?: object, state: object, analyzeView: object,
   *   pausePreviews: () => void, queue?: TagWriteQueue }} deps
   *   pausePreviews — pauses every player in the window before a flush.
   *   queue — injectable for tests; built over api.writeTags otherwise.
   */
  constructor({ api, logger, state, analyzeView, pausePreviews, queue }) {
    this.state = state;
    this.analyzeView = analyzeView;
    this.pausePreviews = pausePreviews;

    // What the form was last filled with:
    //   { filePath, loaded, tags } — loaded is true once the file's own tags
    //   were read into it. null when no file is shown.
    this._formFill = null;

    // Serialised, blockable queue for auto-saving tag edits. Blocked while
    // the audio element is streaming a file; flushed on quit.
    this._queue =
      queue ??
      new TagWriteQueue({
        writeFn: (filePath, tags) => api.writeTags(filePath, tags),
        onError: (err) => logger?.log?.(`Auto-save tags failed: ${err}`),
      });
  }

  /** Record what the form now shows for `filePath`; loaded = the file's own tags. */
  setFormFill(filePath, { loaded, tags }) {
    this._formFill = Object.freeze({ filePath, loaded, tags });
  }

  clearFormFill() {
    this._formFill = null;
  }

  /** A blur snapshot of the form, for the file shown now. */
  saveBlurredForm(tags) {
    const filePath = this.state.currentFilePath;
    const toSave = this.tagsToSave(filePath, tags);
    if (toSave) this._queue.enqueue(filePath, toSave);
  }

  /** Hold writes while audio plays; a pause flushes whatever is queued. */
  setPlaying(isPlaying) {
    this._queue.setBlocked(isPlaying);
  }

  /** Queue the form's edits for another file (the processed output). */
  copyFormTo(filePath) {
    const tags = this.formTagsToSave();
    if (tags) this._queue.enqueue(filePath, tags);
  }

  flush() {
    return this._queue.flush();
  }

  /**
   * Safe-flush the tag queue:
   *   1. Pause every audio preview so no audio element is streaming the
   *      file we're about to rewrite.
   *   2. Snapshot the current form into the queue for the current file path
   *      so any tag edit that didn't fire blur (native dialog stealing focus,
   *      Cmd+Q with focus in an input, clicking Process from an input, etc.)
   *      is captured — unless the form is still empty because the file's
   *      tags never loaded and the user typed nothing (#111).
   *   3. Await the queue draining all pending + in-flight writes.
   */
  async pauseAndFlush() {
    this.pausePreviews();
    const tags = this.formTagsToSave();
    if (tags) this._queue.enqueue(this.state.currentFilePath, tags);
    await this._queue.flush();
  }

  /** @returns {object|null} what to save from the form for the current file, or null for nothing */
  formTagsToSave() {
    const filePath = this.state.currentFilePath;
    if (!filePath) return null;
    return this.tagsToSave(filePath, this.analyzeView.getMetadataTags());
  }

  /**
   * Once the form holds `filePath`'s own tags, the whole snapshot is saved
   * (main writes only what differs from what this window read). Before that
   * — read pending or failed — the form is an empty placeholder: only the
   * fields the user actually changed are saved. Nothing changed → null.
   * @returns {object|null}
   */
  tagsToSave(filePath, tags) {
    if (!filePath) return null;
    const fill = this._formFill && this._formFill.filePath === filePath ? this._formFill : null;
    if (fill && fill.loaded) return tags;
    const shown = fill ? fill.tags : {};
    const edited = Object.entries(tags || {}).filter(
      ([name, value]) => asText(value) !== asText(shown[name])
    );
    return edited.length > 0 ? Object.fromEntries(edited) : null;
  }
}
