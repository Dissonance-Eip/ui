import { describe, it, expect } from 'vitest';
import { MainWindowManager } from '../main/MainWindowManager.js';
import { FakeBrowserWindow } from './helpers/fakeElectron.js';

function makeManager() {
  return new MainWindowManager({
    preloadPath: '/preload.js',
    iconPath: null,
    BrowserWindowClass: FakeBrowserWindow,
  });
}

describe('MainWindowManager', () => {
  it('creates a new window on every request', () => {
    const manager = makeManager();

    const first = manager.createWindow();
    const second = manager.createWindow();

    expect(second).not.toBe(first);
    expect(manager.getWindows()).toEqual([first, second]);
  });

  it('keeps renderer isolation on for every window', () => {
    const win = makeManager().createWindow();

    expect(win.options.webPreferences).toEqual({
      preload: '/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
    });
  });

  it('forgets a window once it is closed and keeps the others', () => {
    const manager = makeManager();
    const first = manager.createWindow();
    const second = manager.createWindow();

    first.close();

    expect(manager.getWindows()).toEqual([second]);
  });

  it('returns a copy so callers cannot change the tracked list', () => {
    const manager = makeManager();
    manager.createWindow();

    manager.getWindows().pop();

    expect(manager.getWindows()).toHaveLength(1);
  });
});
