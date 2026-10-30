/**
 * Writes a WAV info panel (filename, duration, sample rate, channels) into
 * its elements. Shared by AnalyzeView and both CompareView panels. Any
 * element may be missing; a missing value renders as the "—" placeholder.
 */
import { formatDuration, formatSampleRate, formatChannels } from '../utils/wavInfoFormatters.js';

const PLACEHOLDER = '—';

/**
 * @param {{filenameEl?: Element, durationEl?: Element, sampleRateEl?: Element,
 *          channelsEl?: Element}} els
 * @param {{filename?: string, durationSec?: number, sampleRate?: number,
 *          channels?: number}|null} info
 */
export function renderWavInfo(els, info) {
  const { filenameEl, durationEl, sampleRateEl, channelsEl } = els;
  const { filename, durationSec, sampleRate, channels } = info || {};
  if (filenameEl) filenameEl.textContent = filename || PLACEHOLDER;
  if (durationEl) durationEl.textContent = formatDuration(durationSec);
  if (sampleRateEl) sampleRateEl.textContent = formatSampleRate(sampleRate);
  if (channelsEl) channelsEl.textContent = formatChannels(channels);
}
