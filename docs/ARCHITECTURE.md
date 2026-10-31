# Architecture

## Runtime components

| Component     | Entry point                                   | Responsibility                                                         |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| Overlay       | `ui/main.cjs`                                 | Transparent companion, hit testing, tray, validated local commands     |
| Capture       | `ui/capture.cjs` and `ui/capture-renderer.js` | User-approved display stream, frame scaling, authenticated HTTP bridge |
| Worker        | `src/worker.ts`                               | Registers activities and polls the Temporal task queue                 |
| Workflow      | `src/workflows.ts`                            | Cadence, retries, asks, state, cooldowns, continue-as-new              |
| Activities    | `src/activities.ts`                           | Local vision inference, advice, OS adapters, overlay delivery          |
| Linux adapter | `src/linux.ts`                                | X11 metadata and capture bridge client                                 |
| Telemetry     | `src/telemetry.ts`                            | Reconstructed metric-only telemetry events                             |

## Observation lifecycle

1. Read window metadata. Wayland uses a generic label because native application titles are unavailable through a universal interface.
2. Sample vision when the window key changes, 45 seconds elapse, or an ask is pending.
3. Fetch a JPEG from the active sharing session, at most 1280 pixels on its longest edge. Capture and inference stay in one activity so bytes do not enter workflow history.
4. Validate the local model's structured response before adding an observation.
5. Prune current observations to 30 minutes. Evaluate a repeated error, the local hour, or an explicit user question.
6. Deliver a message if allowed by the workflow cooldown; the UI applies its own cooldown.
7. Continue-as-new after an hour or when Temporal recommends it, carrying pending asks and current state.

Activity work adds to the nominal five-second tick interval. Retries are bounded within each activity, while the surrounding workflow continues after failures. Forced messages can repeat after a retry because delivery is at least once.

## Security and retention

The loopback capture bridge and overlay command bridge are separate. The former requires a local token; the latter accepts local message/effect commands without authentication. Neither is a same-user sandbox. See [SECURITY.md](../SECURITY.md).

Current-state pruning is not deletion of historical Temporal events. Operators control database retention and removal. Screenshots are ephemeral on Linux, while the retained macOS adapter uses temporary files with best-effort cleanup.

## Compatibility identifiers

The app is branded Wisp, but `paperclip-glance`, the `PAPERCLIP_*` environment variables, legacy service names, and preference keys remain stable. This avoids disconnecting existing installations. Changing them requires an explicit migration.
