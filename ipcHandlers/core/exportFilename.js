/**
 * The name the export dialog suggests for a processed file: the input's
 * name tagged with the modes and intensity the core ran with, so outputs
 * from different modes can be told apart, e.g.
 *
 *   song.wav + { modes: ['white_noise', 'pink_noise'], perturbation: 0.8 }
 *     → song_white-noise+pink-noise_0.8.wav
 *
 * Mode strings come from the renderer and are only type-checked, so each
 * is reduced to [a-z0-9-] before it reaches a filename.
 */
const path = require('path');

const MAX_MODES_LENGTH = 64;
const NO_MODE_TAG = 'processed';

const slugOf = (mode) =>
  String(mode)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');

function modesTag(modes) {
  const slugs = [...new Set((Array.isArray(modes) ? modes : []).map(slugOf).filter(Boolean))];
  // Separators never repeat, so a cut leaves at most one dangling.
  return slugs.join('+').slice(0, MAX_MODES_LENGTH).replace(/[-+]$/, '') || NO_MODE_TAG;
}

/** Two decimals at most, so float noise like 0.30000000000000004 stays out. */
const intensityTag = (value) =>
  Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '';

/**
 * @param {string} inputPath  the file the core processed
 * @param {{modes?: string[], perturbation?: number}} [options]  the options it ran with
 * @returns {string}  a bare `.wav` file name
 */
function buildExportFilename(inputPath, options = {}) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const { modes, perturbation } = options || {};
  const parts = [base, modesTag(modes), intensityTag(perturbation)].filter(Boolean);
  return `${parts.join('_')}.wav`;
}

module.exports = { buildExportFilename };
