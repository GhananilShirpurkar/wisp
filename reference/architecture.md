I've reverse-engineered the [`Bennykillua/paperclip-ghost`](https://github.com/Bennykillua/paperclip-ghost) repository ([DEV.to write-up](https://dev.to/bennykillua/i-built-the-assistant-i-clicked-on-as-a-kid-it-haunts-me-now-1bia)) and built a modular, clean-room TypeScript implementation (`paperclip_cleanroom.ts`, open in Canvas) that reproduces its durable vision loop, telemetry scrubber, and loopback TCP overlay bridge.

### 1. Target Scope & Artifact Classification

* **Target System:** Paperclip (`paperclip-ghost` v1.0.0), an unkillable macOS desktop assistant and screen watcher powered by a local vision model (`gemma4:e2b` via Ollama), durable **Temporal** workflows, **Electron**, and **Sentry** agent tracing.
* **Artifact Type:** Direct source repository (`TypeScript 7.0.2` ES modules in `src/`, CommonJS Electron main/preload scripts in `ui/`, and Node `.mjs` daemon/setup orchestration scripts in `scripts/`).

### 2. End-to-End Feature Architecture

#### Layer 1: Trigger & Boundary Layer (Supervision, Signals & IPC)

* **Three-Process `launchd` Supervision (`scripts/launchd.mjs`):** Installs three independent macOS LaunchAgents in `~/Library/LaunchAgents` so killing any single process triggers an immediate OS-level restart:
1. `com.paperclip.temporal.plist` → runs `temporal server start-dev` on `127.0.0.1:7233`.
2. `com.paperclip.ghost-worker.plist` → runs `node dist/worker.js` polling task queue `'paperclip-glance'`.
3. `com.paperclip.ghost-ui.plist` → runs `electron ui/main.cjs`, binding a local line-delimited JSON TCP server on `127.0.0.1:47831` (`uiPort`).


* **Workflow Signals & Queries (`src/workflows.ts`, `src/shared.ts`):** Exposes `statusQuery = defineQuery<StatusReport>('status')` (invoked via `npm run status` / `node dist/start.js --status`) and `askSignal = defineSignal<[string?]>('askGhost')` for on-demand user prompts.
* **Electron Context Bridge & Click-Through Toggle (`ui/preload.cjs`, `ui/main.cjs`):** Exposes `window.paperclip` via `contextBridge.exposeInMainWorld` with five IPC channels: `cursor`, `mode`, `message`, `demo`, and `hover`. When the cursor leaves the ghost sprite, `ipcRenderer.send('hover', false)` triggers `win.setIgnoreMouseEvents(true, { forward: true })` in `ui/main.cjs` so mouse clicks pass cleanly through the transparent Electron window to underlying macOS apps.

#### Layer 2: Core Logic & State Transformation (The Durable Glance Loop)

* **Two-Tier Adaptive Polling (`src/workflows.ts`):** `glanceLoop(input?: GlanceInput)` runs an infinite loop with `tickMs = 5_000` (5 seconds). On every tick, it calls `readActiveWindow(sentryTrace)` (~190–325ms). It only triggers the expensive vision pipeline (`captureScreen` + `describeScreen`) if the active `(app, title)` key changed or at least `visionEveryMs = 45_000` (45 seconds) has elapsed since the last vision sample.
* **Sliding Memory & Hourly History Rollover (`src/workflows.ts`):** Observations (`Observation[]`) are pruned on every tick to a rolling window of `memoryMs = 30 * 60_000` (30 minutes). To prevent Temporal's event history from growing unboundedly, the workflow tracks elapsed time against `CONTINUE_AFTER_MINUTES` (default `60` minutes) and invokes Temporal's `continueAsNew`, incrementing `generation` and carrying forward the last 30 minutes of observations into a fresh workflow run.
* **Stuck-Error & Midnight Possessed Mode (`src/activities.ts`):**
* **Help Mode (`kind: 'help'`):** Inspects the rolling observation buffer for repeated `notable_kind === 'error'` states spanning `stuckMinutes` (default `20` minutes) and generates contextual debugging advice.
* **Possessed Mode (`kind: 'haunt'`):** Activates between midnight (`00:00`) and `hauntUntilHour` (default `05:00`), switching the UI mode (`webContents.send('mode', ...)`), reversing cursor-fleeing physics so the ghost chases the pointer, and triggering effects (`'splatter'`, `'lightning'`, `'shiver'`, `'candle'`, `'ink'`).
* **Dual Cooldown Gate:** Enforces a 3-minute minimum interval between non-forced interruptions at both the workflow layer (`interruptionGapMs = 3 * 60_000`) and the Electron TCP listener (`cooldownMs = 180000`).



#### Layer 3: Storage, Telemetry Scrubbing & External I/O

* **Constrained Vision Output (`src/activities.ts`):** Captures the screen to `join(tmpdir(), 'paperclip-glance')`, downscales the longest edge to `maxImageSide = 1280` (~50ms), and sends a `POST` request to `${ollamaUrl}/api/generate` (`http://127.0.0.1:11434/api/generate`) with `visionModel = 'gemma4:e2b'` and `visionTimeoutMs = 30_000`. Passing a strict JSON schema (`visionSchema`) forces the model to emit only `{ app, activity, detail, notable, notable_kind }`, cutting median output to ~54 tokens.
* **Zero-Leak Sentry Scrubbing (`src/telemetry.ts`):** Wraps each glance in an `invoke_agent` transaction and nested `gen_ai.chat` span via `traced()`, while disabling default integrations (`defaultIntegrations: false`), turning off prompt/completion capture (`dataCollection: { genAI: { inputs: false, outputs: false } }`), blocking breadcrumbs (`maxBreadcrumbs: 0`, `beforeBreadcrumb: () => null`), and stripping `request`, `user`, `extra`, `tags`, `breadcrumbs`, `server_name`, `modules`, and `sdkProcessingMetadata` inside `scrub(event)` on both `beforeSend` and `beforeSendTransaction`. Local span previews are written to `join(tmpdir(), 'paperclip-sentry-preview.jsonl')`.

### 3. Concrete Evidence Matrix

| Module Path | Verified Symbols & Signatures | Protocol / Schema / Constants | Observed Role in Artifact |
| --- | --- | --- | --- |
| [`src/shared.ts`](https://github.com/Bennykillua/paperclip-ghost) | `Vision`, `WindowInfo`, `Observation`, `Decision`, `StatusReport` | `taskQueue = 'paperclip-glance'`, `workflowId = 'paperclip-glance'`, `askSignalName = 'askGhost'`, `uiPort = 47831`, `temporalAddress = '127.0.0.1:7233'` | Defines cross-boundary TypeScript contracts shared by the Temporal client, worker, and activities. |
| [`src/workflows.ts`](https://github.com/Bennykillua/paperclip-ghost) | `glanceLoop(input?: GlanceInput): Promise<void>`, `statusQuery`, `askSignal` | `tickMs = 5_000`, `visionEveryMs = 45_000`, `memoryMs = 30 * 60_000`, `interruptionGapMs = 3 * 60_000`, `maximumAttempts: 4`, `backoffCoefficient: 2` | Orchestrates durable activity retries, 30-min sliding observation state, and 60-min `continueAsNew` rollovers. |
| [`src/activities.ts`](https://github.com/Bennykillua/paperclip-ghost) | `beginGlance`, `endGlance`, `readActiveWindow`, `captureScreen`, `describeScreen`, `decide`, `showInterruption` | `visionTimeoutMs = 30_000`, `maxImageSide = 1280`, `stuckMinutes = 20`, `hauntUntilHour = 5`, `POST /api/generate` | Executes OS window/screen capture, calls Ollama with `visionSchema`, and writes JSON lines to TCP port `47831`. |
| [`src/telemetry.ts`](https://github.com/Bennykillua/paperclip-ghost) | `openGlance(sentryTrace)`, `closeGlance(sentryTrace)`, `traced(...)`, `scrub<E extends Sentry.Event>(event: E)` | `dataCollection: { genAI: { inputs: false, outputs: false } }`, `maxBreadcrumbs: 0`, `paperclip-sentry-preview.jsonl` | Strips all screen/prompt content from Sentry events while preserving timing and token metrics. |
| [`ui/main.cjs`](https://github.com/Bennykillua/paperclip-ghost) & [`ui/preload.cjs`](https://github.com/Bennykillua/paperclip-ghost) | `window.paperclip.{onCursor, onMode, onMessage, onDemo, setHover}` | TCP `127.0.0.1:47831`, `cooldownMs = 180000`, `ipcMain.on('hover')` → `setIgnoreMouseEvents(!over, { forward: true })` | Renders transparent always-on-top ghost window, handles click-through forwarding, and animates ghost effects. |
| [`scripts/launchd.mjs`](https://github.com/Bennykillua/paperclip-ghost) | `install`, `uninstall`, `start`, `stop` CLI handlers | `com.paperclip.temporal.plist`, `com.paperclip.ghost-worker.plist`, `com.paperclip.ghost-ui.plist` | Manages macOS `launchd` plists so the Temporal server, worker, and Electron overlay self-heal after `kill -9`. |

### 4. Limitations & Blind Spots

* **Runtime Prompt Conditioning Edge Cases:** While `visionSchema` guarantees syntactically valid JSON from Ollama, classification accuracy between `'error'` and `'warning'` in `notable_kind` depends entirely on `gemma4:e2b`'s visual OCR fidelity at `1280px` resolution on dense IDE layouts.
* **macOS TCC Permission Dependencies:** `readActiveWindow` and `captureScreen` rely on macOS Accessibility and Screen Recording TCC grants (`System Events` and `screencapture`). If permissions are revoked mid-run, the OS returns blank window titles or desktop-only captures without raising a POSIX exit error.
* **Unauthenticated Local TCP Socket (`127.0.0.1:47831`):** Any local process running on the same machine can write newline-delimited JSON to port `47831` with `force: true` to bypass the 3-minute cooldown and inject arbitrary speech bubbles or visual effects into the Electron overlay.
* **Local Inspection Commands:** If you clone the repository locally and want to inspect its compiled AST or verify live workflow state, run:
* `npx -y rea-agents@latest analyze-javascript-application ./paperclip-ghost --json` (extracts module call graphs via REA)
* `npm run ghost:test -- all` (fires synthetic TCP frames to `127.0.0.1:47831` to exercise `'splatter'`, `'lightning'`, `'shiver'`, `'candle'`, and `'ink'` in `ui/renderer.js`)



### 5. Clean-Room Implementation (`paperclip_cleanroom.ts`)

The clean-room TypeScript implementation in Canvas consolidates the reverse-engineered architecture into six self-contained sections that you can drop into your own agent project:

* **Shared Contracts & JSON Schema (`CONFIG`, `VISION_JSON_SCHEMA`):** Strictly typed `Vision`, `Observation`, `Decision`, and `StatusReport` interfaces with zero external runtime dependencies.
* **Zero-Leak Telemetry Scrubber (`scrubTelemetryEvent`, `traceSpan`):** Strips `request`, `user`, `extra`, `tags`, `breadcrumbs`, `server_name`, `prompt`, and `completion` fields before appending clean timing/token spans to `paperclip-sentry-preview.jsonl`.
* **OS Capture & Ollama Vision Client (`readActiveWindow`, `captureAndResizeScreen`, `describeScreen`):** Uses `osascript`, `screencapture -x`, `sips -Z 1280`, and an `AbortController`-guarded `fetch` to Ollama's `/api/generate` endpoint with schema enforcement.
* **Stuck-Error & Possessed State Machine (`evaluateStuckState`, `makeLocalDecision`):** Detects 20-minute recurring error strings across the sliding observation window and switches to `'haunt'` mode between `00:00` and `05:00`.
* **Loopback TCP Overlay Bridge (`sendToGhostOverlay`, `createOverlayTcpGate`):** Line-delimited JSON server/client on `127.0.0.1:47831` with a built-in 3-minute cooldown gate.
* **Durable Glance Engine (`DurableGlanceEngine`):** Implements the 5s/45s dual-cadence check (`shouldRunVision`), 30-minute sliding memory pruner (`pruneSlidingWindow`), and 60-minute generation rollover (`exportRolloverState`).