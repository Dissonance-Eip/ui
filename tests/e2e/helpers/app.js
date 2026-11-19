/**
 * Playwright fixtures for the E2E suite: every test gets its own work dir,
 * and an Electron app launched from the repository with
 *   - its own userData dir, so the single-instance lock (main/singleInstance.js)
 *     never routes the launch into another running Dissonance,
 *   - its own TMPDIR, so the processed temp files (os.tmpdir()/dissonance)
 *     of one test are never seen by another.
 * Native dialogs can't be clicked, so tests stub them in the main process.
 */
import { test as base, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildWav } from './wav.js';

export const APP_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Launches the app from `appRoot` with an isolated userData dir and temp dir
 * under `workDir`.
 */
export async function launchApp(workDir, appRoot = APP_ROOT) {
  const userData = path.join(workDir, 'userData');
  const tmp = path.join(workDir, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const app = await electron.launch({
    args: [appRoot, `--user-data-dir=${userData}`],
    cwd: appRoot,
    env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
  });
  const page = await app.firstWindow();
  await expect(page.locator('#view-upload')).toBeVisible();
  return { app, page, tempRoot: path.join(tmp, 'dissonance') };
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring
  workDir: async ({}, use) => {
    // realpath: macOS hands out /var/... for what the app sees as /private/var/...
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dissonance-e2e-')));
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  launched: async ({ workDir }, use) => {
    const launched = await launchApp(workDir);
    await use(launched);
    // A test may already have quit the app.
    await launched.app.close().catch(() => {});
  },
  app: async ({ launched }, use) => use(launched.app),
  page: async ({ launched }, use) => use(launched.page),
});

export { expect };

/**
 * The open dialog returns `filePath`, or is cancelled when null. Each call
 * is counted in the main process (see openDialogCalls).
 */
export function stubOpenDialog(app, filePath) {
  return app.evaluate(({ dialog }, picked) => {
    globalThis.e2eOpenDialogCalls = 0;
    dialog.showOpenDialog = async () => {
      globalThis.e2eOpenDialogCalls++;
      return picked ? { canceled: false, filePaths: [picked] } : { canceled: true, filePaths: [] };
    };
  }, filePath);
}

/** How many times the stubbed open dialog was shown. */
export const openDialogCalls = (app) => app.evaluate(() => globalThis.e2eOpenDialogCalls);

/** The next save dialog returns `filePath`, or is cancelled when null. */
export function stubSaveDialog(app, filePath) {
  return app.evaluate(({ dialog }, picked) => {
    dialog.showSaveDialog = async () =>
      picked ? { canceled: false, filePath: picked } : { canceled: true, filePath: undefined };
  }, filePath);
}

/** Writes `bytes` (a Buffer, or WAV options for buildWav) to `workDir/name`. */
export function writeFixture(workDir, name, bytes = {}) {
  const filePath = path.join(workDir, name);
  fs.writeFileSync(filePath, Buffer.isBuffer(bytes) ? bytes : buildWav(bytes));
  return filePath;
}

export const sha256 = (filePath) =>
  createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

/** The app's screens, as their <section> ids. */
export const screens = {
  upload: '#view-upload',
  analyze: '#view-analyze',
  processing: '#view-processing',
  compare: '#view-compare',
};

/** Clicks the drop zone with the open dialog stubbed to `filePath`; waits for Analyze. */
export async function importViaPicker(app, page, filePath) {
  await stubOpenDialog(app, filePath);
  await page.locator('#dropZone').click();
  await expect(page.locator(screens.analyze)).toBeVisible();
  await expect(page.locator('#analyzeSelectedFile')).toHaveText(path.basename(filePath));
}

/** Waits until the info row shows the file's real values, not the "—" placeholder. */
export async function waitForMetadata(page) {
  await expect(page.locator('#analyzeMetaSampleRate')).not.toHaveText('—');
}

/** Ticks the given processing modes, by their checkbox labels. */
export async function tickModes(page, labels) {
  const picker = page.locator('#view-analyze details');
  // The summary toggles the dropdown: only open it when it is closed.
  if (!(await picker.evaluate((el) => el.open)))
    await page.locator('#processingModesLabel').click();
  for (const label of labels) {
    await page.getByRole('checkbox', { name: label }).check();
  }
}

/** Process with the given modes and wait for Compare. */
export async function processWith(page, labels) {
  await tickModes(page, labels);
  await page.locator('#processBtn').click();
  await expect(page.locator(screens.compare)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#compareExportBtn')).toBeEnabled();
}

/**
 * Drops `filePath` on `selector` the way the renderer receives a real drop:
 * a disk-backed File (set through a file input, so webUtils.getPathForFile
 * resolves its path) inside a DataTransfer. Only the OS drag gesture itself
 * is simulated.
 */
export async function dropFile(page, selector, filePath) {
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'e2eDropSource';
    input.hidden = true;
    document.body.append(input);
  });
  await page.locator('#e2eDropSource').setInputFiles(filePath);
  await page.evaluate((target) => {
    const input = document.getElementById('e2eDropSource');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(input.files[0]);
    input.remove();
    const el = document.querySelector(target);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      el.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true }));
    }
  }, selector);
}
