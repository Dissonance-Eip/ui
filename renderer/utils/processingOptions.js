/**
 * Builds the options object the renderer sends with a process request.
 *
 * Two entry points feed it:
 *   - explicitly selected modes: the safe default strength applies.
 *   - no modes selected: no processing request is made (returns null).
 *
 * When modes are selected, the validated default strength of 0.8 is used.
 * The protection strength slider has been removed; processing is mode-driven only.
 *
 * @param {string[]} modes - Non-empty array of selected processing modes
 * @returns {object|null} { modes, perturbation: 0.8 } or null if no modes
 */

export const DEFAULT_PERTURBATION = 0.8;

/** Returns true if processing can proceed (has file and at least one mode). */
export function canProcess(hasFile, modes) {
  return !!(hasFile && modes && modes.length > 0);
}

export function buildProcessingOptions(modes) {
  if (!modes || modes.length === 0) {
    return null;
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
