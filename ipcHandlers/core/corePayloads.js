/**
 * Type checks for the payloads the renderer sends on `core:*` channels.
 * Everything here comes from the renderer, so nothing is trusted: each check
 * returns `null` when the value is acceptable, or the error message the
 * handler replies with (same shape as exportPaths.js, which checks
 * core:export).
 *
 *   checkFilePath()       – a non-empty string
 *   checkProcessOptions() – absent, or a plain object whose known fields
 *                           (`modes`, `perturbation`) have the right types
 *   checkTags()           – absent, or a plain object of string values
 */
const INVALID_FILE_PATH = 'No file path provided';
const INVALID_PROCESSED_PATH = 'No processed file path';
const INVALID_OPTIONS = 'Invalid processing options';
const INVALID_TAGS = 'Invalid tags';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isStringArray = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string');

/** @param {unknown} filePath @returns {string|null} */
function checkFilePath(filePath) {
  return isNonEmptyString(filePath) ? null : INVALID_FILE_PATH;
}

/** @param {unknown} processedPath @returns {string|null} */
function checkProcessedPath(processedPath) {
  return isNonEmptyString(processedPath) ? null : INVALID_PROCESSED_PATH;
}

/** @param {unknown} options @returns {string|null} */
function checkProcessOptions(options) {
  if (options == null) return null;
  if (!isPlainObject(options)) return INVALID_OPTIONS;
  if ('modes' in options && !isStringArray(options.modes)) return INVALID_OPTIONS;
  if ('perturbation' in options && !Number.isFinite(options.perturbation)) return INVALID_OPTIONS;
  return null;
}

/** @param {unknown} tags @returns {string|null} */
function checkTags(tags) {
  if (tags == null) return null;
  if (!isPlainObject(tags)) return INVALID_TAGS;
  return Object.values(tags).every((v) => typeof v === 'string') ? null : INVALID_TAGS;
}

module.exports = {
  INVALID_FILE_PATH,
  INVALID_PROCESSED_PATH,
  INVALID_OPTIONS,
  INVALID_TAGS,
  checkFilePath,
  checkProcessedPath,
  checkProcessOptions,
  checkTags,
};
