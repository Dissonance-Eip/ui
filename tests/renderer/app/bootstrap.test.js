// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bootstrap } from '../../../renderer/app/bootstrap.js';
import { AppController } from '../../../renderer/controllers/AppController.js';
import { SystemThemeWatcher } from '../../../renderer/infrastructure/SystemThemeWatcher.js';

vi.mock('../../../renderer/controllers/AppController.js', () => ({
  AppController: vi.fn(function AppController() {
    this.start = vi.fn();
  }),
}));

vi.mock('../../../renderer/infrastructure/SystemThemeWatcher.js', () => ({
  SystemThemeWatcher: vi.fn(function SystemThemeWatcher() {
    this.start = vi.fn();
  }),
}));

const ELEMENT_IDS = [
  'view-upload',
  'view-analyze',
  'view-processing',
  'view-compare',
  'dropZone',
  'analyzeSelectedFile',
  'analyzeChangeFileBtn',
  'analyzeMetaDuration',
  'analyzeMetaSampleRate',
  'analyzeMetaChannels',
  'analyzeWaveform',
  'metaTagTitle',
  'metaTagArtist',
  'metaTagDate',
  'metaTagGenre',
  'metaTagComment',
  'metaTagCopyright',
  'metaTagSoftware',
  'protectionStrength',
  'protectionStrengthValue',
  'processingModesLabel',
  'processBtn',
  'compareOrigFilename',
  'compareOrigDuration',
  'compareOrigSampleRate',
  'compareOrigChannels',
  'compareOrigWaveform',
  'compareProcFilename',
  'compareProcDuration',
  'compareProcSampleRate',
  'compareProcChannels',
  'compareProcWaveform',
  'compareExportBtn',
  'appHeader',
  'restartBtn',
];

const byId = (id) => document.getElementById(id);

describe('bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = [
      ...ELEMENT_IDS.map((id) => `<div id="${id}"></div>`),
      '<input type="checkbox" data-processing-mode value="white_noise">',
      '<input type="checkbox" data-processing-mode value="pink_noise">',
    ].join('');
    AppController.mockClear();
    SystemThemeWatcher.mockClear();
  });

  afterEach(() => {
    delete window.dissonance;
    delete window.__app;
    delete window.__logger;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('stops and reports when the preload bridge is missing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    bootstrap();

    expect(log).toHaveBeenCalledWith('Renderer DOMContentLoaded');
    expect(error).toHaveBeenCalledWith('dissonance API NOT available — preload may have failed');
    expect(AppController).not.toHaveBeenCalled();
    expect(SystemThemeWatcher).not.toHaveBeenCalled();
  });

  it('wires every view to its page elements and starts the controller', () => {
    window.dissonance = { logToMain: vi.fn() };

    bootstrap();

    expect(window.dissonance.logToMain).toHaveBeenCalledWith('log', 'Renderer DOMContentLoaded');
    expect(window.dissonance.logToMain).toHaveBeenCalledWith(
      'log',
      'dissonance API available from preload'
    );

    const themeWatcher = SystemThemeWatcher.mock.instances[0];
    expect(SystemThemeWatcher.mock.calls[0][0].api.bridge).toBe(window.dissonance);
    expect(themeWatcher.start).toHaveBeenCalledOnce();

    const deps = AppController.mock.calls[0][0];
    expect(deps.router.views).toEqual({
      upload: byId('view-upload'),
      analyze: byId('view-analyze'),
      processing: byId('view-processing'),
      compare: byId('view-compare'),
    });
    expect(deps.uploadView.dropZone.el).toBe(byId('dropZone'));
    expect(deps.analyzeView.processBtn).toBe(byId('processBtn'));
    expect(deps.analyzeView.protectionStrengthEl).toBe(byId('protectionStrength'));
    expect(deps.analyzeView.processingModeEls.map((el) => el.value)).toEqual([
      'white_noise',
      'pink_noise',
    ]);
    expect(deps.analyzeView._tagEls.software).toBe(byId('metaTagSoftware'));
    expect(deps.compareView.exportBtn).toBe(byId('compareExportBtn'));
    expect(deps.compareView.procChannelsEl).toBe(byId('compareProcChannels'));
    expect(deps.headerEl).toBe(byId('appHeader'));
    expect(deps.restartBtn).toBe(byId('restartBtn'));
    expect(deps.state.currentFilePath).toBeNull();
    expect(typeof deps.wavMetadataService.toBasicInfo).toBe('function');

    const controller = AppController.mock.instances[0];
    expect(controller.start).toHaveBeenCalledOnce();
    expect(window.__app).toBe(controller);
    expect(window.__logger).toBe(deps.logger);
  });
});
