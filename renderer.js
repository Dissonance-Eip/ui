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

  // Listen for core status events from main via preload bridge
  window.dissonance.onCoreStatus((data) => {
    const msg = data && data.message ? data.message : JSON.stringify(data);
    logger.log(`core:status — ${msg}`);
  });

  logger.setStatus('Ready');

  // Expose for debugging in DevTools
  window.__logger = logger;
});
