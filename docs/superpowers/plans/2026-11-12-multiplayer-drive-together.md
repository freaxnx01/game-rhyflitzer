# Multiplayer drive together Plan (#835 part b)

> Spec: `docs/superpowers/specs/2026-11-12-multiplayer-see-each-other-design.md` (sections *Session start*, *Stream*, *Remote cars*). **Needs part a merged** (`netcodec.js`: `encodePose`, `parsePose`, `POSE_BYTES`, `ping`/`pong`/`start` validators; `netsync.js`: `FLAG`, `addClockSample`, `clockOffset`, `createTrack`, `pushPose`, `sampleRemote`, `gridPose`; `netlink.js`: `onPose`, `sendPose`). No name tags/lamps/fade (part c), no collisions (#836), no race rules (#837).

**Goal:** in the lobby the host starts "Drive together"; everyone spawns in a column at the start in cruise mode and sees the other cars move smoothly (20 Hz poses, host relays, 100 ms interpolation).

Constraints: buildless, no packages. Every inbound message through `parseMessage`/`parsePose`; a refusal counts in `NET.bad`, never throws. DE + EN strings. No key binding needed (button only). Run only `node --test tests/net*.test.mjs tests/strings.test.mjs tests/toast.test.mjs` and `pytest tests/test_multiplayer_cruise.py tests/test_multiplayer_lobby.py` (foreground).

## Task 1: the session in `index.html` + strings
Files: `index.html`, `strings.js`.
- **Strings (EN + DE):**
  - `mpGo`: 'Drive together' / 'Gemeinsam losfahren'
  - `mpGoHint`: 'Starts when everyone is ready' / 'Startet, wenn alle bereit sind'
- **Markup:** a `<button id="mpgo" class="btn" type="button" data-i18n="mpGo">` in `#mplobby` next to `#mpready`.
  - `renderLobby`: `$('mpgo').hidden = !host || NET.session`, `disabled = !canStart(lobby)`.
  - `$('mpinvite').hidden` also when `NET.session`.
- **`NET` additions:**
  - `session: false`, `seq: 0`, `clock: null` (samples), `offset: 0`, `poseTimer: null`, `pingTimer: null`.
  - Rename the existing countdown's `clock` field to `codeClock` (`stopCodeClock`/`startCodeClock`) to avoid the clash.
- **Messages:**
  - **`netHostMessage`:**
    - `ping` → `NET.link.send(peerId, { type: 'pong', a: msg.a, b: performance.now() })`;
    - in a session, `pick` stays as it is (it re-broadcasts the lobby).
  - **`netGuestMessage`:**
    - `start` → `netStartSession()`;
    - `pong` → `NET.clock = addClockSample(NET.clock, msg.a, msg.b, performance.now()); NET.offset = clockOffset(NET.clock)`;
    - `lobby` → in a session, update `NET.lobby`/`NET.you` and `syncNetCars()` only, with no `openLobby()`.
- **`hostNow()`:** `performance.now() + (NET.role === 'H' ? 0 : NET.offset ?? 0)`.
- **`$('mpgo').onclick`:** host only, if `canStart`: `NET.link.broadcast({ type: 'start', mode: 'cruise' }); netStartSession();`.
- **`netStartSession()`:**
  1. `NET.session = true`; hide `#mplobby`/`#mp`.
  2. `startRace('cruise'); P.safe = gridPose([START.x, START.z, START.th], NET.you); resetCar();`
  3. `syncNetCars()`.
  4. `NET.poseTimer = setInterval(netSendPose, 50)`.
  5. Guest: `netPing()` now, plus `NET.pingTimer = setInterval(netPing, 2000)`.
- **`netPing()`:** `NET.link.send(HOST_ID, { type: 'ping', a: performance.now() })`.
- **`netSendPose()`:**
  1. Skip when a guest's `NET.offset` is null.
  2. `buf = encodePose({ id: NET.you, seq: NET.seq = (NET.seq + 1) & 0xffff, t: Math.round(hostNow()) >>> 0, x: car.position.x, …, rx/ry/rz: car.rotation, vx: P.vx, vz: P.vz, steer: WHEEL_STATE.yaw, flags` built from `netsync.js` `FLAG`: `visible|head|brake|left|right|nitro })`. The flags come from `car.visible`, `LIGHTS.head`, `LIGHTS.braking`, `HUD.blinker`/`LIGHTS.hazard`, `P.nitro`.
  3. Send `buf` to every peer (the host sends to all guests, a guest to `HOST_ID`).
  4. Feed nothing locally.
- **`netPose(peerId, buf)`** (the `onPose` passed to `createLink`):
  1. `p = parsePose(buf)`; if null, `NET.bad++` and return.
  2. Host: `const id = NET.slots.get(peerId)`; drop if undefined; `p.id = id`; `trackFor(id)`; relay `encodePose(p)` to every other peer in `NET.slots`.
  3. Guest: drop unless `NET.lobby.players.some(q => q.id === p.id) && p.id !== NET.you`.
  4. `pushPose(trackFor(p.id), p)`.
- **`NETCARS`** = `new Map()` of playerId → `{ car, paint, mesh: null, track }`.
  - **`syncNetCars()`:** for every lobby player except `NET.you` (with a car):
    - create the entry, or reset `mesh` when `car`/`paint` changed (`scene.remove` + `disposeParked`);
    - delete the entries of players no longer in the lobby (the same disposal).
  - **`buildNetCar(e)`:**
    - It is a copy of the `buildDepotSlot` clone recipe (`index.html:6324`): `withStageVehicle(e.car, paintOnSelect(def, e.paint, true, 'navy', def), …)`. It drops `flames`/`BLINK`, clones the materials, `scene.add`, and starts hidden.
    - If `def.gltf` is set and `gltfState` is `'idle'`, it calls `loadVehicleModel(e.car)` and waits.
    - On `'failed'`, it builds `def.gltf.fallback`.
    - **Extract a shared `cloneStageVehicle(id, paint)` used by both** rather than duplicating.
  - **`stepNetCars()`** (in `loop` after `stepDepot()`): for each entry, build at most one missing mesh per frame (when ready), then `s = sampleRemote(e.track, hostNow())`; `mesh.visible = !!s && !!(s.flags & 1)`; when shown, set `position` and `rotation`.
- **Hooks:**
  - `netLeave()` also clears both timers, sets `session = false`, and removes and disposes every `NETCARS` mesh.
  - `toMainMenu()`: call `netLeave()` first when `NET.session`.
  - A vehicle change during a session (`selectVehicle` while `NET.session`): a guest sends `{ type: 'pick', car, paint }`; the host updates its own lobby row and broadcasts.
  - In `__mm.net`, add `session` and `offset`.
  - `window.__mm.netCars = () => [...NETCARS].map(([id, e]) => ({ id, car: e.car, built: !!e.mesh, visible: !!e.mesh?.visible, pos: e.mesh ? e.mesh.position.toArray() : null }))`.
  - `tests/test-map.json`: `"net*.js"` → also `test_multiplayer_cruise.py`.
- [ ] Node tests pass. Commit and push `feat(multiplayer): drive together with live remote cars (#835)` **before** Task 2.

## Task 2: browser test
Files: `tests/test_multiplayer_cruise.py` (new). Reuse `ARGS`, `open_page`, `connect`, `net` from `test_multiplayer_lobby.py` (import, do not copy).
```python
def ready_both(host, guest):
    for page in (host, guest):
        page.click("#mppick"); page.wait_for_function("() => window.__mm.carsel().open", timeout=T); page.click("#csrace")
        page.wait_for_function("() => !document.querySelector('#mpready').disabled", timeout=T); page.click("#mpready")
    host.wait_for_function("() => !document.querySelector('#mpgo').disabled", timeout=T)

def test_two_players_see_each_other_drive(pair):
    host, guest, errors = pair
    connect(host, guest); ready_both(host, guest)
    assert guest.is_hidden("#mpgo")
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().session && document.querySelector('#mplobby').hidden", timeout=T)
    guest.wait_for_function("() => window.__mm.net().offset !== null", timeout=T)
    for page, other in ((host, 1), (guest, 0)):
        page.wait_for_function("(id) => window.__mm.netCars().some(c => c.id === id && c.built && c.visible)", arg=other, timeout=T)
    start = {0: guest.evaluate("() => window.__mm.netCars()[0].pos"), 1: host.evaluate("() => window.__mm.netCars()[0].pos")}
    for page in (host, guest): page.keyboard.down("ArrowUp")
    host.wait_for_timeout(2500)
    for page in (host, guest): page.keyboard.up("ArrowUp")
    host.wait_for_timeout(500)
    for page, other, them in ((host, 1, guest), (guest, 0, host)):
        seen = page.evaluate("(id) => window.__mm.netCars().find(c => c.id === id).pos", other)
        real = them.evaluate("() => window.__mm.carPose().pos")
        moved = sum((a - b) ** 2 for a, b in zip(seen, start[other])) ** 0.5
        gap = sum((a - b) ** 2 for a, b in zip(seen, real)) ** 0.5
        assert moved > 5 and gap < 15, (other, moved, gap)
    assert errors == [] and net(host)["bad"] == 0 and net(guest)["bad"] == 0
```
- Define the `pair` fixture as in the lobby test, or import it.
- If the keyboard does not reach the background page, drive with `window.__mm.driveSim(2, ['ArrowUp'])`, and say so in the PR.
- [ ] Run it in the foreground, then `test_multiplayer_lobby.py`. Commit `test(multiplayer): two pages see each other drive (#835)`.
