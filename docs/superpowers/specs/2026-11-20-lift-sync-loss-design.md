# Shared drive: the other car vanishes around the Hübel lift (#1109)

## Problem

Two-player playtest 2026-11-20: "MP J Hübel, beide in Lift, plötzlich synchronisierung verloren". Both players jumped
to the Hübel (J), drove into the freight lift, and the sync between them was suddenly lost.

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
   (`index.html:6967`). For the next ~6 s:
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

Fix the clock, which turns a stall into a much longer loss:

- `netsync.js`: new `export const RTT_MAX = 1000` (ms). `addClockSample(samples, a, b, c)` returns `samples`
  unchanged when there already is at least one sample and the round trip `c - a` is longer than `RTT_MAX`. The
  first sample is always kept, so a slow link still gets an offset (`netSendPose` waits for one,
  `index.html:7234`).
- Nothing else changes: `index.html:6967` already passes `a`, `b`, `c`.

Effect: pongs that queued behind a stall (on either side) never move the offset; the remote car comes back with the
first pose after the stall instead of seconds later, and the host no longer holds the guest at a stale pose.

Not in this change (see Assumptions): shortening the stall itself (pre-compiling the hall, cab and ring before
they are first drawn), and a longer `HIDE` that would keep a stalled car frozen in place instead of hiding it.

## Functions and files touched (landing order vs #1108, #1113, #1114, #1116)

- `netsync.js`: `addClockSample`, new `RTT_MAX`.
- `tests/netsync.test.mjs`, `CHANGELOG.md`.
- **No `index.html` change**: no overlap with `netStartSession` (#1114) or `cloneStageVehicle` / `buildNetCar` /
  `stepNetCars` (#1108, #1116) or the map (#1113). Lands in any order.

## Acceptance criteria

- A ping round trip longer than 1000 ms does not change the clock samples once one exists.
- Pongs that queued behind a 10 s host stall leave the offset where it was (unit test).
- The first sample is kept whatever its round trip.
- The existing `clockOffset_fiveSamples_median` test still passes unchanged.
- `node --test tests/netsync.test.mjs` and `tests/test_multiplayer_cruise.py` pass.
