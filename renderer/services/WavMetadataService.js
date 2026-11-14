import { basename } from '../utils/pathUtils.js';

/**
 * Converts core:readMetadata responses into the display-friendly shape
 * used by AnalyzeView/CompareView:
 *   { filename, sampleRate, channels, durationSec, tags }
 * Gracefully handles a missing `audio` block (returns blanks) so the UI
 * can show a placeholder while metadata is still loading.
 */
export class WavMetadataService {
  /**
   * Convenience adapter: unwraps a `core:readMetadata` IPC response
   * `{ ok, audio, tags }` into the basicInfo shape.
   * Missing/`null` blocks default to `null`/`{}` rather than throwing.
   */
  toBasicInfoFromMetadata(filePath, metadataResponse) {
    const audio = metadataResponse && metadataResponse.audio ? metadataResponse.audio : null;
    const tags = metadataResponse && metadataResponse.tags ? metadataResponse.tags : {};
    return this.toBasicInfo(filePath, audio, tags);
  }

  /**
   * @returns {{filename: string|null, sampleRate: number|null, channels: number|null,
   *           durationSec: number|null, tags: object}}
   *          Numeric fields are `null` when the audio block is missing or
   *          malformed — callers render these as `—` placeholders.
   */
  toBasicInfo(filePath, audio, tags = {}) {
    const filename = basename(filePath);
    const sampleRate = audio && typeof audio.sampleRate === 'number' ? audio.sampleRate : null;
    const channels = audio && typeof audio.numChannels === 'number' ? audio.numChannels : null;
    const durationSec = audio && typeof audio.durationSec === 'number' ? audio.durationSec : null;

    return { filename, sampleRate, channels, durationSec, tags };
  }
}
