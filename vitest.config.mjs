import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // List every source file explicitly. Without this, files no test imports
      // are left out of the report and the totals look far higher than they are.
      include: ['main.js', 'preload.js', 'main/**/*.js', 'ipcHandlers/**/*.js', 'renderer/**/*.js'],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
