import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadModule } from '../helpers/loadModule.js';

function fakeElectron() {
  const windows = [];
  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.show = vi.fn();
      windows.push(this);
    }

    once(event, handler) {
      this.handlers[event] = handler;
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }
  }
  return { electron: { BrowserWindow }, windows };
}

describe('MainWindowManager', () => {
  let MainWindowManager;
  let windows;
  let tmpDir;

  beforeEach(() => {
    const fake = fakeElectron();
    windows = fake.windows;
    ({ MainWindowManager } = loadModule('main/MainWindowManager.js', { electron: fake.electron }));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-window-manager-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a secure window with the preload script and default size', () => {
    const manager = new MainWindowManager({
      preloadPath: '/app/preload.js',
      iconPath: path.join(tmpDir, 'missing.png'),
    });

    const win = manager.createWindow();

    expect(win).toBe(windows[0]);
    expect(win.options).toEqual({
      width: 800,
      height: 700,
      webPreferences: {
        preload: '/app/preload.js',
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
  });

  it('uses the icon and requested size when the icon file exists', () => {
    const iconPath = path.join(tmpDir, 'icon.png');
    fs.writeFileSync(iconPath, '');

    const win = new MainWindowManager({ preloadPath: 'preload.js', iconPath }).createWindow({
      width: 1024,
      height: 768,
    });

    expect(win.options.icon).toBe(iconPath);
    expect(win.options.width).toBe(1024);
    expect(win.options.height).toBe(768);
  });

  it('omits the icon when no icon path is configured', () => {
    const win = new MainWindowManager({ preloadPath: 'preload.js' }).createWindow();

    expect(win.options).not.toHaveProperty('icon');
  });

  it('returns the existing window instead of creating a second one', () => {
    const manager = new MainWindowManager({ preloadPath: 'preload.js' });

    const first = manager.createWindow();
    const second = manager.createWindow();

    expect(second).toBe(first);
    expect(windows).toHaveLength(1);
    expect(manager.getWindow()).toBe(first);
  });

  it('shows the window once it is ready, ignoring errors from show()', () => {
    const win = new MainWindowManager({ preloadPath: 'preload.js' }).createWindow();

    win.handlers['ready-to-show']();
    expect(win.show).toHaveBeenCalledOnce();

    win.show.mockImplementation(() => {
      throw new Error('window already destroyed');
    });
    expect(() => win.handlers['ready-to-show']()).not.toThrow();
  });

  it('forgets the window once it is closed, so the next call creates a new one', () => {
    const manager = new MainWindowManager({ preloadPath: 'preload.js' });
    const first = manager.createWindow();

    first.handlers.closed();

    expect(manager.getWindow()).toBeNull();
    expect(manager.createWindow()).not.toBe(first);
    expect(windows).toHaveLength(2);
  });
});
