/**
 * Routes every launch of the app into one main process.
 *
 * This is NOT "one window only": a second launch opens another window in the
 * running instance. Keeping all windows in one process is what lets the main
 * process coordinate them (serialised tag writes, pausing a player before its
 * file is rewritten). Two separate processes share nothing but the disk.
 *
 * @param {object} opts
 * @param {object} opts.app            Electron `app` (or a test double)
 * @param {() => void} opts.openWindow called for every later launch
 * @returns {boolean} false when another instance owns the app; this one quits.
 */
function routeLaunchesToFirstInstance({ app, openWindow }) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => openWindow());
  return true;
}

module.exports = { routeLaunchesToFirstInstance };
