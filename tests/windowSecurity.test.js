import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEV_MODE_ARG,
  secureWebPreferences,
  hardenNavigation,
  isAppUrl,
  isExternalWebUrl,
} from '../main/windowSecurity.js';
import { FakeBrowserWindow } from './helpers/fakeElectron.js';

const APP_URL = 'file:///app/index.html';

afterEach(() => {
  vi.restoreAllMocks();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('secureWebPreferences', () => {
  it('passes the preload path and adds the dev flag only in development', () => {
    expect(secureWebPreferences({ preloadPath: '/p.js', isDevelopment: true })).toMatchObject({
      preload: '/p.js',
      additionalArguments: [DEV_MODE_ARG],
    });
    expect(
      secureWebPreferences({ preloadPath: '/p.js', isDevelopment: false }).additionalArguments
    ).toEqual([]);
  });
});

describe('isAppUrl', () => {
  it('accepts the app page with any query or hash', () => {
    expect(isAppUrl(APP_URL, APP_URL)).toBe(true);
    expect(isAppUrl(`${APP_URL}?view=compare#top`, APP_URL)).toBe(true);
  });

  it.each([
    ['another local file', 'file:///app/other.html'],
    ['the same path over another protocol', 'http://localhost/app/index.html'],
    ['a URL that does not parse', 'not a url'],
  ])('refuses %s', (_label, url) => {
    expect(isAppUrl(url, APP_URL)).toBe(false);
  });

  it('refuses everything when the app URL itself does not parse', () => {
    expect(isAppUrl(APP_URL, 'not a url')).toBe(false);
  });
});

describe('isExternalWebUrl', () => {
  it.each([
    ['https://example.com/', true],
    ['http://example.com/', true],
    ['file:///etc/hosts', false],
    ['mailto:someone@example.com', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isExternalWebUrl(url)).toBe(expected);
  });
});

describe('hardenNavigation', () => {
  it('logs a system browser that fails to open a link instead of rejecting', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const openExternal = vi.fn(() => Promise.reject(new Error('no browser')));
    const win = new FakeBrowserWindow();
    hardenNavigation(win, { appUrl: APP_URL, openExternal });

    const result = win.webContents.windowOpenHandler({ url: 'https://example.com/' });
    await tick();

    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://example.com/');
    expect(error).toHaveBeenCalledWith(
      'Failed to open link in the system browser:',
      expect.any(Error)
    );
  });

  it('accepts an openExternal that returns nothing', () => {
    const openExternal = vi.fn(() => undefined);
    const win = new FakeBrowserWindow();
    hardenNavigation(win, { appUrl: APP_URL, openExternal });
    const event = { url: 'https://example.com/', preventDefault: vi.fn() };

    win.webContents.emit('will-navigate', event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/');
  });
});
