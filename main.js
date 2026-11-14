/**
 * Electron main-process entry point.
 * Boots a MainApplication rooted at this directory; everything else hangs
 * off that — window creation, IPC handler registration, quit/flush lifecycle.
 */
const { logUnhandledErrors } = require('./main/logger');

// Once per process and first, so even a failing require below is logged;
// never per window (#85).
logUnhandledErrors();

const { MainApplication } = require('./main/MainApplication');

new MainApplication({ uiRoot: __dirname }).run();
