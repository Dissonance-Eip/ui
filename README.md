# Dissonance

Dissonance is a desktop app for musicians and rights holders who want to protect their music from being used by AI models. It adds a carefully shaped perturbation to a WAV file, designed to stay below what a listener can hear while getting in the way of AI analysis.

Everything runs on your computer: your files are never uploaded. The audio engine lives in the [`core`](https://github.com/Dissonance-Eip/core) repository.

Dissonance is a student project (Epitech EIP) in active development, and the strength of the protection is still being improved.

---

## Install

Download the latest version from the [releases page](https://github.com/Dissonance-Eip/ui/releases/latest):

| System                | File                             |
| --------------------- | -------------------------------- |
| macOS (Apple Silicon) | `Dissonance-<version>-arm64.dmg` |
| Windows (x64)         | `Dissonance.Setup.<version>.exe` |
| Linux (x64)           | `Dissonance-<version>.AppImage`  |

The builds are not signed yet, so your system warns you the first time you open the app:

- **macOS:** right-click the app, then **Open**
- **Windows:** click **More info**, then **Run anyway**

There is no build for Intel Macs yet.

## Using Dissonance

1. **Upload:** drop a WAV file on the window, or pick one from disk.
2. **Analyze:** check the file's details, edit its tags, choose the processing modes, then **Process**.
3. **Compare:** listen to the original and the protected version side by side, then **Export** the protected file.

Only WAV files are supported.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The rest of this README is for developers.

---

## Stack

- **Electron** desktop shell (main + preload + renderer)
- **JavaScript only**, no bundler — `index.html` loads plain ES modules
- **Tailwind CSS** compiled locally via Tailwind CLI
- **electron-builder** for packaging
- **vitest** for unit tests
- **C++ core** loaded at runtime as a `.node` native addon

---

## Build from source

### Prerequisites

- Node.js 20.x (matches CI)
- npm

### Install dependencies

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
npm test               # vitest run (unit tests + addon integration test)
npm run build          # electron-builder --dir (unpacked .app for testing)
```

All four are gated by CI on every push/PR.

For an interactive test loop: `npm run test:watch`.

### Test coverage

```bash
npm run test:coverage
```

Prints a per-file coverage table and writes a report to `coverage/` (git-ignored; open `coverage/index.html` for the browsable version). Every source file is counted, including files that no test imports, so the total reflects the real state of the project. The team target is 50% line coverage; it is not enforced yet. CI prints the total line coverage in the job summary.

### Addon integration test

`tests/coreAddon.integration.test.js` runs the real core addon from `Build/Release/` through the same `CoreAddonLoader` the app uses. It generates its own WAV fixtures, so no audio is committed. It checks that a processed file is a valid WAV with the same duration, sample rate and channels, and covers Beta 1 regressions (non-WAV input, truncated WAV, 0% strength). The 0% strength tests are marked `it.fails` until the addon is fixed (ui#83). On a platform with no matching addon binary the test is skipped with a warning.

---

## What's in the renderer

The app has three top-level views, navigated linearly:

1. **Upload** — drop a WAV or pick one from disk
2. **Analyze** — view file info, edit tag metadata, scrub the waveform, choose processing modes, hit Process
3. **Compare** — side-by-side waveform + info for original vs processed, then Export

### Editable metadata

Seven WAV tag fields (title, artist, date, genre, comment, copyright, software) are editable in the Analyze view. Writes are queued via `TagWriteQueue`:

- Editing while paused → writes immediately to the source file on blur
- Editing while playing → queues the write, drains automatically when you pause
- Switching files or quitting → flushes pending writes first (no edits ever lost)
- Writes are serialised so the underlying read-modify-write can't be raced

### Protection modes

Processing is mode-driven. Select one or more modes on the Analyze view, then press Process. The modes are White Noise, Phase Distortion, Spectral Gate, and Pink Noise. This build uses the project's validated default protection strength; a strength control will return once every mode is finalized.

### Waveform

`@arraypress/waveform-player` rendered via the reusable `WaveformPreview` component. Adds hold-and-drag scrubbing on top of the library (which only ships click-to-seek) and survives theme changes without losing playback position.

---

## Architecture

See [`renderer/ARCHITECTURE.md`](renderer/ARCHITECTURE.md) for the full folder map. Quick view:

- **Main process** (`main/`, `ipcHandlers/`) — window manager (one process, several windows), IPC handlers split by responsibility, single composition root in `fileHandlers.js`
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

`npm run dist` builds the installers for your platform (`.dmg` and `.zip` on macOS, an NSIS `.exe` on Windows, an `.AppImage` on Linux) into `dist/`.

Releases are built by `.github/workflows/release-app.yml`: pushing a `v*` tag builds all three platforms and publishes them as a GitHub release.

---

## License

The Dissonance desktop app (this repository) is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The bundled audio engine addon (`Build/Release/*.node`, built from the closed-source `core` repository) is proprietary and is not covered by the Apache License 2.0.
