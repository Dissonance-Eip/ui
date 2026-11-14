/**
 * Display formatters for WAV info shown in the UI.
 * Kept pure — no DOM, no globals.
 */

export function formatDuration(durationSec) {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0)
    return '—';
  const total = Math.round(durationSec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatSampleRate(sampleRate) {
  return sampleRate ? `${sampleRate} Hz` : '—';
}

export function formatChannels(channels) {
  return channels ? String(channels) : '—';
}
