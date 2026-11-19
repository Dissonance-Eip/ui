/**
 * Inputs the app must refuse or fail on cleanly (ATP F9, F10, F30): it never
 * crashes, never reaches Compare with a broken file, and stays usable — a
 * good file imports and processes afterwards.
 *
 * Each failure also shows a readable message (ui#81, ui#82).
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
  openDialogCalls,
  tickModes,
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

/** Pick `name`, tick a mode and press Process; resolves once the run ended. */
async function importAndProcess(app, page, workDir, name, bytes) {
  const file = writeFixture(workDir, name, bytes);
  await importViaPicker(app, page, file);
  await tickModes(page, ['White Noise']);
  await page.locator('#processBtn').click();
  return file;
}

for (const [name, bytes] of Object.entries(BAD_FILES)) {
  test(`${name}: Process fails back to Analyze and the app stays usable (F10, F30)`, async ({
    launched,
    workDir,
  }) => {
    const { app, page, tempRoot } = launched;
    await importAndProcess(app, page, workDir, name, bytes);

    // The failed run lands back on Analyze, never on Compare.
    await expect(page.locator(screens.analyze)).toBeVisible();
    await expect(page.locator('#processBtn')).toBeEnabled();
    await expect(page.locator(screens.compare)).toBeHidden();
    // No broken output left behind.
    expect(fs.existsSync(tempRoot) ? fs.readdirSync(tempRoot) : []).toHaveLength(0);

    await expectStillUsable(app, page, workDir);
  });

  test(`${name}: Process shows a readable error on Analyze (#81)`, async ({
    app,
    page,
    workDir,
  }) => {
    await importAndProcess(app, page, workDir, name, bytes);

    const alert = page.locator('#view-analyze [role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/could not/i);
  });
}

for (const name of ['zero-length.wav', 'not-riff.wav']) {
  // A file whose header can't be read says so on import.
  test(`${name}: import shows a readable error on Analyze (#81)`, async ({
    app,
    page,
    workDir,
  }) => {
    await importViaPicker(app, page, writeFixture(workDir, name, BAD_FILES[name]));

    await expect(page.locator('#analyzeMetaSampleRate')).toHaveText('—');
    await expect(page.locator('#view-analyze [role="alert"]')).toBeVisible({ timeout: 10_000 });
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
    await expect(page.locator('#view-upload [role="alert"]')).toBeVisible();
    await expect(page.locator(screens.analyze)).toBeHidden();
    await expect(page.locator(screens.compare)).toBeHidden();

    await expectStillUsable(app, page, workDir);
  });

  test(`${name}: refused at import with a message (#82)`, async ({ app, page, workDir }) => {
    const file = writeFixture(workDir, name, bytes);
    await stubOpenDialog(app, file);
    await page.locator('#dropZone').click();
    await expect.poll(() => openDialogCalls(app)).toBe(1);

    const alert = page.locator('#view-upload [role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(name);
    await expect(page.locator(screens.upload)).toBeVisible();
    await expect(page.locator(screens.analyze)).toBeHidden();
  });
}
