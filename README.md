# Dissonance UI

Electron desktop app that protects audio content from unauthorized AI exploitation by applying imperceptible adversarial perturbations. Pairs with the [`core`](https://github.com/Dissonance-Eip/core) repo, which provides the C++ audio pipeline as a Node.js native addon.

All audio processing is local. No network calls.

---

## Stack

- **Electron** desktop shell (main + preload + renderer)
- **JavaScript only**, no bundler — `index.html` loads plain ES modules
- **Tailwind CSS** compiled locally via Tailwind CLI
- **electron-builder** for packaging
- **vitest** for unit tests
- **C++ core** loaded at runtime as a `.node` native addon

---

## Setup

### Prerequisites

- Node.js 20.x (matches CI)
- npm

### Install

```bash
cd ui
npm install
```

### Run (dev)

```bash
npm run dev
```

`predev` compiles Tailwind first. To watch CSS changes live in another terminal:

```bash
npm run watch:css
```

---

## Quality checks

```bash
npm run lint           # eslint
npm run format:check   # prettier --check
npm test               # vitest run (unit tests)
npm run build          # electron-builder --dir (unpacked .app for testing)
```

All four are gated by CI on every push/PR.

For an interactive test loop: `npm run test:watch`.

For test coverage: `npm run test:coverage`. It prints a per-file table and
writes an HTML report to `coverage/index.html`. Every source file counts,
including ones no test imports, so untested code shows up as 0%.

---

## What's in the renderer

The app has three top-level views, navigated linearly:

1. **Upload** — drop a WAV or pick one from disk
2. **Analyze** — view file info, edit tag metadata, scrub the waveform, choose protection strength, hit Process
3. **Compare** — side-by-side waveform + info for original vs processed, then Export

### Editable metadata

Seven WAV tag fields (title, artist, date, genre, comment, copyright, software) are editable in the Analyze view. Writes are queued via `TagWriteQueue`:

- Editing while paused → writes immediately to the source file on blur
- Editing while playing → queues the write, drains automatically when you pause
- Switching files or quitting → flushes pending writes first (no edits ever lost)
- Writes are serialised so the underlying read-modify-write can't be raced

### Protection strength

Single slider (0–1, step 0.01) on the Analyze view, forwarded to the core as `options.perturbation`. The CLI also accepts `--perturbation` for headless runs.

### Waveform

`@arraypress/waveform-player` rendered via the reusable `WaveformPreview` component. Adds hold-and-drag scrubbing on top of the library (which only ships click-to-seek) and survives theme changes without losing playback position.

---

## Architecture

See [`renderer/ARCHITECTURE.md`](renderer/ARCHITECTURE.md) for the full folder map. Quick view:

- **Main process** (`main/`, `ipcHandlers/`) — single window manager, IPC handlers split by responsibility, single composition root in `fileHandlers.js`
- **Preload** (`preload.js`) — minimal contextBridge exposing `window.dissonance.*`
- **Renderer** (`renderer/`) — composition root in `app/bootstrap.js`, then `controllers/` → `views/` + `components/` + `services/` + `infrastructure/`

The C++ core is invoked via IPC channels prefixed `core:` — see "IPC channels" below.

---

## IPC channels

| Channel                                | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `dialog:openFile`                      | Native file picker (audio formats)                           |
| `core:process`                         | Run the full audio pipeline on a WAV                         |
| `core:readMetadata`                    | Read header + LIST/INFO tags without decoding audio          |
| `core:writeTags`                       | Rewrite the LIST/INFO chunk in place                         |
| `core:export`                          | Save-as dialog + copy a processed temp file                  |
| `core:cleanupProcessed`                | Delete a tracked temp file                                   |
| `ui:getSystemTheme` + `ui:systemTheme` | OS light/dark sync                                           |
| `ui:log`                               | Renderer log line → main-process console                     |
| `app:flushRequest` + `app:flushDone`   | Quit/close coordination so pending writes finish before exit |

---

## Core addon integration

The main process loads the native addon at startup via `CoreAddonLoader`:

- Loader: `ipcHandlers/core/CoreAddonLoader.js`
- Default location: `Build/Release/dissonance_core-${platform}-${arch}.node`
- Falls back to `Build/Release/dissonance_core.node`, the `dissonance-core` npm package, then node-bindings

### Override the addon path

```bash
DISSONANCE_CORE_ADDON_PATH=/absolute/path/to/dissonance_core.node npm run dev
```

### Syncing binaries from the core repo

The `.github/workflows/sync-core-addon.yml` workflow pulls `.node` artifacts from the most recent core GitHub Release into `Build/Release/`. It fires automatically on push to `dev` and on `repository_dispatch` from core's `release-addon.yml`. To trigger manually: run the workflow from the Actions tab.

---

## Build and packaging

`npm run build` runs `electron-builder --dir` — produces an unpacked `.app` (or `.exe` folder, or `.AppImage` folder) for local testing.

Producing distributable installers (`.dmg`, `.exe`, `.AppImage`) is on the beta task list — needs the `electron-builder` config block in `package.json` filled in plus a cross-platform CI workflow.

---

## License

MIT. See repository root.
