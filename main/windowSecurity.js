/**
 * Security settings shared by every application BrowserWindow.
 *
 * MainWindowManager applies both halves to each window it creates (the first
 * one, a second launch's window, a re-opened one on macOS):
 *   - secureWebPreferences(): an isolated, sandboxed renderer with web
 *     security on and no Node.
 *   - hardenNavigation(): the window can only show the app's own page.
 *     Navigating away is cancelled and window.open() never opens an app
 *     window; http(s) links go to the system browser instead.
 *
 * Loading audio from `file:` URLs (waveform, player) is a resource load, not
 * a navigation, so it is unaffected; the CSP in index.html governs it.
 */
const { URL } = require('url');
const { logger } = require('./logger');

/** Renderer argv flag meaning "development build": preload reads it. */
const DEV_MODE_ARG = '--dissonance-dev';

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * @param {{ preloadPath: string, isDevelopment: boolean }} opts
 * @returns {object} BrowserWindow `webPreferences`
 */
function secureWebPreferences({ preloadPath, isDevelopment }) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    additionalArguments: isDevelopment ? [DEV_MODE_ARG] : [],
  };
}

/** @returns {URL|null} the parsed URL, or null when it does not parse */
function parseUrl(url) {
  try {
    return new URL(url);
  } catch (e) {
    logger.warn('Ignoring a URL that does not parse', e);
    return null;
  }
}

/** True when `url` is the app's own page (ignoring query and hash). */
function isAppUrl(url, appUrl) {
  const target = parseUrl(url);
  const app = parseUrl(appUrl);
  if (!target || !app) return false;
  return target.protocol === app.protocol && target.pathname === app.pathname;
}

/** True when `url` is a web link that belongs in the system browser. */
function isExternalWebUrl(url) {
  const target = parseUrl(url);
  return Boolean(target && EXTERNAL_PROTOCOLS.has(target.protocol));
}

/**
 * Keeps `win` on the app's page.
 *
 * @param {object} win BrowserWindow
 * @param {{ appUrl: string, openExternal: (url: string) => unknown }} opts
 */
function hardenNavigation(win, { appUrl, openExternal }) {
  const sendToSystemBrowser = (url) => {
    if (!isExternalWebUrl(url)) return;
    Promise.resolve(openExternal(url)).catch((e) => {
      logger.error('Failed to open link in the system browser:', e);
    });
  };

  win.webContents.on('will-navigate', (event) => {
    if (isAppUrl(event.url, appUrl)) return;
    event.preventDefault();
    sendToSystemBrowser(event.url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    sendToSystemBrowser(url);
    return { action: 'deny' };
  });
}

module.exports = {
  DEV_MODE_ARG,
  secureWebPreferences,
  hardenNavigation,
  isAppUrl,
  isExternalWebUrl,
};
