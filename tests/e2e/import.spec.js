/**
 * Launch and import: the Upload screen, the file picker, drag and drop,
 * the WAV info row, the waveform and the tag form (ATP F2–F8, F11, F12, F17, F48).
 */
import path from 'node:path';
import {
  test,
  expect,
  screens,
  writeFixture,
  importViaPicker,
  waitForMetadata,
  stubOpenDialog,
  openDialogCalls,
  dropFile,
  processWith,
} from './helpers/app.js';

const TAGS = {
  title: 'Night Drive',
  artist: 'The Fixtures',
  date: '2026',
  genre: 'Electronic',
  comment: 'Generated for E2E',
  copyright: '(c) Dissonance',
  software: 'e2e-wav-writer',
};

/** Non-transparent pixels drawn on the waveform canvas inside `selector`. */
const drawnPixels = (page, selector) =>
  page
    .locator(`${selector} canvas`)
    .first()
    .evaluate((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
      return count;
    });

test('launches on Upload with the header, in its own userData dir (F2)', async ({
  app,
  page,
  workDir,
}) => {
  await expect(page.locator(screens.upload)).toBeVisible();
  await expect(page.locator('#appHeader')).toBeVisible();
  await expect(page.locator('#appHeader h1')).toHaveText('Dissonance');
  await expect(page.locator('#dropZone')).toBeVisible();
  for (const hidden of [screens.analyze, screens.processing, screens.compare]) {
    await expect(page.locator(hidden)).toBeHidden();
  }
  // The isolation the suite relies on: no other Dissonance shares this instance lock.
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  expect(userData).toBe(path.join(workDir, 'userData'));
});

test('imports a tagged stereo 44.1 kHz WAV with the file picker (F3, F4, F11, F12, F17)', async ({
  app,
  page,
  workDir,
}) => {
  const file = writeFixture(workDir, 'stereo_44k.wav', { seconds: 3, tags: TAGS });

  await importViaPicker(app, page, file);
  await waitForMetadata(page);

  await expect(page.locator('#appHeader')).toBeHidden();
  await expect(page.locator('#analyzeMetaDuration')).toHaveText('0:03');
  await expect(page.locator('#analyzeMetaSampleRate')).toHaveText('44100 Hz');
  await expect(page.locator('#analyzeMetaChannels')).toHaveText('2');
  for (const [field, value] of Object.entries(TAGS)) {
    await expect(page.locator(`[data-tag="${field}"]`)).toHaveValue(value);
  }

  await expect.poll(() => drawnPixels(page, '#analyzeWaveform')).toBeGreaterThan(0);
});

test('imports a WAV dropped on the drop zone (F5)', async ({ page, workDir }) => {
  const file = writeFixture(workDir, 'dropped.wav', { tags: { title: 'Dropped' } });

  await dropFile(page, '#dropZone', file);

  await expect(page.locator(screens.analyze)).toBeVisible();
  await expect(page.locator('#analyzeSelectedFile')).toHaveText('dropped.wav');
  await expect(page.locator('[data-tag="title"]')).toHaveValue('Dropped');
});

test('a file dropped anywhere on Analyze replaces the current one (F6)', async ({
  app,
  page,
  workDir,
}) => {
  const first = writeFixture(workDir, 'first.wav', { tags: { title: 'First' } });
  const second = writeFixture(workDir, 'second.wav', {
    channels: 1,
    sampleRate: 48000,
    tags: { title: 'Second' },
  });
  await importViaPicker(app, page, first);
  await expect(page.locator('[data-tag="title"]')).toHaveValue('First');

  await dropFile(page, 'body', second);

  await expect(page.locator('#analyzeSelectedFile')).toHaveText('second.wav');
  await expect(page.locator('#analyzeMetaSampleRate')).toHaveText('48000 Hz');
  await expect(page.locator('[data-tag="title"]')).toHaveValue('Second');
});

test('cancelling the open dialog leaves the app on Upload (F7)', async ({ app, page }) => {
  await stubOpenDialog(app, null);

  await page.locator('#dropZone').click();
  await expect.poll(() => openDialogCalls(app)).toBe(1);

  await expect(page.locator(screens.upload)).toBeVisible();
  await expect(page.locator(screens.analyze)).toBeHidden();
  await expect(page.locator('#appHeader')).toBeVisible();
});

test('Change file swaps to a mono 48 kHz WAV with no tags (F8)', async ({ app, page, workDir }) => {
  const stereo = writeFixture(workDir, 'stereo.wav', { seconds: 3, tags: TAGS });
  const mono = writeFixture(workDir, 'mono_48k.wav', {
    channels: 1,
    sampleRate: 48000,
    seconds: 5,
  });
  await importViaPicker(app, page, stereo);
  await waitForMetadata(page);

  await stubOpenDialog(app, mono);
  await page.locator('#analyzeChangeFileBtn').click();

  await expect(page.locator('#analyzeSelectedFile')).toHaveText(path.basename(mono));
  await expect(page.locator('#analyzeMetaSampleRate')).toHaveText('48000 Hz');
  await expect(page.locator('#analyzeMetaChannels')).toHaveText('1');
  await expect(page.locator('#analyzeMetaDuration')).toHaveText('0:05');
  for (const field of Object.keys(TAGS)) {
    await expect(page.locator(`[data-tag="${field}"]`)).toHaveValue('');
  }
  await expect.poll(() => drawnPixels(page, '#analyzeWaveform')).toBeGreaterThan(0);
});

test('a 24-bit PCM WAV imports and processes (F48, plain header)', async ({
  app,
  page,
  workDir,
}) => {
  const file = writeFixture(workDir, 'pcm_24bit.wav', { bitsPerSample: 24, seconds: 2 });

  await importViaPicker(app, page, file);
  await waitForMetadata(page);
  await expect(page.locator('#analyzeMetaDuration')).toHaveText('0:02');
  await expect(page.locator('#analyzeMetaChannels')).toHaveText('2');

  await processWith(page, ['White Noise']);
  await expect(page.locator('#compareProcDuration')).toHaveText('0:02');
  await expect(page.locator('#compareProcSampleRate')).toHaveText('44100 Hz');
});
