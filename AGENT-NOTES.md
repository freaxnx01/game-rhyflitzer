# Agent notes

Project-specific context that does not belong in the regenerated `CLAUDE.md`.

## Multiplayer uses an own signaling relay (exception to the stack rule)

The browser-game stack overlay says "no signaling server". **This repo is the
exception**: multiplayer room codes (`RHY-4827`) go through our own small WebSocket
relay on VPS-DE, see [`docs/adr/0001-own-signaling-relay.md`](docs/adr/0001-own-signaling-relay.md)
and the wire contract [`docs/relay-protocol.md`](docs/relay-protocol.md) (#1198).

- Do not remove the relay or `relayclient.js` to "fix" the stack rule.
- Do not replace it with PeerJS, Firebase or any third-party signaling.
- Keep the manual code exchange ("Ohne Server verbinden") visible and working.
- Treat everything the relay delivers as untrusted: it goes through `decodeCode`.
- The relay's code lives in its own repo, not here.
