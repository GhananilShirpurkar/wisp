# Validation status

Wisp's repository tooling is designed for repeatable checks. It is not evidence that every desktop or real inference path works.

## Automated coverage

- TypeScript compilation and Temporal workflow bundling.
- Adaptive sampling, memory pruning, stale/resolved error detection, and decision boundaries.
- Strict model-output and settings validation.
- Telemetry field filtering, including nested content.
- Real loopback TCP framing, cooldown enforcement, and forced-message handling.
- X11 metadata parsing, systemd quoting, and authenticated HTTP capture requests.
- Native Electron controls, isolated preload, text-only messages, reduced motion, keyboard dismissal, and narrow layouts.
- Synthetic video sampling, resizing, cancellation, failure recovery, and stop revocation.

## Manual checks still required

- A real GNOME/KDE portal chooser and consent revocation on the target desktop.
- Full capture → Ollama vision → Temporal workflow → overlay response.
- Systemd login/start/stop behavior and restart recovery.
- Workflow rollover against a real Temporal service over long-running sessions.
- Multi-monitor, display scaling, compositor changes, and accessibility review with assistive tools.
- Legacy macOS adapters.

Do not infer these checks passed from a green CI badge. Update this document with the exact environment and evidence when validating them.
