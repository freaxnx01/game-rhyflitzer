# Lobby handshake: the guest repeats its hello until the lobby arrives (#1019)

## Problem

`tests/test_multiplayer_lobby.py::connect` times out now and then on CI (`#mplobby` never opens on the guest).
Diagnosis on the CI GPU runner (draft PR#1051, 32 instrumented connects, 1 failure, 2026-11-17):

- the WebRTC transport is up on both pages (`connectionState: connected`), both data channels `ev` and `pose` are open;
- the host's lobby holds only the host ("Anna"); `NET.bad` is 0 on both pages, no `deny` was sent;
- so the guest's one-time `hello` (sent from `netPeerState(…, 'open')`) never reached `netHostHello`.

The exact point where it was lost was not caught again (0 of 26 further instrumented runs). The protocol has a single
point of failure, though: the guest sends `hello` exactly once and there is no second attempt, so one lost or
skipped message strands the guest forever. `NET.link.send` also skips silently while a channel is not `open`.

## Design

1. **Guest:** on `open` it sends `hello` as today and then repeats it every `HELLO_MS = 1000` ms until the first
   `lobby` or `deny` arrives (`NET.helloTimer`). `netLeave` clears the timer.
2. **Host:** a repeated `hello` from a peer that is already in `NET.slots` re-sends that peer its `lobby`
   (`lobbyMessage(NET.lobby, id)`) instead of being ignored. Nothing else changes: no second lobby entry, no rename.

No protocol change (`hello` and `lobby` exist and are validated already), no timeout raised.

## Testing

A Playwright test drops the guest's **first** `hello` (an init script wraps `RTCDataChannel.prototype.send` on the
guest page and swallows the first string that starts with `{"type":"hello"`). The lobby must still open on both pages
with "Anna" and "Ben" exactly once.
