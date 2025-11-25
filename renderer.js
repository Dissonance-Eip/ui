console.log('Renderer loaded');

if (window.dissonance) {
  console.log('dissonance API available from preload');

  window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready in renderer');

    // Listen for core status events from main via preload bridge
    window.dissonance.onCoreStatus((data) => {
      console.log('core:status event in renderer:', data);
    });

    // Example manual test from DevTools:
    //   await window.dissonance.openFile();
    //   await window.dissonance.processFile('/path/to/file');
    //   await window.dissonance.exportFile('/path/to/processed');
  });
} else {
  console.warn('dissonance API NOT available — preload may have failed');
}
