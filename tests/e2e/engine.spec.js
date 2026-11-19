/**
 * The audio engine (native core addon) failed to load (ATP F3, F61, ui#148):
 * the user is told on Upload, and Process stays locked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, APP_ROOT, launchApp, writeFixture, importViaPicker } from './helpers/app.js';

// Not copied: the addon builds (so no load strategy finds one), and what the app never loads.
const SKIPPED = new Set([
  'Build',
  'build',
  'node_modules',
  'tests',
  'coverage',
  'test-results',
  '.git',
]);

/** A copy of the app with no addon build; node_modules is linked, not copied. */
function copyAppWithoutAddon(workDir) {
  const root = path.join(workDir, 'app');
  fs.cpSync(APP_ROOT, root, {
    recursive: true,
    filter: (src) => path.dirname(src) !== APP_ROOT || !SKIPPED.has(path.basename(src)),
  });
  fs.symlinkSync(path.join(APP_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  return root;
}

test('no audio engine: Upload says so and Process stays disabled (F3, F61)', async ({
  workDir,
}) => {
  const { app, page } = await launchApp(workDir, copyAppWithoutAddon(workDir));
  try {
    await expect(page.locator('#engineError')).toBeVisible();
    await expect(page.locator('#engineError')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#engineError')).toContainText('audio engine could not be loaded');

    await importViaPicker(app, page, writeFixture(workDir, 'song.wav'));
    await expect(page.locator('#processBtn')).toBeDisabled();
  } finally {
    await app.close().catch(() => {});
  }
});
