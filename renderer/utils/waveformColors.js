/**
 * Waveform palette per theme mode. WaveformPreview passes these to the
 * WaveformPlayer on creation and re-applies them in place when the OS
 * theme changes, so the colours live in one place.
 */
export const DARK_MODE = 'dark';
export const LIGHT_MODE = 'light';

const WAVEFORM_COLORS = Object.freeze({
  [DARK_MODE]: Object.freeze({
    waveformColor: 'rgba(226, 232, 240, 0.30)',
    progressColor: 'rgba(226, 232, 240, 0.95)',
    buttonColor: 'rgba(226, 232, 240, 0.95)',
  }),
  [LIGHT_MODE]: Object.freeze({
    waveformColor: 'rgba(15, 23, 42, 0.25)',
    progressColor: 'rgba(15, 23, 42, 0.9)',
    buttonColor: 'rgba(15, 23, 42, 0.9)',
  }),
});

/**
 * @param {string | null | undefined} mode 'dark' or 'light'; anything else is light.
 * @returns {{ waveformColor: string, progressColor: string, buttonColor: string }}
 */
export function getWaveformColors(mode) {
  const palette = WAVEFORM_COLORS[mode === DARK_MODE ? DARK_MODE : LIGHT_MODE];
  return { ...palette };
}
