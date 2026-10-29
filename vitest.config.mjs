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
    coverage: {
      // Listing the source globs in `include` makes untested files count as 0%.
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['main.js', 'preload.js', 'main/**/*.js', 'ipcHandlers/**/*.js', 'renderer/**/*.js'],
      exclude: ['tests/**', 'node_modules/**', 'coverage/**', 'dist/**', 'Build/**'],
    },
  },
});
