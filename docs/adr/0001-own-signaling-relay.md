# ADR 0001: An own signaling relay for multiplayer room codes

- Status: Accepted (maintainer, 2026-11-24/25, #1198)
- Deviates from: browser-game stack overlay, "P2P Multiplayer (house pattern)" —
  "no signaling server"

## Context

Multiplayer (#834) connects players by a manual WebRTC handshake: the host makes an
offer code per guest, every guest sends an answer code back. Players do not understand
why the first code is not the key for everyone. Without a mailbox for the answer, each
connection needs its own two-way exchange by hand.

## Decision

Rhyflitzer uses an **own small WebSocket relay** on VPS-DE (`relay.freaxnx01.ch`). The
host gets one short room code (`RHY-4827`), every guest types it, and the relay forwards
the existing offer/answer codes between them. Game traffic stays peer-to-peer.

- The relay is game-agnostic (rooms namespaced per game), lives in its **own repo**
  (Node + `ws`, Dockerfile + compose), and implements `docs/relay-protocol.md`.
- The browser side is `relayclient.js`: no game knowledge, copyable into other
  `game-*` repos like `i18n.js`.
- The relay is **untrusted**: every relayed payload goes through `netcodec.js`
  `decodeCode`, exactly like a pasted code.
- The manual code exchange stays, **always visible** as "Ohne Server verbinden", not
  only when the relay is down. When the relay is unreachable the game says so
  ("Vermittler nicht erreichbar") and leaves the choice to the player; nothing switches
  automatically.

Rejected: (A) staying serverless and only making the answer travel back by link/QR —
still two steps per guest; (B) public third-party relays (Nostr/MQTT, Trystero style) —
unreliable and they see the players' IPs.

## Consequences

- Agents must **not** remove the relay to "restore" the stack rule; this ADR is the
  exception. `AGENT-NOTES.md` points here.
- No PeerJS, no Firebase, no third-party signaling — the exception covers only this
  own relay.
- The relay is a running service with its own uptime; the manual path is the fallback
  that keeps old builds and offline play working.
- Once proven, the pattern moves into the `ai-instructions` browser-game overlay
  (follow-up, not this ADR).
