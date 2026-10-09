/**
 * Renderer composition root.
 *
 * Wires up the entire app on DOMContentLoaded:
 *   - api (DissonanceApi over the preload bridge)
 *   - logger (TerminalLogger → main process console)
 *   - SystemThemeWatcher (Tailwind dark-mode toggle)
 *   - ViewRouter (upload / analyze / compare)
 *   - AppState (current + processed file paths)
 *   - WavMetadataService (response → display-friendly shape)
 *   - UploadView, AnalyzeView, CompareView (constructed with their DOM nodes)
 *   - AppController.start() — registers all event handlers + flush flow
 *
 * Exposes the controller + logger on window for DevTools poking.
 */
import { TerminalLogger } from '../infrastructure/TerminalLogger.js';
import { DissonanceApi } from '../infrastructure/DissonanceApi.js';
import { ViewRouter } from '../infrastructure/ViewRouter.js';
import { SystemThemeWatcher } from '../infrastructure/SystemThemeWatcher.js';
import { AppState } from '../state/AppState.js';
import { UploadView } from '../views/UploadView.js';
import { AnalyzeView } from '../views/AnalyzeView.js';
import { CompareView } from '../views/CompareView.js';
import { AppController } from '../controllers/AppController.js';
import { WavMetadataService } from '../services/WavMetadataService.js';

export function bootstrap() {
  const api = new DissonanceApi(window.dissonance);
  const logger = new TerminalLogger(window.dissonance);
  logger.log('Renderer DOMContentLoaded');

  if (!api.isAvailable()) {
    logger.error('dissonance API NOT available — preload may have failed');
    return;
  }

  logger.log('dissonance API available from preload');

  // Watch OS-level light/dark mode and apply Tailwind `dark` class.
  new SystemThemeWatcher({ api }).start();

  const router = new ViewRouter({
    upload: document.getElementById('view-upload'),
    analyze: document.getElementById('view-analyze'),
    processing: document.getElementById('view-processing'),
    compare: document.getElementById('view-compare'),
  });

  const state = new AppState();
  const wavMetadataService = new WavMetadataService();

  const uploadView = new UploadView({
    dropZoneEl: document.getElementById('dropZone'),
    api,
    logger,
    getLastFilePath: () => state.lastImportedFilePath,
  });

  const analyzeView = new AnalyzeView({
    selectedFileEl: document.getElementById('analyzeSelectedFile'),
    changeFileBtn: document.getElementById('analyzeChangeFileBtn'),
    metaDurationEl: document.getElementById('analyzeMetaDuration'),
    metaSampleRateEl: document.getElementById('analyzeMetaSampleRate'),
    metaChannelsEl: document.getElementById('analyzeMetaChannels'),
    waveformEl: document.getElementById('analyzeWaveform'),
    tagTitleEl: document.getElementById('metaTagTitle'),
    tagArtistEl: document.getElementById('metaTagArtist'),
    tagDateEl: document.getElementById('metaTagDate'),
    tagGenreEl: document.getElementById('metaTagGenre'),
    tagCommentEl: document.getElementById('metaTagComment'),
    tagCopyrightEl: document.getElementById('metaTagCopyright'),
    tagSoftwareEl: document.getElementById('metaTagSoftware'),
    protectionStrengthEl: document.getElementById('protectionStrength'),
    protectionStrengthValueEl: document.getElementById('protectionStrengthValue'),
    processingModeEls: document.querySelectorAll('[data-processing-mode]'),
    processingModeLabelEl: document.getElementById('processingModesLabel'),
    processBtn: document.getElementById('processBtn'),
  });

  const compareView = new CompareView({
    origFilenameEl: document.getElementById('compareOrigFilename'),
    origDurationEl: document.getElementById('compareOrigDuration'),
    origSampleRateEl: document.getElementById('compareOrigSampleRate'),
    origChannelsEl: document.getElementById('compareOrigChannels'),
    origWaveformEl: document.getElementById('compareOrigWaveform'),
    procFilenameEl: document.getElementById('compareProcFilename'),
    procDurationEl: document.getElementById('compareProcDuration'),
    procSampleRateEl: document.getElementById('compareProcSampleRate'),
    procChannelsEl: document.getElementById('compareProcChannels'),
    procWaveformEl: document.getElementById('compareProcWaveform'),
    exportBtn: document.getElementById('compareExportBtn'),
  });

  const controller = new AppController({
    api,
    logger,
    router,
    state,
    uploadView,
    analyzeView,
    compareView,
    headerEl: document.getElementById('appHeader'),
    restartBtn: document.getElementById('restartBtn'),
    wavMetadataService,
  });

  controller.start();

  // Expose for debugging in DevTools
  window.__logger = logger;
  window.__app = controller;
}
