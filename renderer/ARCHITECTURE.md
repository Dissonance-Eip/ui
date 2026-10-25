# Renderer Architecture

Small OOP/MVC-ish structure where:

- **Controllers** orchestrate flows and side effects.
- **Views** own DOM bindings and view-level UI updates.
- **Components** are reusable UI building blocks.
- **Services** implement pure(ish) domain logic.
- **Infrastructure** wraps platform/bridge concerns.

A view IS a component — same lifecycle, same listener tracking, same dispose. Both extend `BaseComponent` directly. There is no separate `BaseView` class.

## Folder map

- `renderer/app/`
  - `bootstrap.js` — composition root for the renderer. The only place that constructs and wires dependencies.
- `renderer/base/`
  - `Disposable.js` — tracks cleanups/unsubscribes in LIFO order.
  - `BaseComponent.js` — mount/unmount lifecycle + tracked `listen()` for events.
  - `BaseController.js` — start/stop lifecycle on top of Disposable.
  - `BaseApi.js` — defensive wrapper around the preload bridge.
  - `Logger.js` — interface only; documents the Logger contract.
- `renderer/infrastructure/`
  - `DissonanceApi.js` — typed-ish facade over `window.dissonance` (preload bridge).
  - `TerminalLogger.js` — forwards log lines to the main process via `ui:log`.
  - `SystemThemeWatcher.js` — bridges OS light/dark mode into the renderer, toggles Tailwind `dark` class, dispatches `dissonance:theme` events.
  - `ViewRouter.js` — show-one-hide-others switcher for the three top-level views.
- `renderer/controllers/`
  - `AppController.js` — top-level orchestration: the three-view flow, the TagWriteQueue, the playback↔queue coordination, the quit-flush handler.
- `renderer/views/`
  - `UploadView.js` — drop zone host (delegates to the `DropZone` component).
  - `AnalyzeView.js` - file info + waveform + editable metadata + processing mode selection + process button.
  - `CompareView.js` — original vs processed waveforms + info panels + export button.
- `renderer/components/`
  - `DropZone.js` — drag/drop + click-to-open file picker. Falls back to the native dialog when a dropped file has no resolvable path.
  - `WaveformPreview.js` — reusable waveform player wrapper. Owns create/loadTrack/destroy, theme rebuild (preserves playback position), drag-to-scrub, audio event forwarding. Used by AnalyzeView (1×) and CompareView (2×).
- `renderer/services/`
  - `TagWriteQueue.js` — serialised, blockable queue for writing WAV tag metadata. Per-snapshot filePath, flush-on-quit, error recovery.
  - `WavMetadataService.js` — converts `core:readMetadata` responses into the display-friendly basicInfo shape.
- `renderer/state/`
  - `AppState.js` — current + processed file paths. `setCurrentFilePath` deliberately clears `processedFilePath`.
- `renderer/utils/`
  - `pathUtils.js` — `basename()` for absolute paths (POSIX + Windows).
  - `wavInfoFormatters.js` — display formatters for duration, sample rate, channels.

## Conventions

- **No business logic in views/components.** Put it in `services/`.
- **Controllers**:
  - Wire events between views/components.
  - Call `api` methods.
  - Update `state`.
  - Decide what to render.
- **Lifecycle**:
  - Anything that subscribes (event listener, IPC callback) should be tracked via `track()` so it is cleaned up on `unmount()` / `stop()`.
- **File-level docstrings**: every module has a header comment explaining its role and any non-obvious gotchas. Per-function JSDoc only where the signature doesn't already tell you the contract (side effects, null semantics, etc.).

## Adding a new feature

1. Add domain logic in a service (`renderer/services/...`) — pure if possible, testable in isolation.
2. Add DOM wiring in a view/component.
3. Orchestrate it in `AppController`.
4. Wire the new DOM refs in `app/bootstrap.js`.

## Waveform playback

The Analyze view and the Compare view both display waveforms via the `WaveformPreview` component, which wraps `@arraypress/waveform-player`. The component encapsulates:

- Player create / `loadTrack` / destroy lifecycle.
- Suppression of `WaveformPlayer.loadTrack()`'s unconditional auto-play (it replaces `.play` with a no-op for the duration of the call, then restores).
- `file://` URL conversion for absolute paths.
- Theme rebuild on `dissonance:theme`. Captures `currentTime` + `isPlaying` before tearing down the player, restores them after the new player's audio fires `loadedmetadata`.
- Hold-and-drag scrubbing via pointer events on the canvas (the library only ships click-to-seek).
- Audio `play` / `pause` / `ended` event forwarding via `onPlaybackStateChange`, used by `AppController` to toggle the TagWriteQueue's blocked state.

The CSP in `index.html` allows local audio loading for preview (`media-src file:` and `connect-src file:`).

## Tag editing flow

When the user edits a tag input:

1. `blur` fires on the input → `AnalyzeView.onTagBlur` callback fires with the full snapshot of all seven tag fields.
2. `AppController` enqueues the snapshot for the current file path via `TagWriteQueue.enqueue(filePath, tags)`.
3. If the queue is unblocked (audio paused), the write fires immediately on `core:writeTags`.
4. If the queue is blocked (audio playing), the snapshot replaces any previous pending snapshot. Multiple blurs while playing collapse into the latest snapshot.
5. When audio pauses or ends, `onPlaybackStateChange(false)` unblocks the queue, which auto-drains the pending snapshot.
6. On file-switch, process, or quit, `_pauseAndFlushTags()` pauses every preview, snapshots the current form (catches any blur the OS swallowed), and awaits `queue.flush()`.

Per-snapshot filePath means a queued write for File A still goes to File A even if the user has since switched to File B. Serialised writes mean the underlying read-modify-write can never be raced.
