/**
 * Builds the options object the renderer sends with a process request.
 *
 *   - selected modes: the validated default strength (0.8) applies.
 *   - no mode selected: an explicit pass-through, strength 0. The audio is
 *     left untouched (F27); never an empty object, which older cores read as
 *     "use the default perturbation".
 *
 * The protection strength slider has been removed; processing is mode-driven only.
 *
 * @param {string[]} [modes] - Selected processing modes
 * @returns {{modes: string[], perturbation: number}}
 */

export const DEFAULT_PERTURBATION = 0.8;
export const PASS_THROUGH_PERTURBATION = 0;

/** Returns true if processing can proceed: a file is loaded (no mode = pass-through). */
export function canProcess(hasFile) {
  return !!hasFile;
}

export function buildProcessingOptions(modes) {
  if (!modes || modes.length === 0) {
    return { modes: [], perturbation: PASS_THROUGH_PERTURBATION };
  }
  return { modes, perturbation: DEFAULT_PERTURBATION };
}

const PLACEHOLDER = '—';

// Mode ids are snake_case versions of their picker labels (white_noise → White Noise).
const labelOf = (mode) =>
  mode
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** "White Noise, Pink Noise" for ['white_noise', 'pink_noise']. */
export function formatModes(modes) {
  return modes && modes.length > 0 ? modes.map(labelOf).join(', ') : PLACEHOLDER;
}

/** The perturbation strength, at most two decimals. */
export function formatIntensity(value) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : PLACEHOLDER;
}
