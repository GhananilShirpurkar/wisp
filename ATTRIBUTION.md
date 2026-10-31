# Attribution and relationship to Paperclip

## Original project

- **Project:** [Bennykillua/paperclip-ghost](https://github.com/Bennykillua/paperclip-ghost)
- **Author:** Benny (Bennykillua)
- **License:** MIT; the original copyright notice is retained in [LICENSE](LICENSE).
- **Upstream revision inspected for publication:** `de01bfbf7cea59ddec1e98e17d2dd760bb77d4d8` on `master`.

Wisp began with user-supplied reverse-engineering notes and a TypeScript reimplementation describing Paperclip's architecture. The durable observation loop, local vision concept, ghost behavior, and supervision approach are credited to the original project. Wisp is not affiliated with or endorsed by the original author.

## What differs

| Area             | Original project's published scope             | Wisp implementation                                                        |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Primary platform | macOS                                          | Linux with X11/XWayland                                                    |
| Capture          | macOS screen-capture tooling                   | Explicit display share via Electron and the Linux portal; in-memory frames |
| Supervision      | launchd LaunchAgents                           | Optional systemd user services; legacy launchd script retained             |
| Setup            | Homebrew-assisted setup and model selection    | Manual documented prerequisites; diagnostic command                        |
| Window metadata  | macOS application/window information           | X11 xprop; generic metadata and timed sampling on Wayland                  |
| UI               | Original ghost overlay                         | Redesigned companion controls and sharing window                           |
| Effects          | Broader original effect/test commands          | Five supported effects: splatter, lightning, shiver, candle, ink           |
| Capture bridge   | Not part of the supplied original architecture | Token-authenticated loopback HTTP bridge, separate from message TCP        |
| Validation       | Not assessed here                              | Unit/loopback tests, synthetic Electron tests, workflow bundling, CI       |

## Historical input

`reference/architecture.md` and `reference/paperclip_cleanroom.ts` preserve the supplied inputs. Their claims (including “zero leak,” platform support, measured timings, and external Canvas artifacts) are historical, unverified descriptions, not guarantees made by Wisp. The runnable code is in `src/`, `ui/`, and `scripts/`; the current README and validation document describe its supported behavior and limitations.

Documentation was written for the actual Wisp implementation rather than copied wholesale from the upstream README. Third-party npm dependencies retain their own licenses.
