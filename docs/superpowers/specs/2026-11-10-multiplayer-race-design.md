# Multiplayer race (live, 2–4 players, WebRTC): design

**Status:** approved in conversation 2026-11-10 (maintainer). Epic, split into four issues that are each playable.
**Later on the same base:** Fangis / cops & robbers (not part of this spec).

## Goal

Two to four friends, each on their own device, race each other live on the existing time-trial checkpoints of a region. The cars **collide**. The connection works like `game-tschau-sepp`: no server and no login, players exchange codes by chat or mail.

## Decisions (maintainer, 2026-11-10)

| Topic | Decision |
|---|---|
| Who plays | Remote friends, live, via WebRTC like Tschau-Sepp (host star, copy-paste codes) |
| First mode | **Race**. Fangis follows later on the same base |
| Car contact | **Real collisions** between cars |
| Vehicles | Free choice within a **class the host sets** (A–D or "all"; `powerClass()` in `carselect.js`) |
| Netcode | **A: each device simulates only its own car** (owner-authoritative). Car-to-car contact is resolved locally and symmetrically. The host referees checkpoints, finish and ranking |

Rejected:
- **B (host simulates all cars):** guests feel 50–150 ms of input lag on every steer.
- **C (B plus client prediction and rollback):** needs deterministic, rewindable physics, which the game does not have.

## Global constraints

- Static files only, no server runtime. No PeerJS, no Firebase, no signaling server (stack overlay). STUN: the public Google STUN servers, the same as Tschau-Sepp. No TURN: players behind a symmetric NAT cannot connect, and the error text says so.
- **Every inbound data-channel message is validated** (type, field ranges, finite numbers, sizes) before it touches game state. Nothing is ever `eval`'d. Invalid messages are dropped and counted, never thrown.
- The new modules are **pure** (no DOM, no three.js, no `RTCPeerConnection` inside the logic) and tested with `node --test`. `index.html` only wires them up.
- DE and EN strings in `strings.js`. Must work on a phone (touch controls) without HUD overlap.
- The existing single-player physics (`stepCar`, `collide`) is **not changed** except for one hook that adds the car-to-car push.

## Architecture

### `netcodec.js`: codes and messages (pure)

- **Connection code** = SDP offer or answer, gathered until ICE is `complete`, then compressed (`CompressionStream('deflate-raw')`) and base64url-encoded. It carries a prefix with version and role (`R1H.` host, `R1G.` guest). A guest pasting a guest code, or a code of another version, gets a clear error.
- **Code lifetime:** 5 minutes, shown as a countdown (the same as Tschau-Sepp).
- **Message types:**
  - **unreliable channel** (`ordered: false, maxRetransmits: 0`): `pose`.
  - **reliable channel**: `hello`, `lobby`, `pick`, `ready`, `start`, `cp`, `finish`, `result`, `bye`.
- **`pose` record:** `{ t, x, y, z, yaw, pitch, roll, vx, vz, steer, speed }`, quantised into a small binary record (≤ 40 bytes).
- **Validation:** `parseMessage(raw)` returns a typed message or `null`. Positions must lie within the region's bounds plus a margin, speeds ≤ 150 m/s, and strings ≤ 24 chars (player name).

### `netlink.js`: connection (thin wrapper, browser only)

- **Host:** keeps up to three `RTCPeerConnection`s, one per guest. Each guest pairing is offer → answer, so the host makes **one code per guest** (as in Tschau-Sepp).
- **Relay:** guests only talk to the host, and the host relays poses and events to the other guests (star). At 20 Hz × 4 players this is a few kB/s, which is fine.
- **Events up:** `onMessage(peerId, msg)`, `onPeerState(peerId, state)`. Methods: `send(peerId, msg)`, `broadcast(msg)`.

### `netsync.js`: remote cars (pure)

- Per remote player, a pose buffer keyed by sender time.
- **Clock offset** is estimated from `hello`/ping round trips, using the median of the last 5.
- **Rendering** sits **100 ms in the past**, with linear interpolation between buffered poses and extrapolation up to 250 ms when packets are missing. After 3 s without a pose, the car is hidden.
- `sampleRemote(buffer, now)` returns `{ x, y, z, yaw, pitch, roll, speed }` or `null`.
- In `index.html`, a remote car is a normal vehicle model from the existing builders with the player's paint. It has no physics of its own, only a solid entry in a separate `NET_SOLIDS` list.

### `netbump.js`: car-to-car collision (pure)

- **Shape:** each car is approximated as an oriented box (the vehicle's existing collision size, `VEH.collision`, scaled).
- **Rule:** per frame, own car against each sampled remote car.
  - On overlap, push **only the own car** out along the contact normal by the penetration depth.
  - Add an impulse: `Δv = n · max(0, −(v_own − v_remote)·n) · (1 + e) · m_remote / (m_own + m_remote)`, with `e = 0.3`. The mass comes from the vehicle's `mass` stat.
  - Both devices run the same rule with swapped roles, so both cars bounce apart, roughly momentum-conserving.
- **Cooldown:** 0.3 s per pair, so a single contact doesn't fire twice.
- **Feedback:** a hit triggers the existing impact sound and damage hooks (`impact.js`) on the own car only.

### `netrace.js`: race rules (pure, host-authoritative state machine)

- **States:** `lobby → countdown → racing → finished`.
- **Lobby:** the host sets the region and class. The list shows each player's name, car and ready flag. A car outside the class is refused (the `pick` is rejected with a reason). The host can start when all players are ready and there are ≥ 2 players.
- **Start:** the host picks a start time `T0` (now + 4 s, on the host clock). Each client converts it with its clock offset, shows the 3-2-1 lights and releases the brakes at `T0`. Grid slots: side by side behind the time trial's start, 4 m apart, in join order.
- **Checkpoints:**
  - **Detection:** each client detects its own checkpoint pass (the existing trial logic) and sends `cp {i, t}`.
  - **Acceptance:** the host accepts it if `i` is the player's next checkpoint and the host's last pose of that player lies within the checkpoint's radius plus 15 m. This is a sanity check, not anti-cheat.
  - **Broadcast:** the host sends the updated standings.
- **Finish:** `finish` follows the same check. When all players have finished, or 60 s after the first finisher, the host sends `result` with the ranking, times and gaps. A player who has not finished is marked DNF.
- **HUD:** position (`1/3`), the gap to the car ahead or behind, and the existing checkpoint arrow.
- **After the race:** rematch (same lobby, same cars) or back to the lobby.

## Player flow

1. **Start screen:** a new button **"Mit Freunden fahren" / "Race friends"**.
2. **Choose a role:**
   - **Erstellen (host):** enter a name, then **"Code für nächsten Spieler"**. A textarea shows the code with a copy button and a countdown, plus a field "Antwort-Code einfügen".
   - **Beitreten (guest):** enter a name, paste the host code, then **"Antwort-Code erstellen"**. The guest copies it and sends it back, and the screen shows "Warte auf Verbindung…".
3. **Lobby:**
   - Everyone sees the player list.
   - The host picks the region and class.
   - Everyone picks a car through the existing car picker, filtered to the class, and presses "Bereit".
4. **Race:** countdown, race, ranking.
5. **Leaving:** Esc / pause → "Rennen verlassen" sends `bye`.

## Failure handling

- **A guest drops** (`disconnected` or `failed`, or 3 s without a pose): their car disappears and they become DNF. The race continues.
- **The host drops:** every guest gets "Verbindung zum Host verloren" and goes back to the start screen. There is no host migration in v1.
- **Tab hidden** (`visibilitychange`): the own car brakes to a stop and keeps sending poses at 2 Hz, and the connection stays open.
- **ICE fails** (no connection within 20 s after the answer is pasted): show an error text that mentions networks that block direct connections (company or school Wi-Fi, some mobile carriers).
- **Malformed messages** are dropped and counted. The counter shows on the F3 debug panel.

## Testing

- **Unit tests** (`node --test`), one test file per module:
  - **`netcodec`:** round-trip, wrong prefix or version, garbage, oversize, NaN or out-of-range fields.
  - **`netsync`:** interpolation, extrapolation cap, hide after 3 s, clock offset median.
  - **`netbump`:** no contact means no change; a head-on hit gives symmetric results with swapped roles; a heavier car is pushed less; cooldown.
  - **`netrace`:** lobby rules (class filter, start needs ≥ 2 and all ready), checkpoint order and sanity check, finish and DNF timeout, ranking ties.
- **Browser test:** two pages in **one** Playwright browser, connected over loopback ICE, with no internet and no STUN needed on the same host. The test checks:
  - host and guest reach the lobby;
  - both see the other car move;
  - a forced overlap pushes both cars apart;
  - a scripted race ends with a result on both pages.
- The test is targeted only (one file), per the repo's test rules.

## Issue split (each one playable on its own)

1. **Connection and lobby:** `netcodec`, `netlink`, the start-screen flow, the lobby with names, class and car picks. Done when two players see each other in the lobby.
2. **See each other drive:** `netsync`, remote car models, the pose stream, cruise together (no rules yet).
3. **Collisions:** `netbump`, the hook in the own car's step, sound and damage feedback.
4. **Race rules:** `netrace`, the countdown, host-checked checkpoints, HUD position and gap, result, rematch.

## Out of scope (v1)

- Fangis and other modes
- chat
- more than 4 players
- host migration
- TURN relay
- splitscreen
- spectators
- persistent online leaderboards
- anti-cheat beyond the checkpoint sanity check
