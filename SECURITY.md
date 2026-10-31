# Security

Wisp is a development preview, not a hardened security boundary. Only the current `main` branch receives fixes; no long-term-support releases are offered yet.

## Report a vulnerability

Use GitHub's **Security → Report a vulnerability** on this repository when available. Do not include secrets, screenshots, or exploit details in a public issue. If private reporting is unavailable, open a minimal issue requesting a private contact method without disclosing the vulnerability.

## Data and trust boundaries

- Capture requires explicit screen sharing. Linux images stay in memory; model processing is local loopback HTTP.
- Temporal stores observations, user questions, and window titles. Its local database is sensitive and should not be uploaded or committed.
- The capture HTTP endpoint is `127.0.0.1:47832`, authenticated with a random token in `.runtime/capture-token`. Processes running as the same user can read that token.
- The overlay TCP endpoint is `127.0.0.1:47831` and is deliberately unauthenticated. Any local process can inject messages/effects and bypass the message cooldown with `force`. It cannot request screenshots through that endpoint.
- Do not expose either endpoint or the Temporal development server to other machines.
- Electron renderers disable Node integration, enable context isolation and sandboxing, restrict navigation, and use a local content security policy.
- Optional Sentry integration exports reconstructed metric events. Future instrumentation needs its own privacy review; the current filter is not a universal guarantee.

Closing or stopping sharing prevents new frames, but inference on an already-requested frame may finish. Supervised services may restart the UI; renewed capture still requires a new sharing session.
