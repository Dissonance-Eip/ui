class Logger {
  constructor(logElId = 'log', statusElId = 'status') {
    this.logEl = document.getElementById(logElId);
    this.statusEl = document.getElementById(statusElId);
  }

  timePrefix() {
    return new Date().toLocaleTimeString();
  }

  log(message) {
    const line = `[${this.timePrefix()}] ${message}`;

    if (this.logEl) {
      const el = document.createElement('div');
      el.className = 'log-entry';
      el.textContent = line;
      this.logEl.appendChild(el);
      this.logEl.parentElement.scrollTop = this.logEl.parentElement.scrollHeight;
    }

    console.log(message);
  }

  error(message) {
    this.log(`ERROR: ${message}`);
    this.setStatus(message, true);
  }

  setStatus(message, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message || '';
    this.statusEl.style.color = isError ? '#fecaca' : '#e5e7eb';
  }
}

// Bootstrap
console.log('Renderer loaded');

window.addEventListener('DOMContentLoaded', () => {
  const logger = new Logger('log', 'status');
  logger.log('Renderer DOMContentLoaded');

  if (!window.dissonance) {
    logger.error('dissonance API NOT available — preload may have failed');
    return;
  }

  logger.log('dissonance API available from preload');

  let currentFilePath = null;
  let processedFilePath = null;

  const processBtn = document.getElementById('processBtn');
  const exportBtn = document.getElementById('exportBtn');
  const dropZone = document.getElementById('dropZone');

  function updateProcessButton() {
    if (!processBtn) return;
    const enabled = !!currentFilePath;
    processBtn.disabled = !enabled;
    if (enabled) {
      processBtn.classList.add('enabled');
    } else {
      processBtn.classList.remove('enabled');
    }
  }

  function updateExportButton() {
    if (!exportBtn) return;
    const enabled = !!processedFilePath;
    exportBtn.disabled = !enabled;
    if (enabled) {
      exportBtn.classList.add('enabled');
    } else {
      exportBtn.classList.remove('enabled');
    }
  }

  async function handleFileImported(filePath, sourceLabel) {
    currentFilePath = filePath;
    processedFilePath = null; // reset previous result
    logger.log(`${sourceLabel} file: ${filePath}`);
    logger.setStatus('File imported');
    updateProcessButton();
    updateExportButton();
  }

  if (dropZone) {
    // Click on the drop zone (including the "choose file" text) opens the file dialog
    dropZone.addEventListener('click', async () => {
      try {
        logger.setStatus('Opening file dialog...');
        const filePath = await window.dissonance.openFile();
        if (!filePath) {
          logger.log('No file selected');
          logger.setStatus('Import canceled');
          return;
        }
        await handleFileImported(filePath, 'Selected');
      } catch (err) {
        logger.error(`Import failed: ${err}`);
      }
    });

    // Drag & drop behaviour
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', async (e) => {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || dt.files.length === 0) {
        logger.log('Drop: no files');
        return;
      }
      const file = dt.files[0];
      const filePath = file.path || null;
      if (!filePath) {
        logger.log('Drop: file has no path');
        return;
      }
      await handleFileImported(filePath, 'Dropped');
    });
  }

  if (processBtn) {
    processBtn.addEventListener('click', async () => {
      if (!currentFilePath) {
        logger.setStatus('No file to process', true);
        return;
      }
      try {
        logger.setStatus('Processing...');
        logger.log('Sending processing request to dissonance-core (simulated)');
        const resp = await window.dissonance.processFile(currentFilePath);
        if (resp && resp.ok && resp.processedPath) {
          processedFilePath = resp.processedPath;
          logger.setStatus('Processed');
          logger.log(`Processing complete: ${processedFilePath}`);
          updateExportButton();
        } else {
          const errMsg = resp && resp.error ? resp.error : 'Unknown error';
          logger.setStatus(`Processing failed: ${errMsg}`, true);
          logger.log(`Processing failed: ${errMsg}`);
        }
      } catch (err) {
        logger.error(`Processing failed: ${err}`);
      }
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      if (!processedFilePath) {
        logger.setStatus('No processed file to export', true);
        return;
      }
      try {
        logger.setStatus('Exporting...');
        logger.log('Triggering export dialog');
        const resp = await window.dissonance.exportFile(processedFilePath);
        if (resp && resp.ok && resp.exportedPath) {
          logger.setStatus('Exported');
          logger.log(`Exported to: ${resp.exportedPath}`);
        } else {
          const errMsg = resp && resp.error ? resp.error : 'Unknown error';
          logger.setStatus(`Export failed: ${errMsg}`, true);
          logger.log(`Export failed: ${errMsg}`);
        }
      } catch (err) {
        logger.error(`Export failed: ${err}`);
      }
    });
  }

  // Global dragover/drop to allow dropping anywhere in the window without opening in the browser
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
  });

  // Listen for core status events from main via preload bridge
  window.dissonance.onCoreStatus((data) => {
    const msg = data && data.message ? data.message : JSON.stringify(data);
    logger.log(`core:status — ${msg}`);
  });

  updateProcessButton();
  updateExportButton();
  logger.setStatus('Ready');

  // Expose for debugging in DevTools
  window.__logger = logger;
});
