# One room code for everyone via a signaling relay (#1198) — design

## Goal

The host gets one short room code (`RHY-4827`), every guest types it and is connected.
A small WebSocket relay (own repo, VPS-DE) forwards the existing offer/answer codes
between host and each guest. Game traffic stays peer-to-peer. The manual code exchange
stays visible as "Ohne Server verbinden".

This issue covers the **browser side only**: `relayclient.js`, the wiring into the
connect dialog, the wire contract, ADR + agent note, strings, changelog. The relay
service is a separate issue in its own repo.

Already on main with this spec: `docs/relay-protocol.md` (wire contract v1),
`docs/adr/0001-own-signaling-relay.md`, `AGENT-NOTES.md`.

## Design

### `relayclient.js` (new, pure, game-agnostic)

No DOM, no game imports; the WebSocket class is injected, so `node --test` drives it
with a fake.

```js
export const RELAY_VERSION = 1, DATA_MAX = 16000, FRAME_MAX = 20000, OPEN_MS = 5000;
export function normalizeRoom(text, prefix)   // 'rhy 4827' | 'RHY4827' | '4827' -> 'RHY-4827'; else null
export function parseFrame(raw)               // a fresh relay→client frame object, or null
export function openRelay({ url, game, prefix, WebSocketImpl = globalThis.WebSocket, onEvent })
  // -> { create(max), join(room), signal(to, data), close() }
```

- `parseFrame` accepts only the relay→client frames of the contract, with checked field
  types (`room` matches the code regex, `peer`/`from` are integers ≥ 0, `data` a string
  of 1..DATA_MAX, `code` one of the five error codes). Anything else, a non-string or a
  string over FRAME_MAX → `null`. Never throws.
- `openRelay` opens the socket at once; `create`/`join`/`signal` queue until it is open.
  Events go to `onEvent(ev)`: every parsed frame as-is, plus two client-side ones:
  `{ t: 'unreachable' }` — no `open` within OPEN_MS, or `error`/`close` before `open`;
  `{ t: 'lost' }` — the socket closed after `open` without `close()` having been called.
  Each fires at most once; after either, or after `close()`, no further events.
  Refused frames are counted (`bad` on the returned object) and dropped.
- `signal` refuses `data` that is not a string of 1..DATA_MAX (no send).

### Game glue (`index.html`)

One constant next to `NET`: `const RELAY_URL = 'wss://relay.freaxnx01.ch/'`. Empty
string = relay off: the dialog behaves exactly as today. New `NET` fields: `relay`
(the openRelay object or null), `room` (the code once created/typed),
`relayPeers` (host: relay peer id → netlink slot).

**Host** — "Rennen erstellen" (`netHostStart`) opens the relay and sends `create(3)`
instead of making a manual code. `created` → the room box shows the code big, with a
Copy button. `guest(peer)` → `hostOffer()`; `null` → `signal(peer, 'full')`; else
`encodeCode('H', …)` and `signal(peer, code)`, remembering peer → slot.
`signal(from, data)` → `decodeCode(data, 'G', now)`; ok → `hostAccept(slot, sdp)`;
not ok → counted in `NET.bad`, nothing else. `left(peer)` → forget the mapping (netlink's
own deadlines free the slot). `unreachable`/`lost`/`expired`/`error` → room box hidden,
`netTrouble(tr('mpRelayDown'))`. The lobby shows "Raumcode RHY-4827" under the
subtitle while the host's room is open. The relay is closed in `netLeave`.

**Guest** — "Rennen beitreten" shows the room box: a field, "Beitreten". On click:
`normalizeRoom(value, 'RHY')`; null → `mpRoomBad`. Else `join(room)`, status
`mpRoomWaiting`. `signal(0, 'full')` → `mpFull`. `signal(0, data)` →
`decodeCode(data, 'H', now)`; not ok → `MP_ERR` text; other region → the existing
region question, parking the **room code** (not the offer) so the reloaded page
reopens the room box filled in; else `guestAnswer(sdp)` → `encodeCode('G')` →
`signal(0, code)`, status `mpWaiting`. On the guest's `open` peer state the relay is
closed. `error no-room`/`expired` → `mpRoomUnknown`; `error full` → `mpFull`;
`closed` → `mpRoomClosed`; `unreachable`/`lost` (before `open`) → `mpRelayDown`.

**Fallback** — a `#mpmanual` button "Ohne Server verbinden" sits right under the room
box for both roles, always visible while the relay is on. Host: runs today's
`netHostCode()`. Guest: closes the relay and runs today's `netGuestRole()`. Nothing
switches automatically. A `#join=` link and a parked manual code keep using the manual
guest screen as today.

### Strings (en/de, `strings.js`)

`mpSub` changes (no longer "no server"); new: `mpRoomLabel`, `mpRoomField`,
`mpRoomJoin`, `mpRoomHostHint`, `mpRoomGuestHint`, `mpManual`, `mpRelayConnecting`,
`mpRelayDown`, `mpRoomBad`, `mpRoomWaiting`, `mpRoomUnknown`, `mpRoomClosed`,
`mpRoomInLobby(code)`. German: "Ohne Server verbinden", "Vermittler nicht erreichbar".

## Acceptance criteria

- `relayclient.js` exists, imports nothing, and passes `tests/relayclient.test.mjs`
  (normalize, parse, queueing, routing, unreachable/lost, refused frames).
- Host: "Rennen erstellen" shows a room code `RHY-NNNN`; guests who type it reach the
  lobby without any manual code (Playwright with a fake relay via `route_web_socket`).
- Relay unreachable: "Matchmaker unreachable"/"Vermittler nicht erreichbar" shows, the
  "Ohne Server verbinden" button sits below it and the manual flow still connects;
  nothing switches automatically.
- Every relayed payload goes through `decodeCode`; a garbage `data` never reaches
  `hostAccept`/`guestAnswer`.
- No test depends on a live relay; existing multiplayer Playwright tests pass with the
  relay stubbed out.
- `RELAY_URL` is one constant; `''` restores today's dialog.
- de/en strings, German CHANGELOG entry.

## Assumptions

- **A1** [confirmed] Service code lives in its own repo. Answer: "Eigenes Repo": a
  separate repo (e.g. freaxnx01/<relay-name>) with Dockerfile + compose for VPS-DE;
  #1198 covers only the browser side.
- **A2** [confirmed] Runtime "Node + ws": Node with the `ws` package, ~150 lines.
- **A3** [confirmed] Unreachable: "Hinweis + Code-Weg": a short message "Vermittler
  nicht erreichbar" with the "Ohne Server verbinden" button right below; nothing
  switches automatically, the player chooses.
- **A4** [confirmed] (issue body) Manual exchange always visible; service
  game-agnostic with per-game namespaces; client module copyable like `i18n.js`;
  central docs in `ai-instructions` are a later follow-up.
- **A5** [med] The service URL is `wss://relay.freaxnx01.ch/`. Rejected: a path-based
  version (`/v1`) — the version travels in the `create`/`join` frames instead. The
  hostname is not deployed yet; the service issue may pick another name, then only
  the constant changes.
- **A6** [high] The relay forwards exactly today's `R<v>H.`/`R<v>G.` code strings.
  Rejected: raw SDP. `netcodec.js:136-176` (`encodeCode`, `decodeCode`) already validates role, version, size and
  the 10-minute TTL, and the host code carries the region (`g`), so the relay path
  reuses all of it and the relay stays untrusted.
- **A7** [med] Room code `PPP-NNNN` (3-letter game prefix + 4 digits), chosen by the
  relay, 60-minute room lifetime while the host socket is open. Rejected: longer or
  word codes — 4 digits are easy to say aloud; guessing is bounded by relay rate limits.
- **A8** [high] The host keeps one room for the whole session and shows its code in the
  lobby; no countdown. Rejected: a new room per guest — that is the problem #1198
  removes.
- **A9** [med] Host with no free slot answers the literal `full`. Rejected: leaving the
  guest waiting — `netlink.js:87` already returns `null` when the star is full.
- **A10** [med] The region switch parks the room code, not the offer
  (`index.html:7052`, `7652`, `7672-7673`): after the reload the guest rejoins the
  room and gets a fresh offer. Rejected: parking the offer — its answer would have no
  way back to the host.
- **A11** [high] Tests stub the relay with Playwright `route_web_socket` (CI pins
  Playwright 1.63, `.github/workflows/tests.yml:28`; added in 1.48) and a fake
  WebSocket class in node. Rejected: a Node `ws` fake server — the repo has no
  `package.json` and the stack forbids adding one.
- **A12** [high] `#join=` links and the parked manual code keep the manual guest screen
  (`index.html:7672-7686`). An `#room=` invite link is a follow-up.

## Consequences

- Until the relay is deployed, "Rennen erstellen"/"Rennen beitreten" first show
  "Vermittler nicht erreichbar" and players need one extra click on "Ohne Server
  verbinden". Dispatch after the service is live, or ship with `RELAY_URL = ''`.
- The existing lobby test helper (`tests/test_multiplayer_lobby.py` `connect`, used by
  nine test files) and `tests/test_join_handoff.py` must click `#mpmanual` after the
  role buttons: the manual codes no longer appear on their own.
- Players' IPs reach our relay (Traefik on VPS-DE) — not a third party, but now a
  server sees who connects. The relay logs no frame contents.
- #1193 (same-LAN ICE failure) is unaffected: the relay fixes the code exchange, not
  the ICE path.
