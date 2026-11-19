/**
 * `file:checkWav` IPC — a quick look at a WAV's chunk headers before the
 * renderer imports it (ui#147), so a damaged file is refused at import
 * rather than failing later on Process:
 *
 *   • at least a RIFF/WAVE header
 *   • a `data` chunk, reached by walking the chunk headers (LIST may sit before it)
 *   • that chunk holding every byte its header declares
 *
 * Only chunk headers are read, never the audio. It refuses no more than the
 * core's own parser does, but does not depend on the core addon, so it also
 * works with an older bundled addon.
 */
const fs = require('fs');
const { ipcMain } = require('electron');
const { IpcChannels } = require('./ipcChannels');
const { checkFilePath } = require('./core/corePayloads');

const RIFF_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;

async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  await handle.read(buffer, 0, length, position);
  return buffer;
}

/** @returns {Promise<string|null>} why the file is damaged, or null when it is complete */
async function findDamage(handle) {
  const { size } = await handle.stat();
  if (size < RIFF_HEADER_SIZE) return `file is ${size} bytes, too short for a RIFF/WAVE header`;
  const riff = await readAt(handle, 0, RIFF_HEADER_SIZE);
  if (riff.toString('ascii', 0, 4) !== 'RIFF' || riff.toString('ascii', 8, 12) !== 'WAVE') {
    return 'missing RIFF/WAVE magic';
  }
  let offset = RIFF_HEADER_SIZE;
  while (offset + CHUNK_HEADER_SIZE <= size) {
    const header = await readAt(handle, offset, CHUNK_HEADER_SIZE);
    const chunkSize = header.readUInt32LE(4);
    const body = offset + CHUNK_HEADER_SIZE;
    if (header.toString('ascii', 0, 4) === 'data') {
      const remaining = size - body;
      return chunkSize <= remaining
        ? null
        : `'data' chunk declares ${chunkSize} bytes but only ${remaining} remain`;
    }
    offset = body + chunkSize + (chunkSize % 2); // RIFF chunks are word-aligned
  }
  return "no complete 'data' chunk";
}

/**
 * @param {unknown} filePath  from the renderer, so checked first
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
async function checkWavFile(filePath) {
  const invalid = checkFilePath(filePath);
  if (invalid) return { ok: false, error: invalid };
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const damage = await findDamage(handle);
    return damage ? { ok: false, error: `Damaged WAV: ${damage}` } : { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not read the file: ${err.message}` };
  } finally {
    await handle?.close();
  }
}

/** @param {{ ipc?: { handle: Function } }} [deps] ipc defaults to ipcMain */
function registerWavCheckHandler({ ipc = ipcMain } = {}) {
  ipc.handle(IpcChannels.FILE_CHECK_WAV, (_event, filePath) => checkWavFile(filePath));
}

module.exports = { checkWavFile, registerWavCheckHandler };
