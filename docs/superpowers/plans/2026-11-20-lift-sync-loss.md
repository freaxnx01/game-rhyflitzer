# Lift sync loss (#1109) Implementation Plan

**Goal:** the other player's car stays drawn while the own player is below ground (lift, ring, rooms); and a ping that queued behind a stalled main thread no longer shifts the guest's clock.
**Spec:** `docs/superpowers/specs/2026-11-20-lift-sync-loss-design.md`
**Cause:** `LEVELS.onChange` (`index.html:4045`) moves every scene child that is not in `keepBelow()` (`index.html:4039`) into the always-hidden `surfaceRoot` (`index.html:4049`). Remote cars and their tags are added straight to the scene (`buildNetCar`, `index.html:7311`, `7315`) and are not on that list, so they vanish when the own player goes below and come back only on the surface.
**Constraints:** buildless, vanilla JS. Do not edit `cloneStageVehicle`, `buildNetCar`, `newNetCar`, `stepNetCars` (#1108) or `stepRace`, `netRaceFinish`, `netReopenCp`, `netEndSession`, `drawMap` (#1120). Playwright: foreground, only the file named, never the full suite:
`env PW_CDP_ENDPOINT= systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/<file> -x`

### Task 1: keep remote cars out of the surface sweep (TDD)

**Files:** `index.html`, `tests/test_multiplayer_below.py` (new)

- [ ] Test hook first. In `index.html`, right after the `window.__mm.netContacts = ...` line, add:

```js
window.__mm.netDrawn = () => [...NETCARS].map(([id, e]) => ({ id, car: drawn(e.mesh), tag: drawn(e.tag) }));   // #1109: drawn up to the scene (surfaceRoot hides below ground)
```

- [ ] Failing test: new `tests/test_multiplayer_below.py`. The host needs the real world (the hideout exists only there); the guest stays on the hand layout (two real-world pages do not fit 2 GB). Import `ARGS`, `READY`, `T`, `connect`, `open_page` from `test_multiplayer_lobby`; `NO_THROTTLE`, `ready_both` from `test_multiplayer_cruise`; `STUB`, `CLIENT_ROUTE`, `needs_world` from `test_testhub`.

```python
def open_real(browser, server):
    # open_page without the world/terrain 404 routes, plus ?dev=1 and the testhub stub, so testhub jumps work
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    page = ctx.new_page(); page.set_default_timeout(T); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(CLIENT_ROUTE, lambda r: r.fulfill(status=200, content_type="text/javascript", body=STUB))
    page.goto(f"{server}/index.html?netice=none&dev=1")
    page.wait_for_function(READY, timeout=240000)
    return page, errors


DRAWN = "(id) => window.__mm.netDrawn().some(c => c.id === id && c.car && c.tag)"


def jump(page, target, level):
    page.evaluate("(id) => window.ggTesthub.regs[id].fn()", target)
    page.wait_for_function("(l) => window.__mm.level().id === l", arg=level, timeout=T)


@needs_world
def test_remote_car_stays_drawn_while_the_own_player_is_below(server):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS + NO_THROTTLE)
        host, host_errors = open_real(browser, server)
        guest, guest_errors = open_page(browser, server)
        connect(host, guest); ready_both(host, guest); host.click("#mpgo")
        host.wait_for_function("() => window.__mm.net().session", timeout=T)
        host.wait_for_function(DRAWN, arg=1, timeout=T)   # guest's car drawn on the surface
        jump(host, "hideout.ring1", "ring")
        host.wait_for_function(DRAWN, arg=1, timeout=T)   # before #1109: parent surfaceRoot, never drawn
        jump(host, "hideout.gate", "surface")
        host.wait_for_function(DRAWN, arg=1, timeout=T)
        browser.close()
    assert host_errors + guest_errors == []
```

  If the host's lobby clicks time out (SwiftShader draws the real world well under 1 fps), wrap `connect`/`ready_both` in `host.evaluate("() => window.__mm.stepped(true)")` ... `stepped(false)` (`index.html:8588`), as the previous repro did.
- [ ] Run the new file: the `DRAWN` wait after the ring jump times out.
- [ ] Fix. Replace the `keepBelow` line (`index.html:4039`) with:

```js
// #1109: the other players' cars and name tags are direct scene children too (buildNetCar); below ground they must stay drawn.
// NETCARS is declared further down; this only runs from LEVELS.onChange, i.e. on a level switch after load.
function netKeepNodes() { return [...NETCARS.values()].flatMap(e => [e.mesh, e.tag]).filter(Boolean); }
const keepBelow = () => new Set([car, sky, sun, sun.target, hemi, sunSprite, shadowMesh, surfaceRoot, ROOM.group, RING_L.ring.group, RING_L.ring2.group, ROOM.cab, ...netKeepNodes()]);
```

- [ ] Run the new file: passes. Run `tests/test_multiplayer_cruise.py`: passes.
- [ ] Commit: `fix(multiplayer): keep the other cars drawn below ground` with `Refs #1109`.

### Task 2: bound the ping round trip in `addClockSample` (TDD)

**Files:** `netsync.js`, `tests/netsync.test.mjs`

- [ ] Failing tests. In `tests/netsync.test.mjs` add `RTT_MAX` to the import on line 4, then after `clockOffset_fiveSamples_median`:

```js
test('addClockSample_lateRoundTrip_droppedOnceAnOffsetExists', () => {
  assert.equal(RTT_MAX, 1000);
  let c = addClockSample(null, 0, 1000, 20);
  c = addClockSample(c, 100, 1110, 120);
  const stalled = addClockSample(c, 200, 9000, 8200);      // the peer stalled ~8 s: round trip 8000 ms
  assert.deepEqual(stalled, c);
  assert.equal(addClockSample(c, 300, 1800, 1300).length, 3);   // exactly RTT_MAX: still a sample
});

test('addClockSample_slowFirstRoundTrip_kept', () => {
  const c = addClockSample(null, 0, 5000, 4000);            // no offset yet: a slow link must still get one
  assert.equal(c.length, 1);
  assert.equal(clockOffset(c), 3000);
});

test('addClockSample_pingsQueuedBehindAStall_offsetUnchanged', () => {
  // #1109: pings every 2 s; while the host is stalled (lift ride, 6-16 s) every pong arrives at 16 s
  let c = null;
  for (const a of [0, 2000, 4000]) c = addClockSample(c, a, 1000 + a + 10, a + 20);   // steady: offset 1000
  for (const a of [6000, 8000, 10000, 12000, 14000]) c = addClockSample(c, a, 17010, 16020);
  assert.equal(clockOffset(c), 1000);
});
```

- [ ] Run `node --test tests/netsync.test.mjs`: the three new tests fail.
- [ ] In `netsync.js`, after `CLOCK_N` (line 10) add:

```js
export const RTT_MAX = 1000;     // ms: a longer ping round trip (a stalled peer) is no clock sample once one exists (#1109)
```

- [ ] Replace `addClockSample` (lines 21-26) with:

```js
// addClockSample(samples, a, b, c) — one ping/pong round: a = send time, b = host clock, c = receive time (guest ms).
// Returns a new array holding the last CLOCK_N offsets; never mutates the one it is given. A round trip longer than
// RTT_MAX is dropped once there is a sample: a pong that queued behind a stalled main thread (#1109: the lift ride's
// first renders) would move the median by seconds. The first sample is always kept, so a slow link still gets an offset.
export function addClockSample(samples, a, b, c) {
  if (samples && samples.length && c - a > RTT_MAX) return samples;
  const next = [...(samples || []), b - (a + c) / 2];
  return next.length > CLOCK_N ? next.slice(next.length - CLOCK_N) : next;
}
```

- [ ] Run `node --test tests/*.test.mjs`: all pass, `clockOffset_fiveSamples_median` unchanged.
- [ ] Run `tests/test_multiplayer_cruise.py`: passes.
- [ ] Commit: `fix(multiplayer): ignore late ping round trips in the clock offset` with `Refs #1109`.

### Task 3: changelog

**Files:** `CHANGELOG.md`

- [ ] Under `## [Unreleased]`, in `### Fixed` (create it after `### Added` if missing), newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `YYYY-MM-DD HH:MM` Gemeinsam fahren: Im **Hübel** (Lift, Tunnelring, Räume) bleibt das Auto des anderen Spielers jetzt **sichtbar**, statt bis zur Rückkehr an die Oberfläche verschwunden zu sein. Ruckelt das Spiel eines Spielers kurz (etwa beim ersten Mal im Lift), taucht das andere Auto gleich danach wieder auf, statt noch Sekunden **eingefroren** zu bleiben.
```

- [ ] Commit: `docs(changelog): lift sync loss fix` with `Closes #1109`.
