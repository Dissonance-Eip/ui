/**
 * Field-level tag changes, so a window only writes what it actually edited.
 *
 * Each renderer sends its whole tag form. Comparing it with the tags that
 * window last read or wrote tells which fields the user changed; only those
 * are applied on top of the file's current tags. Two windows editing
 * different fields of one file then both keep their edit.
 */
const asText = (value) => (value == null ? '' : String(value));
const isFilled = (value) => asText(value).trim() !== '';

/**
 * Without a baseline the window never showed the file's tags, so an empty
 * field means "not loaded", never "cleared" — only filled fields count.
 *
 * @param {object|null|undefined} baseTags  what this window last read/wrote (null = never read)
 * @param {object} nextTags                 this window's current form
 * @returns {Readonly<object>} only the fields that differ, with their new values
 */
function diffTags(baseTags, nextTags) {
  const entries = Object.entries(nextTags || {});
  const changed = baseTags
    ? entries.filter(([name, value]) => asText(value) !== asText(baseTags[name]))
    : entries.filter(([, value]) => isFilled(value));
  return Object.freeze(Object.fromEntries(changed));
}

function hasTagChanges(changes) {
  return Object.keys(changes).length > 0;
}

module.exports = { diffTags, hasTagChanges };
