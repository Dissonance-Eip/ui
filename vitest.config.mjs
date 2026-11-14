/**
 * Vitest configuration.
 *
 * Coverage counts every source file, including files that no test imports,
 * so the reported totals reflect the real state of the project instead of
 * only the files that happen to be loaded by a test.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    server: {
      deps: {
        // The main-process code is CommonJS. A test that imports a module
        // directly would get Vite's transformed copy, while that module's own
        // require() calls load the native copy. V8 coverage cannot merge two
        // copies of one file and drops lines, so load them natively, as
        // Electron does.
        external: [/\/(main|ipcHandlers)\/.*\.js$/],
      },
    },
    coverage: {
      // Listing the source globs in `include` makes untested files count as 0%.
      provider: 'v8',
      // lcov writes coverage/lcov.info for SonarQube Cloud (docs#78).
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['main.js', 'preload.js', 'main/**/*.js', 'ipcHandlers/**/*.js', 'renderer/**/*.js'],
      exclude: ['tests/**', 'node_modules/**', 'coverage/**', 'dist/**', 'Build/**'],
      // `npm run test:coverage` (and so CI) fails below the team target (#129).
      thresholds: { lines: 85 },
    },
  },
});
