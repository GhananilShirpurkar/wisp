# Contributing to Wisp

Wisp is a development preview. Small, focused fixes and reports from real Linux desktops are especially useful.

## Local checks

1. Use Node 22 or 24, then run `npm ci`.
2. Run `npm test` and `npm run check:workflow`.
3. For UI changes, run `npm run test:ui` in a graphical session. This uses a generated video stream, never your screen.
4. Run `npm run format` before opening a pull request.
5. Explain the observable behavior change, test coverage, and any platform limitations. Include screenshots for visual changes.

## Boundaries to preserve

- Never enable screen capture, autostart services, or model downloads without an explicit user action.
- Keep images out of Temporal history and logs. Treat screen text and model output as untrusted data.
- Do not render model output as HTML or expose generic IPC, filesystem, or shell access to renderers.
- Keep workflow modules deterministic; put OS and network access in activities.
- Preserve pending asks, observation pruning, and cooldown state across workflow rollover.
- Keep `reference/` intact as historical input. It is not the implementation or an authoritative specification.

## Reporting bugs

Include your distribution, desktop environment, X11/Wayland session, Node version, and steps to reproduce. Redact tokens, screen content, personal window titles, and `.env` values. Follow [SECURITY.md](SECURITY.md) for vulnerabilities.

Be respectful, assume good intent, and keep feedback focused on the work. Contributions are provided under the repository's MIT license; retain attribution for third-party code.
