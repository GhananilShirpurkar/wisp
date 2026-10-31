# Wisp for Linux

Wisp is a quiet desktop spirit with local Ollama vision and durable Temporal workflows. Linux is the primary platform: PipeWire/desktop-portal screen sharing, an X11/XWayland overlay, and systemd user services. Original supplied references are preserved in `reference/`.

## Meet Wisp

Node 22+, npm, and a graphical Linux desktop are required. Install dependencies and build from source after cloning; generated output is not committed.

```sh
npm ci
npm run build
npm run demo
```

Demo mode does not capture your screen. Click the ghost to open its controls, effects, and after-hours mode. Quit through its controls or tray. On Linux the overlay uses X11/XWayland for global pointer tracking and click-through. A pure Wayland installation without XWayland is not yet supported for the floating overlay.

## Enable live Linux vision

Requirements: Ollama with a vision-capable model, Temporal CLI, PipeWire, `xdg-desktop-portal`, and the portal backend matching your desktop (GNOME on Ubuntu, KDE on Plasma). X11 window-title detection additionally uses `xprop` (`x11-utils` on Ubuntu). Run `npm run doctor` for local diagnostics.

```sh
cp .env.example .env
```

Edit `.env`: set `PAPERCLIP_DEMO=0` and `PAPERCLIP_CAPTURE=1`. Set `VISION_MODEL` to a vision-capable model installed in your local Ollama instance. The supplied default is `gemma4:e2b`; the app does not download models automatically.

Start these in separate terminals from the project folder:

```sh
# 1. Local durable workflow server
 temporal server start-dev --ip 127.0.0.1 --db-filename temporal.db
# 2. Wisp and screen-sharing controller
 npm run ui
# 3. Worker (reads .env)
 npm run worker
# 4. Start the workflow once
 npm start
```

In the ghost controls or tray, choose **Screen sharing → Choose a screen**. On Wayland the desktop portal asks you which screen to share. Keep the sharing window open or minimized. On X11, pressing Choose a screen grants the primary screen. No microphone or desktop audio is requested.

Closing the sharing window, pressing Stop sharing, or revoking the desktop's share immediately ends access to future frames. A frame already being processed may finish its current local inference. Restarting the UI requires starting a new share; there is no silent permission restoration.

```sh
npm run status
npm run ask -- 'What should I try next?'
npm run stop
```

`stop` cancels the workflow. Stop the worker and Temporal separately, or use the service commands below. For a fully simulated workflow, leave `.env.example` defaults and use `npm run demo` instead of `npm run ui`.

## Wayland and X11 behavior

- **GNOME/KDE Wayland:** screen capture uses Electron's display-media flow and the PipeWire portal. Native applications' active window titles are not exposed through a universal API, so the worker uses an honest generic window label and samples every 45 seconds (or on an explicit ask). The vision model identifies the app from the shared image.
- **X11:** `xprop` supplies the active app/window title every 5 seconds. Changes trigger an immediate vision sample. If xprop is absent or unavailable, timed sampling still works.
- **Overlay:** rendered through X11/XWayland. Linux does not support Electron's mouse-event forwarding option, so the main process polls cursor position against renderer-reported hit bounds and toggles click-through directly. Native-Wayland-only global positioning is not implemented.
- **Capture:** a persistent, user-started video stream supplies JPEG frames scaled to a maximum 1280-pixel edge. Frames stay in memory and are sampled on demand, not written to temporary screenshots on Linux. Sharing the full display can include the ghost itself.

## Optional systemd user services

First install Temporal, build the app, and configure `.env`.

```sh
npm run services -- install
npm run services -- start
# Once Temporal is ready, start a workflow if one is not already running:
npm start
npm run services -- status
npm run services -- stop
npm run services -- uninstall
```

`install` writes three units under `~/.config/systemd/user` (or `$XDG_CONFIG_HOME/systemd/user`) and reloads the user manager. `start` imports the current graphical-session environment and enables/starts them. The services supervise Temporal, the worker, and the UI with a five-second restart delay. The UI is attached to the graphical-session target. Start from a logged-in desktop terminal, not a headless SSH session.

These commands do not require root. Setup does not install or enable services automatically. `stop` disables them as well as stopping them. While supervision is enabled, quitting the overlay will restart it; use `services -- stop` to shut it down. Screen sharing still needs your consent after each UI restart. Persistent dev history lives in `temporal.db`; logs are available with `journalctl --user -u paperclip-worker -u paperclip-ui -u paperclip-temporal`.

## Durability and decisions

The workflow preserves a 30-minute observation window, pending asks and interruption cooldowns across hourly continue-as-new rollovers. Activity failures retry up to four times, and the loop keeps running after exhausted retries. A stuck error must repeat across 20 minutes without an intervening resolution or long sampling gap. Midnight–05:00 worker-local time enables possessed mode. Both workflow and overlay enforce a three-minute interruption cooldown; explicit asks bypass it. Activity retries can repeat forced messages.

## Privacy and local boundaries

Capture requires both worker opt-in and an active screen share. The capture bridge binds `127.0.0.1:47832`, requires a random bearer token stored in `.runtime/capture-token` with mode 0600, and returns no-cache responses. The token is rotated on UI restart and removed on clean exit. Any process running as your user can read the token; it is not an isolation boundary against malicious same-user software. No screenshot bytes enter Temporal history.

Text observations, window titles (X11), and questions DO enter the local Temporal database. Thirty-minute workflow memory does not erase previous histories; Temporal retention governs those. Ollama is restricted to loopback HTTP. Sentry is optional: fixed operation names and allowlisted numeric metrics only, no default integrations or exception-event export. Local metric previews are written to the OS temp directory.

The separate overlay command bridge at `127.0.0.1:47831` is unauthenticated and accepts messages/effects from local processes, including forced messages. It does not expose capture. Both ports should remain loopback-only. Renderer windows are sandboxed, Node-disabled, and protected by restrictive content policies. Model messages render as plain text.

## Checks

```sh
npm test
npm run test:ui
npm run doctor
npm run wisp:test -- all   # while the overlay is running
```

Tests cover cadence, stale/resolved errors, memory pruning, schema validation, telemetry scrubbing, real TCP cooldowns, X11 parsing, systemd escaping, and authenticated HTTP capture. The Electron smoke test checks isolated preload, controls, literal message rendering, and 1280px JPEG/stop behavior using a synthetic video stream. The real portal permission picker and actual Ollama inference require an interactive desktop/model session; synthetic tests do not claim to verify those.

## Source map and references

`src/linux.ts` handles Linux window metadata and capture requests; `ui/capture*` handles consent, video frames, and the private bridge; `scripts/systemd.mjs` manages user services. The remaining `src/` modules implement the Temporal workflow, decisions, model calls, and telemetry. `ui/main.cjs` owns the ghost overlay.

Legacy macOS capture remains available in the activities module; macOS LaunchAgents can be managed with `npm run services:macos -- ...`. They are not used on Linux.

- [Electron display capture](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Electron window APIs](https://www.electronjs.org/docs/latest/api/browser-window)
- [Temporal continue-as-new](https://docs.temporal.io/develop/typescript/workflows/continue-as-new)

## Companion controls

Click the ghost to open the companion panel; Escape closes it. Controls stay stationary while open. Stay in place and Quiet motion preferences are saved locally; system reduced-motion preferences are respected too. Quiet motion pauses wandering, animation, and visual effects. The sharing indicator reflects the actual capture session, not model or worker health. Demo mode disables screen-sharing controls.

The sharing window shows permission/cancellation/error states, source resolution, session duration, and frames actually requested by the worker. Stopping or closing resets the session. No worker sample is inferred merely from the live preview.

## Naming compatibility

The app is now Wisp. The project folder, existing service/workflow identifiers, environment variables, and local preference keys retain their original names so existing setups keep working. `npm run wisp:test` is the preferred effects command; `ghost:test` remains an alias. The supplied files in `reference/` preserve their original attribution.
