/**
 * DevTools handles (`window.__logger`, `window.__app`), development only.
 * A production build exposes nothing: the controller would otherwise let any
 * script in the page drive the app (process, write tags, export).
 *
 * @param {{ target: object, isDevelopment: boolean, logger: object, controller: object }} opts
 */
export function exposeDebugGlobals({ target, isDevelopment, logger, controller }) {
  if (!isDevelopment) return;
  target.__logger = logger;
  target.__app = controller;
}
