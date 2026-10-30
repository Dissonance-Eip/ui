/**
 * Integration tests that run the real core addon (no mocks) under Node.
 *
 * The addon is loaded with the same CoreAddonLoader the app uses. All input
 * files (a valid WAV, truncated WAVs, a non-WAV file) are generated here, so
 * no audio is committed to the repository.
 *
 * Platform handling:
 *   - If a binary for this platform exists in Build/Release/ (or the
 *     DISSONANCE_CORE_ADDON_PATH override is set), loading it must succeed,
 *     otherwise the suite fails. CI (linux-x64) therefore cannot skip silently.
 *   - If no binary exists for this platform, the suite is skipped with a
 *     warning message.
 *
 * Rejections are asserted as an Error with a non-empty message (the exact
 * wording belongs to the engine and may change between releases).
 *
 * Regression coverage (Beta 1 defects):
 *   - F9:  a non-WAV file is rejected with a clear error.
 *   - F10: a truncated WAV is rejected with a clear error.
 *   - F27: a strength of 0 must leave the audio untouched. The current addon
 *     does not satisfy this yet (see ui#83), so those tests use `it.fails`.
 *     When the addon is fixed they will start failing as "unexpectedly
 *     passing": remove `.fails` at that point.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { CoreAddonLoader } = require('../ipcHandlers/core/CoreAddonLoader.js');

const platformBinary = path.join(
  import.meta.dirname,
  '..',
  'Build',
  'Release',
  `dissonance_core-${process.platform}-${process.arch}.node`
);
const binaryExpected =
  fs.existsSync(platformBinary) || Boolean(process.env.DISSONANCE_CORE_ADDON_PATH);

if (!binaryExpected) {
  console.warn(
    `[coreAddon.integration] Skipped: no addon binary for ${process.platform}-${process.arch} ` +
      'in Build/Release/ and DISSONANCE_CORE_ADDON_PATH is not set.'
  );
}

// ---- WAV helpers -----------------------------------------------------------

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BITS = 16;
const DURATION_SEC = 2;

/** Builds a canonical 16-bit PCM WAV containing a two-tone test signal. */
function buildWav({ sampleRate, channels, seconds }) {
  const frames = Math.round(sampleRate * seconds);
  const dataSize = frames * channels * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(BITS, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const sample = 8000 * Math.sin(2 * Math.PI * 440 * t) + 3000 * Math.sin(2 * Math.PI * 1234 * t);
    for (let c = 0; c < channels; c++) {
      buf.writeInt16LE(Math.round(sample), 44 + (i * channels + c) * 2);
    }
  }
  return buf;
}

/** Parses the RIFF chunks of a WAV buffer. Throws if it is not a valid WAV. */
function parseWav(buf) {
  expect(buf.length).toBeGreaterThanOrEqual(44);
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WAVE');

  let fmt = null;
  let dataBytes = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataBytes = size;
      break;
    }
    offset = body + size + (size % 2);
  }

  expect(fmt).not.toBeNull();
  expect(dataBytes).not.toBeNull();
  // The declared data size must fit inside the file.
  expect(dataBytes).toBeLessThanOrEqual(buf.length);
  const frames = dataBytes / (fmt.channels * (fmt.bitsPerSample / 8));
  return { ...fmt, dataBytes, frames, durationSec: frames / fmt.sampleRate };
}

// ---- Suite -----------------------------------------------------------------

describe.skipIf(!binaryExpected)('core addon integration (real addon)', () => {
  let addon;
  let tmpDir;
  let inputPath;
  let inputBuf;

  const outPath = (name) => path.join(tmpDir, name);

  beforeAll(() => {
    const silent = { log: () => {}, warn: () => {} };
    const result = new CoreAddonLoader({ logger: silent }).load();
    addon = result.addon;
    if (!addon) {
      throw new Error(
        `An addon binary exists for this platform but CoreAddonLoader could not load it: ${result.error.message}`
      );
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dissonance-addon-it-'));
    inputBuf = buildWav({ sampleRate: SAMPLE_RATE, channels: CHANNELS, seconds: DURATION_SEC });
    inputPath = path.join(tmpDir, 'input.wav');
    fs.writeFileSync(inputPath, inputBuf);
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes the documented addon contract', () => {
    expect(typeof addon.process).toBe('function');
    expect(typeof addon.readMetadata).toBe('function');
    expect(typeof addon.writeTags).toBe('function');
  });

  describe('process: valid WAV', () => {
    it('writes a valid WAV with the same duration, sample rate and channels', async () => {
      const out = outPath('processed.wav');
      const result = await addon.process(inputPath, {
        modes: ['white_noise'],
        perturbation: 0.5,
        outputPath: out,
      });

      expect(result.ok).toBe(true);
      expect(result.processedPath).toBe(out);
      expect(fs.existsSync(out)).toBe(true);

      const before = parseWav(inputBuf);
      const after = parseWav(fs.readFileSync(out));
      expect(after.audioFormat).toBe(before.audioFormat);
      expect(after.sampleRate).toBe(SAMPLE_RATE);
      expect(after.channels).toBe(CHANNELS);
      expect(after.bitsPerSample).toBe(BITS);
      expect(after.frames).toBe(before.frames);
      expect(after.durationSec).toBeCloseTo(DURATION_SEC, 3);
    });

    it('produces audio that differs from the input at normal strength', async () => {
      const out = outPath('processed-differs.wav');
      await addon.process(inputPath, {
        modes: ['white_noise'],
        perturbation: 0.5,
        outputPath: out,
      });
      expect(fs.readFileSync(out).equals(inputBuf)).toBe(false);
    });

    it('reports matching format fields for the processed file via readMetadata', async () => {
      const out = outPath('processed-meta.wav');
      await addon.process(inputPath, {
        modes: ['white_noise'],
        perturbation: 0.5,
        outputPath: out,
      });
      const meta = await addon.readMetadata(out);
      expect(meta.ok).toBe(true);
      expect(meta.audio.numChannels).toBe(CHANNELS);
      expect(meta.audio.sampleRate).toBe(SAMPLE_RATE);
      expect(meta.audio.bitsPerSample).toBe(BITS);
      expect(meta.audio.durationSec).toBeCloseTo(DURATION_SEC, 3);
    });
  });

  describe('F9: non-WAV input', () => {
    it('rejects a plain text file named .wav and writes no output', async () => {
      const bad = outPath('not-audio.wav');
      const out = outPath('not-audio.out.wav');
      fs.writeFileSync(bad, 'this is not a wav file, it is just text');

      await expect(
        addon.process(bad, { modes: ['white_noise'], perturbation: 0.5, outputPath: out })
      ).rejects.toThrow(/\S/);
      expect(fs.existsSync(out)).toBe(false);
    });

    it('rejects non-RIFF binary data (MP3-like bytes) and writes no output', async () => {
      const bad = outPath('fake-mp3.wav');
      const out = outPath('fake-mp3.out.wav');
      fs.writeFileSync(
        bad,
        Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(2000, 7)])
      );

      await expect(
        addon.process(bad, { modes: ['white_noise'], perturbation: 0.5, outputPath: out })
      ).rejects.toThrow(/\S/);
      expect(fs.existsSync(out)).toBe(false);
    });

    it('rejects a missing input file', async () => {
      const out = outPath('missing.out.wav');
      await expect(
        addon.process(outPath('does-not-exist.wav'), { outputPath: out })
      ).rejects.toThrow(/\S/);
      expect(fs.existsSync(out)).toBe(false);
    });

    it('readMetadata also rejects a non-WAV file', async () => {
      const bad = outPath('not-audio-meta.wav');
      fs.writeFileSync(bad, 'plain text');
      await expect(addon.readMetadata(bad)).rejects.toThrow(/\S/);
    });
  });

  describe('F10: truncated WAV', () => {
    it('rejects a WAV cut off in the middle of the audio data and writes no output', async () => {
      const bad = outPath('truncated-data.wav');
      const out = outPath('truncated-data.out.wav');
      fs.writeFileSync(bad, inputBuf.subarray(0, 44 + 1000));

      await expect(
        addon.process(bad, { modes: ['white_noise'], perturbation: 0.5, outputPath: out })
      ).rejects.toThrow(/\S/);
      expect(fs.existsSync(out)).toBe(false);
    });

    it('rejects a WAV cut off inside the header and writes no output', async () => {
      const bad = outPath('truncated-header.wav');
      const out = outPath('truncated-header.out.wav');
      fs.writeFileSync(bad, inputBuf.subarray(0, 20));

      await expect(
        addon.process(bad, { modes: ['white_noise'], perturbation: 0.5, outputPath: out })
      ).rejects.toThrow(/\S/);
      expect(fs.existsSync(out)).toBe(false);
    });
  });

  describe('F27: 0% strength must not modify the audio (known failure, ui#83)', () => {
    // Option sets the UI can send at 0%: explicit zero strength, and the empty
    // options object the app sends when the slider is at 0.
    const zeroStrengthCases = [
      ['perturbation 0 with a mode selected', { modes: ['white_noise'], perturbation: 0 }],
      ['perturbation 0 with no modes', { perturbation: 0 }],
      ['empty options (what the app sends at 0%)', {}],
    ];

    it.fails.each(zeroStrengthCases)(
      'output is byte-identical to the input: %s',
      async (_label, options) => {
        const out = outPath(`zero-${Math.random().toString(36).slice(2)}.wav`);
        await addon.process(inputPath, { ...options, outputPath: out });
        expect(fs.readFileSync(out).equals(inputBuf)).toBe(true);
      }
    );
  });
});
