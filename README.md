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

The macOS build is signed and notarized by Apple. The Windows build is not signed yet, so Windows warns you the first time you open the app: click **More info**, then **Run anyway**.

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
- **vitest** for unit tests, **Playwright** for end-to-end tests of the running app
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

All four are gated by CI on every pull request and on every push to `main`.

For an interactive test loop: `npm run test:watch`.

### Test coverage

```bash
npm run test:coverage
```

Prints a per-file coverage table and writes a report to `coverage/` (git-ignored; open `coverage/index.html` for the browsable version). Every source file is counted, including files that no test imports, so the total reflects the real state of the project. The team target is 85% line coverage, enforced by `vitest.config.mjs`: the command fails below it, and so does CI, which also prints the total in the job summary.

### Addon integration test

`tests/coreAddon.integration.test.js` runs the real core addon from `Build/Release/` through the same `CoreAddonLoader` the app uses. It generates its own WAV fixtures, so no audio is committed. It checks that a processed file is a valid WAV with the same duration, sample rate and channels, and covers Beta 1 regressions (non-WAV input, truncated WAV, 0% strength). The 0% strength tests expect byte-identical output from the addon (core#101, core v0.2.0-rc.1 and later). On a platform with no matching addon binary the test is skipped with a warning.

### End-to-end tests

```bash
npm run test:e2e       # compiles Tailwind, then playwright test
npx playwright test tests/e2e/errors.spec.js   # one file
npx playwright show-report                     # after a CI-style run (CI=1)
```

`tests/e2e/` drives the real Electron app with Playwright's `_electron` launcher, on the real core addon from `Build/Release/`. Each test launches its own app with its own userData dir (so the single-instance lock never hands the launch to another running Dissonance) and its own `TMPDIR` (so processed temp files can be counted). Native open and save dialogs are stubbed in the main process; a drag and drop is simulated with a real, disk-backed file. WAV fixtures are generated at test time by `tests/e2e/helpers/wav.js`, so no audio is committed. Test titles name the acceptance test plan rows they cover (F2, F4, ...).

The suite covers the happy path (import, tags, process, compare, export, restart, quit) and the failure paths (truncated, zero-length, non-RIFF and non-WAV files, cancelled dialogs). Tests marked `test.fail` assert the fixed behaviour of an open pull request named in the test; remove `test.fail` once that pull request is merged.

On Linux, run under a display server: CI uses `xvfb-run -a npm run test:e2e` in the `E2E` job of the UI quality workflow, and uploads the Playwright report and traces when it fails. The suite is not part of `npm test` or of the coverage total.

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

Processing is mode-driven. Select one or more modes on the Analyze view, then press Process. The modes are White Noise, Phase Distortion, Spectral Gate, and Pink Noise. With no mode selected, Process leaves the audio unchanged (only edited tags are written). This build uses the project's validated default protection strength; a strength control will return once every mode is finalized.

### Waveform

`@arraypress/waveform-player` rendered via the reusable `WaveformPreview` component. Adds hold-and-drag scrubbing on top of the library (which only ships click-to-seek) and survives theme changes without losing playback position.

---

## Architecture

See [`renderer/ARCHITECTURE.md`](renderer/ARCHITECTURE.md) for the full folder map. Quick view:

- **Main process** (`main/`, `ipcHandlers/`) — window manager (one process, several windows), IPC handlers split by responsibility, single composition root in `fileHandlers.js`; logs go through `main/logger.js`, which starts every warn and error line with `[handled]` (caught and dealt with) or `[unhandled]` (nothing caught it: uncaught exceptions and unhandled rejections in main, the renderer and preload)
- **Preload** (`preload.js`) — minimal contextBridge exposing `window.dissonance.*`
- **Renderer** (`renderer/`) — composition root in `app/bootstrap.js`, then `controllers/` → `views/` + `components/` + `services/` + `infrastructure/`

The C++ core is invoked via IPC channels prefixed `core:` — see "IPC channels" below.

---

## IPC channels

The main side takes every name from `ipcHandlers/ipcChannels.js`. The sandboxed `preload.js` can't import it and keeps string literals, so `tests/ipcContract.test.js` checks that each of its channels exists there and has a main handler.

| Channel                                | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `dialog:openFile`                      | Native file picker (audio formats)                           |
| `file:checkWav`                        | Refuse a truncated or non-RIFF WAV before import             |
| `core:process`                         | Run the full audio pipeline on a WAV                         |
| `core:readMetadata`                    | Read header + LIST/INFO tags without decoding audio          |
| `core:writeTags`                       | Rewrite the LIST/INFO chunk in place                         |
| `core:export`                          | Save-as dialog + copy a processed temp file                  |
| `core:cleanupProcessed`                | Delete a tracked temp file (`ok: false` if it can't be)      |
| `ui:getSystemTheme` + `ui:systemTheme` | OS light/dark sync                                           |
| `ui:log`                               | Renderer log line → main-process console                     |
| `app:flushRequest` + `app:flushDone`   | Quit/close coordination so pending writes finish before exit |

---

## Core addon integration

The main process loads the native addon at startup via `CoreAddonLoader`:

- Loader: `ipcHandlers/core/CoreAddonLoader.js`
- Default location: `Build/Release/dissonance_core-${platform}-${arch}.node`
- Falls back to `Build/Release/dissonance_core.node`, `build/Release/`, then node-bindings; paths that don't exist are skipped
- `load()` returns `{ addon, source, error }`. If no strategy works, the `core:*` channels that need the addon reply with `code: 'ENGINE_UNAVAILABLE'` and the loader's `reason`

### Override the addon path

```bash
DISSONANCE_CORE_ADDON_PATH=/absolute/path/to/dissonance_core.node npm run dev
```

A relative path is resolved against the directory you launch from.

### Syncing binaries from the core repo

The `.github/workflows/sync-core-addon.yml` workflow pulls `.node` artifacts from a core GitHub Release into `Build/Release/`. It writes the tag of that release to `Build/Release/CORE_VERSION`, so the committed binaries always say which core release they come from. It fires automatically on push to `main` and on `repository_dispatch` from core's `release-addon.yml`. To trigger it manually, run "Sync Core Addon into UI" from the Actions tab. Its `core_tag` input picks a release (for example a `vX.Y.Z-rc.N` pre-release). Left empty, it takes the latest release, which skips pre-releases.

`main` is protected, so the workflow does not push to it. It commits the new binaries to the `chore/sync-core-addon` branch and opens a pull request into `main`, or updates the one already open. If nothing changed, or the open pull request already has the same binaries, it does nothing. A pull request opened by the workflow's `GITHUB_TOKEN` does not start other workflows, so the required `Lint, Format, Test, Build` check does not run on it. Close and reopen the pull request to run the checks, then review and merge it as usual.

One-time setup by a repository admin:

1. Create a fine-grained personal access token: resource owner `Dissonance-Eip`, repository access "Only select repositories" with `Dissonance-Eip/core` only, repository permission **Contents: Read-only** (GitHub adds Metadata: Read-only on its own). Nothing else. If the organization requires approval for fine-grained tokens, an owner approves the request. Note the expiry date and renew the token before then.
2. Store it in `ui` as the repository secret `CORE_RELEASES_TOKEN` (Settings → Secrets and variables → Actions). The workflow fails with a clear error while the secret is missing. The default `GITHUB_TOKEN` cannot read the private core repository, which is why `gh release download` reported "release not found" without it.
3. In `ui` Settings → Actions → General → Workflow permissions, tick "Allow GitHub Actions to create and approve pull requests". Without it the workflow cannot open the pull request. If the checkbox is greyed out, an organization owner must first allow it in the organization's Actions settings.

---

## Build and packaging

`npm run build` runs `electron-builder --dir` — produces an unpacked `.app` (or `.exe` folder, or `.AppImage` folder) for local testing.

`npm run dist` builds the installers for your platform (`.dmg` and `.zip` on macOS, an NSIS `.exe` on Windows, an `.AppImage` on Linux) into `dist/`.

Releases are built by `.github/workflows/release-app.yml`: pushing a `v*` tag builds all three platforms and publishes them as a GitHub release. A release candidate tag (`vX.Y.Z-rc.N`) is published as a pre-release. The macOS build is signed and notarized in CI; see [Signing and notarizing macOS releases](CONTRIBUTING.md#signing-and-notarizing-macos-releases).

---

## License

The Dissonance desktop app (this repository) is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The bundled audio engine addon (`Build/Release/*.node`, built from the closed-source `core` repository) is proprietary and is not covered by the Apache License 2.0.
