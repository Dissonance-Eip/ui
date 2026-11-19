/**
 * Process → Compare → Export, Restart, and what is left on disk (ATP F25,
 * F28, F29, F33, F36–F43).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  test,
  expect,
  screens,
  writeFixture,
  importViaPicker,
  waitForMetadata,
  tickModes,
  processWith,
  stubSaveDialog,
  sha256,
} from './helpers/app.js';
import { parseWav } from './helpers/wav.js';

const readWav = (filePath) => parseWav(fs.readFileSync(filePath));
const listDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

test('process with two modes, compare, then export a valid tagged WAV (F25, F28, F33, F37, F38, F40, F42)', async ({
  launched,
  workDir,
}) => {
  const { app, page, tempRoot } = launched;
  const file = writeFixture(workDir, 'song.wav', { seconds: 3, tags: { title: 'Before' } });
  const original = readWav(file);
  await importViaPicker(app, page, file);
  await waitForMetadata(page);
  await page.locator('[data-tag="title"]').fill('Protected title');
  await page.locator('[data-tag="artist"]').fill('Protected artist');

  await tickModes(page, ['White Noise', 'Phase Distortion']);
  await expect(page.locator('#processingModesLabel')).toHaveText('2 selected');
  await processWith(page, []);

  await expect(page.locator('#appHeader')).toBeHidden();
  await expect(page.locator('#compareOrigFilename')).toHaveText('song.wav');
  await expect(page.locator('#compareProcModes')).toHaveText('White Noise, Phase Distortion');
  for (const field of ['Duration', 'SampleRate', 'Channels']) {
    await expect(page.locator(`#compareProc${field}`)).toHaveText(
      (await page.locator(`#compareOrig${field}`).textContent()).trim()
    );
  }
  await expect(page.locator('#compareOrigDuration')).toHaveText('0:03');
  await expect(page.locator('#compareProcFilename')).not.toHaveText('song.wav');
  // The output lives in the app's temp dir until it is exported.
  expect(listDir(tempRoot)).toHaveLength(1);

  const exported = path.join(workDir, 'out', 'protected.wav');
  fs.mkdirSync(path.dirname(exported));
  await stubSaveDialog(app, exported);
  await page.locator('#compareExportBtn').click();

  await expect(page.locator(screens.upload)).toBeVisible();
  const output = readWav(exported);
  expect(output.audioFormat).toBe(1);
  expect(output.sampleRate).toBe(original.sampleRate);
  expect(output.channels).toBe(original.channels);
  expect(output.frames).toBe(original.frames);
  expect(output.tags).toMatchObject({ title: 'Protected title', artist: 'Protected artist' });
  // Processing changed the audio.
  expect(output.data.equals(original.data)).toBe(false);
  // Temp output removed once exported.
  expect(listDir(tempRoot)).toHaveLength(0);
});

test('cancelling the export keeps Compare and Export available (F39)', async ({
  app,
  page,
  workDir,
}) => {
  const file = writeFixture(workDir, 'keep.wav');
  await importViaPicker(app, page, file);
  await waitForMetadata(page);
  await processWith(page, ['White Noise']);

  await stubSaveDialog(app, null);
  await page.locator('#compareExportBtn').click();
  // The click is handled once the (stubbed) dialog answered; Compare must not move.
  await expect(page.locator(screens.compare)).toBeVisible();
  await expect(page.locator('#compareExportBtn')).toBeEnabled();

  const exported = path.join(workDir, 'second-try.wav');
  await stubSaveDialog(app, exported);
  await page.locator('#compareExportBtn').click();
  await expect(page.locator(screens.upload)).toBeVisible();
  expect(fs.existsSync(exported)).toBe(true);
});

test('the original file is never modified when no tag is edited (F41)', async ({
  app,
  page,
  workDir,
}) => {
  const file = writeFixture(workDir, 'untouched.wav', { tags: { title: 'Same' } });
  const hash = sha256(file);
  await importViaPicker(app, page, file);
  await waitForMetadata(page);

  await processWith(page, ['White Noise', 'Pink Noise']);
  await stubSaveDialog(app, path.join(workDir, 'exported.wav'));
  await page.locator('#compareExportBtn').click();
  await expect(page.locator(screens.upload)).toBeVisible();

  expect(sha256(file)).toBe(hash);
});

test('Restart from Analyze and from Compare returns to a cleared Upload (F29, F43)', async ({
  launched,
  workDir,
}) => {
  const { app, page, tempRoot } = launched;
  const tagged = writeFixture(workDir, 'tagged.wav', { tags: { title: 'Tagged' } });
  const plain = writeFixture(workDir, 'plain.wav', { channels: 1, sampleRate: 48000 });

  await importViaPicker(app, page, tagged);
  await waitForMetadata(page);
  await page.locator('#restartBtn').click();
  await expect(page.locator(screens.upload)).toBeVisible();
  await expect(page.locator('#appHeader')).toBeVisible();

  await importViaPicker(app, page, tagged);
  await waitForMetadata(page);
  await processWith(page, ['White Noise']);
  expect(listDir(tempRoot)).toHaveLength(1);
  await page.locator('#restartBtn').click();
  await expect(page.locator(screens.upload)).toBeVisible();
  await expect(page.locator('#appHeader')).toBeVisible();
  // The abandoned result is deleted.
  await expect.poll(() => listDir(tempRoot)).toHaveLength(0);

  // Nothing of the previous file shows with the next one.
  await importViaPicker(app, page, plain);
  await waitForMetadata(page);
  await expect(page.locator('[data-tag="title"]')).toHaveValue('');
  await expect(page.locator('#analyzeMetaChannels')).toHaveText('1');
});

// With no mode ticked, Process copies the audio unchanged.
test('no mode ticked: Process gives a byte-identical audio pass-through (#83)', async ({
  app,
  page,
  workDir,
}) => {
  const file = writeFixture(workDir, 'passthrough.wav', { seconds: 2 });
  const original = readWav(file);
  await importViaPicker(app, page, file);
  await waitForMetadata(page);

  await expect(page.locator('#processBtn')).toBeEnabled({ timeout: 5_000 });
  await page.locator('#processBtn').click();
  await expect(page.locator(screens.compare)).toBeVisible({ timeout: 60_000 });
  const exported = path.join(workDir, 'passthrough-out.wav');
  await stubSaveDialog(app, exported);
  await page.locator('#compareExportBtn').click();
  await expect(page.locator(screens.upload)).toBeVisible();

  const output = readWav(exported);
  expect(output.sampleRate).toBe(original.sampleRate);
  expect(output.channels).toBe(original.channels);
  expect(output.bitsPerSample).toBe(original.bitsPerSample);
  expect(output.data.equals(original.data)).toBe(true);
});
