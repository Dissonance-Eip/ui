/**
 * Inputs the app must refuse or fail on cleanly (ATP F9, F10, F30): it never
 * crashes, never reaches Compare with a broken file, and stays usable — a
 * good file imports and processes afterwards.
 *
 * Each refusal shows a readable message (ui#82, ui#147).
 */
import {
  test,
  expect,
  screens,
  writeFixture,
  importViaPicker,
  waitForMetadata,
  stubOpenDialog,
  openDialogCalls,
  processWith,
} from './helpers/app.js';
import { buildWav } from './helpers/wav.js';

const GOOD_WAV = buildWav({ seconds: 2 });
const BAD_FILES = {
  // Header and the first ~1 KB of audio: the data chunk claims 2 s.
  'truncated.wav': GOOD_WAV.subarray(0, 1024),
  'zero-length.wav': Buffer.alloc(0),
  'not-riff.wav': Buffer.from('This is a text file renamed to .wav\n'.repeat(64)),
};
const NON_WAV_FILES = {
  'sample.mp3': Buffer.concat([
    Buffer.from('ID3', 'ascii'),
    Buffer.from([3, 0, 0, 0, 0, 0, 0]),
    Buffer.alloc(4096, 0xff),
  ]),
  'notes.txt': Buffer.from('not audio at all\n'),
};

/** Proof the app is still usable: a good WAV imports and processes. */
async function expectStillUsable(app, page, workDir) {
  const good = writeFixture(workDir, 'good.wav', GOOD_WAV);
  await stubOpenDialog(app, good);
  const changeFile = page.locator('#analyzeChangeFileBtn');
  await ((await changeFile.isVisible()) ? changeFile : page.locator('#dropZone')).click();
  await expect(page.locator('#analyzeSelectedFile')).toHaveText('good.wav');
  await waitForMetadata(page);
  await processWith(page, ['White Noise']);
}

const damagedMessage = (name) => `"${name}" looks incomplete or damaged and was not imported.`;

for (const [name, bytes] of Object.entries(BAD_FILES)) {
  test(`${name}: refused at import with a message, and the app stays usable (F10, F30)`, async ({
    app,
    page,
    workDir,
  }) => {
    await stubOpenDialog(app, writeFixture(workDir, name, bytes));
    await page.locator('#dropZone').click();
    await expect.poll(() => openDialogCalls(app)).toBe(1);

    // Refused before Analyze, so it can never reach Process.
    await expect(page.locator('#uploadError')).toHaveText(damagedMessage(name));
    await expect(page.locator(screens.analyze)).toBeHidden();
    await expect(page.locator(screens.compare)).toBeHidden();

    await expectStillUsable(app, page, workDir);
  });

  test(`${name}: refused from Analyze, the current file stays (F10, F30)`, async ({
    app,
    page,
    workDir,
  }) => {
    await importViaPicker(app, page, writeFixture(workDir, 'current.wav', GOOD_WAV));
    await waitForMetadata(page);

    await stubOpenDialog(app, writeFixture(workDir, name, bytes));
    await page.locator('#analyzeChangeFileBtn').click();

    await expect(page.locator('#view-analyze [role="alert"]')).toHaveText(damagedMessage(name));
    await expect(page.locator('#analyzeSelectedFile')).toHaveText('current.wav');
    await processWith(page, ['White Noise']);
  });
}

for (const [name, bytes] of Object.entries(NON_WAV_FILES)) {
  test(`${name}: never reaches Compare and the app stays usable (F9)`, async ({
    app,
    page,
    workDir,
  }) => {
    const file = writeFixture(workDir, name, bytes);
    await stubOpenDialog(app, file);
    await page.locator('#dropZone').click();
    await expect.poll(() => openDialogCalls(app)).toBe(1);

    // The picker only offers WAV; the stub stands in for a user forcing another file.
    await expect(page.locator('#uploadError')).toBeVisible();
    await expect(page.locator(screens.analyze)).toBeHidden();
    await expect(page.locator(screens.compare)).toBeHidden();

    await expectStillUsable(app, page, workDir);
  });

  test(`${name}: refused at import with a message (#82)`, async ({ app, page, workDir }) => {
    const file = writeFixture(workDir, name, bytes);
    await stubOpenDialog(app, file);
    await page.locator('#dropZone').click();
    await expect.poll(() => openDialogCalls(app)).toBe(1);

    const alert = page.locator('#uploadError');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(name);
    await expect(page.locator(screens.upload)).toBeVisible();
    await expect(page.locator(screens.analyze)).toBeHidden();
  });
}
