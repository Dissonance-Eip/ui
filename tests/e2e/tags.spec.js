/**
 * Tag edits reach the source file and nothing else changes in it (ATP F18,
 * F20, F21, F22, F46).
 */
import fs from 'node:fs';
import {
  test,
  expect,
  screens,
  writeFixture,
  importViaPicker,
  waitForMetadata,
  stubOpenDialog,
  launchApp,
} from './helpers/app.js';
import { parseWav } from './helpers/wav.js';

const readWav = (filePath) => parseWav(fs.readFileSync(filePath));

test('a tag edit is written to the file and survives a re-import (F18, F20, F22)', async ({
  app,
  page,
  workDir,
}) => {
  const file = writeFixture(workDir, 'tagged.wav', { tags: { title: 'Old title', artist: 'Me' } });
  const other = writeFixture(workDir, 'other.wav', { channels: 1 });
  const before = readWav(file);
  await importViaPicker(app, page, file);
  await waitForMetadata(page);

  await page.locator('[data-tag="title"]').fill('New title');
  await page.locator('[data-tag="genre"]').fill('Ambient');
  // Blur saves: click outside the field.
  await page.locator('#analyzeSelectedFile').click();
  await expect.poll(() => readWav(file).tags.title).toBe('New title');

  // Change file, then come back to the first one.
  await stubOpenDialog(app, other);
  await page.locator('#analyzeChangeFileBtn').click();
  await expect(page.locator('#analyzeSelectedFile')).toHaveText('other.wav');
  await expect(page.locator('[data-tag="title"]')).toHaveValue('');
  await stubOpenDialog(app, file);
  await page.locator('#analyzeChangeFileBtn').click();
  await expect(page.locator('#analyzeSelectedFile')).toHaveText('tagged.wav');

  await expect(page.locator('[data-tag="title"]')).toHaveValue('New title');
  await expect(page.locator('[data-tag="genre"]')).toHaveValue('Ambient');
  await expect(page.locator('[data-tag="artist"]')).toHaveValue('Me');
  // Only the tags changed: same format, same audio bytes.
  const after = readWav(file);
  expect(after.tags).toMatchObject({ title: 'New title', genre: 'Ambient', artist: 'Me' });
  expect(after.sampleRate).toBe(before.sampleRate);
  expect(after.channels).toBe(before.channels);
  expect(after.bitsPerSample).toBe(before.bitsPerSample);
  expect(after.data.equals(before.data)).toBe(true);
});

test('quitting with a tag edit still in the field writes it, and relaunch opens on Upload (F21, F46)', async ({
  app,
  page,
  workDir,
}) => {
  const file = writeFixture(workDir, 'quit.wav', { tags: { title: 'Kept' } });
  await importViaPicker(app, page, file);
  await waitForMetadata(page);

  // Typed but never blurred: only the quit flush can save it.
  await page.locator('[data-tag="comment"]').fill('Saved on quit');
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => setImmediate(() => electronApp.quit()));
  await closed;

  expect(readWav(file).tags).toMatchObject({ title: 'Kept', comment: 'Saved on quit' });

  const relaunched = await launchApp(workDir);
  try {
    const { page: newPage } = relaunched;
    await expect(newPage.locator(screens.upload)).toBeVisible();
    await expect(newPage.locator('#analyzeSelectedFile')).toHaveText('No file selected');
    await importViaPicker(relaunched.app, newPage, file);
    await expect(newPage.locator('[data-tag="comment"]')).toHaveValue('Saved on quit');
  } finally {
    await relaunched.app.close();
  }
});
