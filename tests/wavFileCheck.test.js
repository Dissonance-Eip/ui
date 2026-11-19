import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkWavFile, registerWavCheckHandler } from '../ipcHandlers/wavFileCheck.js';
import { IpcChannels } from '../ipcHandlers/ipcChannels.js';
import { makeHandlingIpc } from './helpers/fakeElectron.js';

const SAMPLE_RATE = 8000;

function chunk(id, body) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body, Buffer.alloc(body.length % 2)]);
}

/** A mono 16-bit PCM WAV with `chunks` placed between fmt and data. */
function wav({ dataBytes = 1600, before = [] } = {}) {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(SAMPLE_RATE, 4);
  fmt.writeUInt32LE(SAMPLE_RATE * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);
  const body = Buffer.concat([
    Buffer.from('WAVE', 'ascii'),
    chunk('fmt ', fmt),
    ...before,
    chunk('data', Buffer.alloc(dataBytes)),
  ]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

let dir;
const write = (name, bytes) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wav-check-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('checkWavFile', () => {
  it('accepts a complete WAV', async () => {
    expect(await checkWavFile(write('good.wav', wav()))).toEqual({ ok: true });
  });

  it('accepts an odd-sized LIST chunk before data (where writeTags puts it)', async () => {
    const list = chunk('LIST', Buffer.from('INFOINAM\x03\x00\x00\x00ab\x00', 'binary'));
    expect(await checkWavFile(write('tagged.wav', wav({ before: [list] })))).toEqual({ ok: true });
  });

  it('accepts a missing pad byte after an odd data chunk', async () => {
    const file = write('odd.wav', wav({ dataBytes: 3 }).subarray(0, -1));
    expect(await checkWavFile(file)).toEqual({ ok: true });
  });

  it.each([
    ['truncated.wav', wav().subarray(0, 100)],
    ['zero-length.wav', Buffer.alloc(0)],
    ['not-riff.wav', Buffer.from('This is a text file renamed to .wav\n'.repeat(4))],
    ['cut-header.wav', wav().subarray(0, 40)],
    ['no-data.wav', wav().subarray(0, 36)],
  ])('refuses %s', async (name, bytes) => {
    const result = await checkWavFile(write(name, bytes));
    expect(result.ok).toBe(false);
    expect(result.error).toEqual(expect.any(String));
  });

  it('refuses a file it cannot open', async () => {
    const result = await checkWavFile(path.join(dir, 'missing.wav'));
    expect(result.ok).toBe(false);
  });

  it('refuses a path that is not a string', async () => {
    expect(await checkWavFile(42)).toEqual({ ok: false, error: 'No file path provided' });
  });
});

describe('registerWavCheckHandler', () => {
  it('serves the check on file:checkWav', async () => {
    const ipc = makeHandlingIpc();
    registerWavCheckHandler({ ipc });

    const reply = await ipc.handlers.get(IpcChannels.FILE_CHECK_WAV)({}, write('h.wav', wav()));

    expect(reply).toEqual({ ok: true });
  });
});
