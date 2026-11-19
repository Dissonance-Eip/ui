/**
 * Builds and parses the WAV fixtures of the E2E suite, so no audio is
 * committed to the repository. buildWav() writes a PCM WAV (16 or 24-bit)
 * holding a tone plus a little noise, with optional LIST/INFO tags;
 * parseWav() reads back what a test needs to check an output file.
 */

// Tag field (the app's data-tag name) → RIFF INFO chunk id.
export const INFO_IDS = {
  title: 'INAM',
  artist: 'IART',
  date: 'ICRD',
  genre: 'IGNR',
  comment: 'ICMT',
  copyright: 'ICOP',
  software: 'ISFT',
};
const FIELD_BY_ID = Object.fromEntries(Object.entries(INFO_IDS).map(([k, v]) => [v, k]));

const PCM = 1;
const TONE_HZ = 440;
const AMPLITUDE = 0.4;
const NOISE = 0.02;

function chunk(id, body) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  // RIFF chunks are word-aligned: an odd body gets one pad byte.
  return Buffer.concat([header, body, Buffer.alloc(body.length % 2)]);
}

function infoList(tags) {
  const entries = Object.entries(tags).filter(([, value]) => value);
  if (entries.length === 0) return Buffer.alloc(0);
  const subChunks = entries.map(([field, value]) =>
    chunk(INFO_IDS[field], Buffer.from(`${value}\0`, 'utf8'))
  );
  return chunk('LIST', Buffer.concat([Buffer.from('INFO', 'ascii'), ...subChunks]));
}

function pcmSamples({ sampleRate, channels, bitsPerSample, seconds }) {
  const bytesPerSample = bitsPerSample / 8;
  const frames = Math.round(sampleRate * seconds);
  const max = 2 ** (bitsPerSample - 1) - 1;
  const data = Buffer.alloc(frames * channels * bytesPerSample);
  // A fixed-seed LCG keeps the "noise" identical from run to run.
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  let offset = 0;
  for (let i = 0; i < frames; i++) {
    const tone = AMPLITUDE * Math.sin((2 * Math.PI * TONE_HZ * i) / sampleRate);
    for (let c = 0; c < channels; c++) {
      const value = Math.round((tone + NOISE * noise()) * max);
      data.writeIntLE(value, offset, bytesPerSample);
      offset += bytesPerSample;
    }
  }
  return data;
}

/**
 * @param {{ sampleRate?: number, channels?: number, bitsPerSample?: number,
 *   seconds?: number, tags?: Record<string, string> }} [opts]
 * @returns {Buffer} a complete WAV file
 */
export function buildWav({
  sampleRate = 44100,
  channels = 2,
  bitsPerSample = 16,
  seconds = 2,
  tags = {},
} = {}) {
  const blockAlign = channels * (bitsPerSample / 8);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(PCM, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bitsPerSample, 14);

  const body = Buffer.concat([
    Buffer.from('WAVE', 'ascii'),
    chunk('fmt ', fmt),
    infoList(tags),
    chunk('data', pcmSamples({ sampleRate, channels, bitsPerSample, seconds })),
  ]);
  return chunk('RIFF', body);
}

/**
 * Reads a WAV's format, audio data and INFO tags. Throws when the file is
 * not a RIFF/WAVE file or has no fmt / data chunk.
 * @param {Buffer} buf
 */
export function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }
  let fmt = null;
  let data = null;
  const tags = {};
  for (let offset = 12; offset + 8 <= buf.length;) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + size);
    if (id === 'fmt ') fmt = body;
    if (id === 'data') data = body;
    if (id === 'LIST' && body.toString('ascii', 0, 4) === 'INFO')
      Object.assign(tags, readInfo(body));
    offset += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('Missing fmt or data chunk');

  const channels = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const blockAlign = fmt.readUInt16LE(12);
  const frames = data.length / blockAlign;
  return {
    audioFormat: fmt.readUInt16LE(0),
    channels,
    sampleRate,
    bitsPerSample: fmt.readUInt16LE(14),
    frames,
    durationSec: frames / sampleRate,
    data,
    tags,
  };
}

function readInfo(list) {
  const tags = {};
  for (let offset = 4; offset + 8 <= list.length;) {
    const id = list.toString('ascii', offset, offset + 4);
    const size = list.readUInt32LE(offset + 4);
    const value = list
      .toString('utf8', offset + 8, offset + 8 + size)
      .replace(/\0+$/, '')
      .trim();
    if (FIELD_BY_ID[id]) tags[FIELD_BY_ID[id]] = value;
    offset += 8 + size + (size % 2);
  }
  return tags;
}
