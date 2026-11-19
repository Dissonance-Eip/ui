/**
 * Vitest global setup: install the Electron binary once, before any worker
 * starts (#152).
 *
 * Since electron 44 the binary is downloaded on the first require('electron'),
 * not at npm install. The main-process modules require it at load time, so
 * after a fresh `npm ci` every parallel worker would start the same download
 * and extract into node_modules/electron/dist at once ("File exists (os error
 * 17)"). Requiring it here runs that install a single time.
 */
import { createRequire } from 'node:module';

export default function installElectronBinary() {
  createRequire(import.meta.url)('electron');
}
