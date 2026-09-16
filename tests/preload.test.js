import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadModule } from './helpers/loadModule.js';

describe('preload', () => {
  let api;
  let ipcRenderer;
  let webUtils;
  let contextBridge;
  let listeners;

  beforeEach(() => {
    listeners = {};
    ipcRenderer = {
      invoke: vi.fn(async () => 'response'),
      send: vi.fn(),
      on: vi.fn((channel, handler) => {
        listeners[channel] = handler;
      }),
      removeListener: vi.fn((channel, handler) => {
        if (listeners[channel] === handler) delete listeners[channel];
      }),
    };
    webUtils = { getPathForFile: vi.fn(() => '/music/song.wav') };
    contextBridge = {
      exposeInMainWorld: vi.fn((_name, value) => {
        api = value;
      }),
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});

    loadModule('preload.js', { electron: { contextBridge, ipcRenderer, webUtils } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the bridge to the page as window.dissonance', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('dissonance', api);
  });

  it.each([
    ['openFile', [], ['dialog:openFile']],
    ['getSystemTheme', [], ['ui:getSystemTheme']],
    ['readFileMetadata', ['/a.wav'], ['core:readMetadata', '/a.wav']],
    [
      'processFile',
      ['/a.wav', { perturbation: 0.5 }],
      ['core:process', { filePath: '/a.wav', options: { perturbation: 0.5 } }],
    ],
    [
      'writeTags',
      ['/a.wav', { title: 'A' }],
      ['core:writeTags', { filePath: '/a.wav', tags: { title: 'A' } }],
    ],
    ['exportFile', ['/tmp/out.wav'], ['core:export', '/tmp/out.wav']],
    ['cleanupProcessedFile', ['/tmp/out.wav'], ['core:cleanupProcessed', '/tmp/out.wav']],
  ])('%s() invokes its IPC channel', async (method, args, invokeArgs) => {
    expect(await api[method](...args)).toBe('response');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(...invokeArgs);
  });

  it('sends log lines and flush confirmations to the main process', () => {
    api.logToMain('error', 'boom');
    api.notifyFlushDone();

    expect(ipcRenderer.send).toHaveBeenCalledWith('ui:log', { level: 'error', message: 'boom' });
    expect(ipcRenderer.send).toHaveBeenCalledWith('app:flushDone');
  });

  it('resolves the path of a dropped file, or null when it cannot', () => {
    const file = { name: 'song.wav' };

    expect(api.getPathForFile(file)).toBe('/music/song.wav');
    expect(webUtils.getPathForFile).toHaveBeenCalledWith(file);

    webUtils.getPathForFile.mockImplementation(() => {
      throw new Error('not a File');
    });
    expect(api.getPathForFile({})).toBeNull();
  });

  it.each([
    ['onCoreStatus', 'core:status'],
    ['onSystemTheme', 'ui:systemTheme'],
  ])('%s() passes event data to the callback until unsubscribed', (method, channel) => {
    const callback = vi.fn();
    const unsubscribe = api[method](callback);

    listeners[channel]({ sender: {} }, { status: 'ok' });
    expect(callback).toHaveBeenCalledWith({ status: 'ok' });

    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, expect.any(Function));
    expect(listeners[channel]).toBeUndefined();
  });

  it('calls the flush-request callback without arguments until unsubscribed', () => {
    const callback = vi.fn();
    const unsubscribe = api.onAppFlushRequest(callback);

    listeners['app:flushRequest']({ sender: {} });
    expect(callback).toHaveBeenCalledWith();

    unsubscribe();
    expect(listeners['app:flushRequest']).toBeUndefined();
  });
});
