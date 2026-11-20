# Shared drive: the other car vanishes around the Hübel lift (#1109)

## Problem

Two-player playtest 2026-11-20: "MP J Hübel, beide in Lift, plötzlich synchronisierung verloren". Both players jumped
to the Hübel (J), drove into the freight lift, and the sync between them was suddenly lost.

**Playtester's answer (2026-11-20, amended run):** asked "Did the sync come back by itself after a few seconds, or did
the other car stay gone?", the answer was "We jumped out of Hübel to the same place and the sync was back". So the
other car stayed gone the whole time both were in the lift / hideout, and came back only once both were on the
surface again. That is not the temporary loss measured below; it has its own cause.

## Main cause: below ground, the remote cars are swept into the hidden surface group

`LEVELS.onChange` (`index.html:4045`) is how the game leaves the surface: on a switch to any level below
(`liftSwitch` `index.html:4699`, `stepSpokes` `index.html:4686`, `jumpBelow` `index.html:8534`), it moves **every
direct child of the scene that is not on `keepBelow()`** into `surfaceRoot` (`index.html:4049`), a group that is
always hidden (`surfaceRoot.visible = false`, `index.html:4033`). Back on the surface it moves them all back
(`index.html:4052`).

`keepBelow()` (`index.html:4039`) lists the car, sky, lights, shadow, the ring and room groups and the cab, but not
the other players' cars. `buildNetCar` adds each remote car straight to the scene (`scene.add(mesh)`,
`index.html:7311`) and its name tag likewise (`scene.add(entry.tag)`, `index.html:7315`). So the first time the
**own** player goes below, every remote car and tag built so far ends up under `surfaceRoot` and is never drawn,
however correct its pose. `stepNetCars` (`index.html:7339`) keeps setting `entry.mesh.visible = true` and moving it,
which is why `__mm.netCars()` still reports `visible: true` (it reads the mesh's own flag, `index.html:7475`), and why
nothing in the pose path looks wrong. The car comes back only on the switch to the surface, exactly as the tester
saw. Being on the same level as the other player makes no difference: the sweep depends only on the own level.

### Measured (headless, one real-world page, 2026-11-20)

A temporary hook added a plain `Object3D` to the scene exactly as `buildNetCar` does (`scene.add`), and read
`drawn()` (`index.html:4706`, visible up to the scene) and its parent. Testhub jumps (`?dev=1`, stub client as in
`tests/test_testhub.py`):

| own level | parent | drawn |
|---|---|---|
| surface, after `scene.add` | `scene` | true |
| `ring` (jump `hideout.ring1`) | `surfaceRoot` | **false** |
| `ring`, 2 s later | `surfaceRoot` | **false** |
| surface again (jump `hideout.gate`) | `scene` | true |

No page errors. The hook was reverted; nothing of it is committed.

Side effect of the same sweep: `removeNetMesh` / `dropNetTag` call `scene.remove(...)` (`index.html:7273`,
`index.html:7277`), which does nothing for a node whose parent is `surfaceRoot`. A player who leaves while the own
player is below leaves a ghost car in `surfaceRoot`, which the switch back to the surface puts into the scene for good.

## Secondary cause: the ride's render stalls and the clock skew (previous run)

## Reproduction (headless, 2026-11-20)

Two pages in one 2 GB-capped Playwright run, `?netice=none`, lobby handshake from `tests/test_multiplayer_lobby.py`
(`connect`) and `ready_both` from `tests/test_multiplayer_cruise.py`, cruise session started by the host.

- **Host** on the real world (it needs the Hübel: `HIDE` exists only for the real hochrhein world, `index.html:1664`).
  Placed in the T1 tunnel 30 m before door A, then into the cabin (`__mm.place` at `__mm.hideout().lift.c`), fast
  lift (`__mm.liftTimes({dwell: .1, close: .1, ride: .4, open: .1})`). It rode down to the ring (y 72.3 -> -600).
- **Guest** on the hand layout (world and terrain routed to 404), standing still on the surface, watching.
- Probed every 0.5 s on both pages: `__mm.netCars()` (visible, pos), the remote track (newest pose age, count, y,
  flags; a temporary read-only hook, not committed), `__mm.net().offset`, lift phase and level, own pose.
- Both riding at once was **not** reproducible here: two real-world pages need more than the 2 GB cap (the first
  attempt thrashed at the cap and never got past `connect`).

### Measured

| what | value |
|---|---|
| `liftSwitch` itself (ring build, level switch) | 51 ms |
| frame after the switch (first render of the ring level), SwiftShader | 57 437 ms |
| frame when the cab closes (cab materials first drawn) | 9 072 - 16 278 ms |
| first frames in the hall | 11 221 - 15 950 ms |
| an ordinary frame, same page | ~36 ms |
| guest's view of the host during a host stall: newest pose age | 11 232 / 14 561 / 15 817 / 22 024 ms -> car hidden |
| guest clock offset, steady | 41 555 ms |
| guest clock offset right after an 11.2 s host stall | 44 808.5 ms (+3 253) |
| guest clock offset right after a 16.3 s host stall | 47 249.1 ms (+5 694) |
| time until the offset was back to steady | ~6 s (three more pings) |
| host's view of the guest in that window: newest pose age | -2 753 ms (poses stamped 2.75 s in the future) |
| guest's view of the host in that window: newest age while the host sends every 50 ms | 1 718 - 2 702 ms; car still hidden until 2.1 s after the host resumed |
| rider's y in the pose stream at the switch | 72.3 -> -600 (672 m, beyond `SNAP` 25 m) |
| data channel | stayed open the whole time: `peers` unchanged, `bad` 0, no page errors |

### Cause (file:line)

1. **The ride stalls the rider's main thread.** Every first render on the way (hall, cab, ring level) is one long
   frame; the ring's is the worst. The poses are sent from a main-thread timer (`NET.poseTimer =
   setInterval(netSendPose, POSE_MS)`, `index.html:7197`; `netSendPose` `index.html:7232`), so the rider sends
   nothing for the length of the stall. The observer hides the car once the newest pose is older than `HIDE`
   (3 s, `netsync.js:6`, checked in `sampleRemote` `netsync.js:71`).
2. **After a host stall the guest's clock is off by seconds.** The guest pings every `PING_MS` (2 s,
   `index.html:7051`). The pings sent during the host's stall are all answered when it ends, so every one of them is
   a late sample: `addClockSample` (`netsync.js:23-26`) takes `b - (a + c) / 2`, which is off by up to half the
   round trip. Three or more of the last five (`CLOCK_N`, `netsync.js:10`) are bad, so the median
   (`clockOffset`, `netsync.js:29-34`) moves: +3.3 s / +5.7 s measured. The pong handler applies it at once
   (`index.html:6968`). For the next ~6 s:
   - the guest stamps its poses seconds in the future (`hostNow`, `index.html:7101`); the host holds the guest's
     car at its oldest buffered pose (`netsync.js:74`) and drops the corrected poses as stragglers
     (`pushPose`, `netsync.js:46`);
   - the guest judges the host's fresh poses as seconds old and keeps the host's car hidden although the host sends
     again (`netsync.js:71`).
   So the loss outlasts the stall itself by several seconds.
3. **Not a defect:** the rider's pose drops 672 m to the ring at the switch (`liftSwitch`, `index.html:4695`). For a
   player still on the surface the rider is then under the hill, i.e. gone from view, which is correct.

The lift state is local to each device (`LIFT_RIDE`, `index.html:4656`; `liftEvent` `index.html:4687`); the pose
stream knows nothing about levels, and nothing in it breaks permanently. With both players riding, both stall at
about the same time, so each loses the other for the stall, and the guest additionally for the skew window.

Reproduction script (temporary, not committed): a pair fixture like `tests/test_multiplayer_cruise.py`, the host
page in `__mm.stepped(true)` for the lobby clicks (SwiftShader draws the real world at well under 1 fps), then
`stepped(false)` for the ride.

## Design

### Main fix: keep the remote cars out of the surface sweep

- `index.html`, next to `keepBelow` (`index.html:4039`): a new function declaration `netKeepNodes()` returning every
  built remote car mesh and name tag (`[...NETCARS.values()].flatMap(e => [e.mesh, e.tag]).filter(Boolean)`).
  `keepBelow()` spreads it into its set. `NETCARS` is declared later (`index.html:7053`); that is safe because
  `keepBelow` is only called from the `LEVELS.onChange` listener, which runs on a level switch, and every switch
  (lift ride, spoke, testhub jump) happens after the module has finished loading.
- Nothing else in the level switch changes. The remote cars stay direct children of the scene on every level, so
  `scene.remove` in `removeNetMesh` / `dropNetTag` works below ground too (no ghost car).
- Test hook, read-only: `window.__mm.netDrawn = () => [...NETCARS].map(([id, e]) => ({ id, car: drawn(e.mesh), tag:
  drawn(e.tag) }))`, next to `__mm.netContacts` (`index.html:7476`). `__mm.netCars` stays as it is.

### Further fix: bound the ping round trip (unchanged from the previous run)

- `netsync.js`: new `export const RTT_MAX = 1000` (ms). `addClockSample(samples, a, b, c)` returns `samples`
  unchanged when there already is at least one sample and the round trip `c - a` is longer than `RTT_MAX`. The
  first sample is always kept, so a slow link still gets an offset (`netSendPose` waits for one,
  `index.html:7236`). `index.html:6968` already passes `a`, `b`, `c`.

Effect: pongs that queued behind a stall never move the offset; after the lift ride's first-render stalls the remote
car comes back with the first pose instead of seconds later.

Not in this change (see Assumptions): showing a remote car only when it is on the observer's own level (the pose
carries no level), shortening the stall itself, a longer `HIDE`.

## Functions and files touched (overlap with #1108, #1120 in flight)

- `index.html`: `keepBelow` (one line), new `netKeepNodes` beside it, new hook `__mm.netDrawn` after
  `__mm.netContacts`.
- `netsync.js`: `addClockSample`, new `RTT_MAX`.
- `tests/test_multiplayer_below.py` (new), `tests/netsync.test.mjs`, `CHANGELOG.md`.
- **#1108** changes `cloneStageVehicle`, `buildNetCar`, `newNetCar`, `stepNetCars` and adds `stepRemoteWheels`:
  none of those is edited here. `netKeepNodes` reads `entry.mesh` / `entry.tag` only, which #1108 keeps. If #1108
  adds further direct scene children per remote car (e.g. wheels added to the scene rather than the mesh), they must
  go into `netKeepNodes` too. The `__mm.netDrawn` line sits near the `__mm.netCars` hook line, which #1108 may also
  extend: a textual merge conflict at most, not a logic one.
- **#1120** (`stepRace`, `netRaceFinish`, `netReopenCp`, `netEndSession`, `drawMap`): no overlap.

## Acceptance criteria

- While the own player is on a level below (ring, room), every built remote car and its name tag stay direct
  children of the scene and are drawn (`__mm.netDrawn` reports `car: true`, `tag: true` for a player with a fresh,
  visible pose), and they still are after the switch back to the surface.
- `tests/test_multiplayer_below.py` fails before the fix and passes after it.
- A ping round trip longer than 1000 ms does not change the clock samples once one exists; pongs that queued behind
  a 10 s host stall leave the offset where it was; the first sample is kept whatever its round trip.
- `clockOffset_fiveSamples_median` passes unchanged; `node --test tests/*.test.mjs` passes.
- `tests/test_multiplayer_cruise.py` passes.
- CHANGELOG entry under `[Unreleased]` / `Fixed`.
