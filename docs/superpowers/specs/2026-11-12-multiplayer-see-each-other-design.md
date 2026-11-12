# Multiplayer part 2: see each other drive (pose stream, remote cars, cruise together), design

**Status:** quick-mode enrichment of #835, 2026-11-12; assumptions are in the #835 issue body. Epic spec: `2026-11-10-multiplayer-race-design.md` (section *netsync*). Builds on #834 (PR#848).
**Split:** #835 is delivered in three sub-issues, each with its own plan of at most 10k characters:

- **part a, pose protocol:** `netcodec.js` pose record + `ping`/`pong`/`start`, the pure `netsync.js`, binary on netlink's `pose` channel. Plan: `docs/superpowers/plans/2026-11-12-multiplayer-pose-protocol.md`.
- **part b, drive together:** the start button, the session, the stream and relay, the remote cars, the browser test. Playable: both players see each other drive. Plan: `docs/superpowers/plans/2026-11-12-multiplayer-drive-together.md`.
- **part c, polish:** name tags, remote lamps, the fade-out and toast on disconnect, the F3 counters. Plan: `docs/superpowers/plans/2026-11-12-multiplayer-remote-car-polish.md`.

## What #834 left us (facts)

- `netlink.js` already opens **two** channels per guest: `ev` (reliable, JSON) and `pose` (`ordered: false, maxRetransmits: 0`). Only string data is forwarded (`attachChannel`, `netlink.js:62-65`); the `pose` channel is unused.
- Host star: guests have one peer (`HOST_ID = 0`), the host keeps peers 1..3 and maps peer id → lobby player id in `NET.slots` (`index.html:6025`).
- `parseMessage(raw, ctx)` validates every reliable message; a refusal increments `NET.bad` (`index.html:6141-6145`).
- The lobby ends at "Everyone ready" with no start button (`index.html:6249`, A4 of #834).
- A guest's `lobby` message always calls `openLobby()` (`index.html:6189`), which would pop the lobby dialog over a running drive.
- Parked vehicle meshes are built by `buildDepotSlot` (`index.html:6324-6339`): `withStageVehicle(id, paint, …)`, `clone(true)`, drop flames and blinkers, clone the materials; glTF files load lazily with `loadVehicleModel(id)` / `gltfState(id)`, and freed with `disposeParked`.
- The driven car's visible pose is `car.position` + `car.rotation` (Euler x = roll/tip, y = −heading, z = slope pitch; `index.html:5546-5547`). It is also right on foot (`parkCarAt`) and in other modes.
- `startRace('cruise')` spawns at `startPose('cruise')` = `START` via `P.safe` + `resetCar()` (`index.html:5663-5664`).

## Design

### Session start

- The host's lobby gets a **"Drive together" / "Gemeinsam losfahren"** button (`#mpgo`), enabled only when `canStart(lobby)` holds (≥ 2 players, all ready). Guests do not see it.
- Click: the host broadcasts `{ type: 'start', mode: 'cruise' }` on `ev` and starts locally. A guest that receives `start` starts the same way.
- Starting = `startRace('cruise')`, then `P.safe = gridPose(START, slot)` and `resetCar()`. `slot` is the player's lobby id.
- `gridPose` is pure (`netsync.js`): slot 0 on `START`, each further slot 8 m further back along the heading and alternately 1.5 m left or right. A column stays on the road where a side-by-side row of four would not. #837 replaces it with its race grid.
- During the session (`NET.session = true`), `lobby` messages update `NET.lobby` and the remote cars but never reopen the lobby dialog. *Invite* is hidden: no late joiners in v1.
- Leaving: the existing *Main menu* / *Abandon run* path (`toMainMenu`) calls `netLeave()` while `NET.role` is set, which sends `bye`. The other side's existing drop handling removes the car.
- A vehicle change during the session (depot, pause *Change vehicle*) re-sends `pick`. The host's existing handler validates it, updates the lobby and broadcasts it, and the remote model is rebuilt.

### Clock

- Reliable messages `ping { a }` (guest → host, `a` = guest `performance.now()` ms) and `pong { a, b }` (host → guest, `b` = host ms).
- Offset sample = `b − (a + c) / 2`, with `c` = receive time. The offset is the **median of the last 5** samples. A ping goes out right at session start, then every 2 s.
- **All pose times are host-clock ms:** `hostNow = performance.now() + offset` (the host's offset is 0). Then a guest can render a pose another guest sent through the relay without a second clock pair.
- A guest sends no pose before its first pong.

### Pose record (binary, 36 bytes, little-endian)

| Byte | Field | Type | Unit / note |
|---|---|---|---|
| 0 | kind | u8 | `1` = pose (other kinds are refused; room for #836/#837) |
| 1 | id | u8 | sender's lobby player id 0..3 (the host **overwrites** it for guest-sent poses) |
| 2 | seq | u16 | +1 per pose, wraps |
| 4 | t | u32 | host-clock ms, mod 2³² |
| 8 | x, y, z | 3 × f32 | m |
| 20 | rx, ry, rz | 3 × i16 | rad × 10 000 (`car.rotation`) |
| 26 | vx, vz | 2 × i16 | cm/s |
| 30 | steer | i16 | front-wheel yaw, rad × 10 000 |
| 32 | flags | u8 | bit 0 visible, 1 head, 2 brake, 3 left, 4 right, 5 nitro, 6–7 must be 0 |
| 33 | reserved | 3 × u8 | 0, for #836 (e.g. a contact counter) |

- `encodePose(pose) → ArrayBuffer` and `parsePose(buf) → pose | null` live in `netcodec.js`.
- **Refused:** anything that is not an `ArrayBuffer` of exactly 36 bytes; a wrong kind; id > 3; a non-finite float; |x|, |z| > 50 000 m; y outside −1 000..10 000; |v| > 150 m/s; a set flag bit 6 or 7.
- The 36 bytes leave #836 its velocities and mass (mass comes from the lobby car's def) and #837 its positions for the checkpoint sanity check, so neither needs a format change.

### Stream

- `netlink.js` gets `sendPose(peerId, buf)`, `binaryType = 'arraybuffer'`, and an `onPose(peerId, buf)` callback for binary data on `pose`.
- **Rate:** a `setInterval` of 50 ms (20 Hz) for the session, outside the rAF loop. A paused game keeps sending, so the car stays visible; a hidden tab's throttled timer still sends ≥ 1 Hz.
- **Host relay:**
  1. `parsePose`.
  2. `id ← NET.slots.get(peerId)`; drop the pose if there is no slot.
  3. Feed the host's own track.
  4. Re-encode and `sendPose` to every **other** guest.
- **Guest:** accept poses whose id is in the lobby and is not its own.
- **Refused poses:** each one counts in `NET.bad` and is never thrown.

### Remote cars (`netsync.js`, pure)

- `createTrack()` holds up to 20 poses sorted by `t`. `pushPose` drops duplicates and anything older than 1 s behind the newest.
- `sampleRemote(track, now)` renders at `now − 100` ms:
  - **interpolate** linearly between the two bracketing poses, with angles along the shortest path;
  - **extrapolate** with `vx`/`vz` up to 250 ms past the newest pose, then hold;
  - **snap:** two bracketing poses more than 25 m apart (a reset, a jump) give the later pose, never a slide through the map;
  - **hide:** return `null` once `now − newest.t > 3000` ms.
- In `index.html`, `NETCARS: Map<playerId, { id, paint, mesh, track }>`:
  - The model is built like a depot slot: `withStageVehicle`, clone, no flames or blinkers, cloned materials.
  - It is built once the glTF is ready. `loadVehicleModel` is requested lazily, one at a time. A failed load builds `def.gltf.fallback`.
  - Each frame, `stepNetCars()` places `mesh.position`/`rotation` from `sampleRemote`. Its wheel steer is not animated (the `steer` field is carried for later).
  - The cars are visual only: no solid and no physics (collisions are #836).
  - A player who leaves the lobby loses the mesh (`disposeParked`).

### Budget (4 players)

- **Bandwidth:** 36 B + ~60 B of SCTP/DTLS/UDP overhead, at 20 Hz, gives about 2 kB/s per stream.
  - The host uploads 3 guests × 3 poses, about 17 kB/s.
  - A guest uploads 2 kB/s and downloads 6 kB/s.
- **CPU:** 3 cloned models, which is less than the depot's real-model budget, plus three `sampleRemote` calls per frame (O(20)).

### Part c polish (separate plan)

- **Name tags:** a sprite with the lobby name drawn on a canvas, so no HTML. It floats above the roof, is always readable (`depthTest: false`) and shrinks with distance.
- **Remote lamps:**
  - head and brake: the emissive intensity of the cloned lamp materials, from the flags;
  - blinkers: the flags blink at the local 350 ms phase.
- **Disconnect:** the car fades out over 1 s (pure `fadeAlpha`) instead of vanishing, with a toast "Ben left" / "Ben ist weg". A car hidden by 3 s of silence reappears on the next pose.
- **F3:** a debug line `net: bad N · peers N · offset N ms`.

## Testing

- **node:**
  - `tests/netcodec.test.mjs`: pose round trip and every refusal; `ping`, `pong` and `start` validation.
  - `tests/netsync.test.mjs`: the clock median; interpolation; the 250 ms extrapolation cap; snap; hide after 3 s; `gridPose`.
- **Browser:** `tests/test_multiplayer_cruise.py`, two pages, `?netice=none` (reuse `connect` from `test_multiplayer_lobby.py`):
  - both pick a car, get ready, and the host clicks `#mpgo`;
  - each drives forward for 2 s;
  - each page's remote car of the other player is visible, has moved more than 5 m, and is within 15 m of the other page's own `carPose`.
- Part c adds a guest leave: the host sees the toast and the car gone, and the tag is present while connected.

## Out of scope

- collisions (#836)
- race rules, countdown and race grid (#837)
- late join
- host migration
- spectators
