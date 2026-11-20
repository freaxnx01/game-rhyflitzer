# Remote nitro flames (#1116) Implementation Plan

**Goal:** the other player's nitro flames show on their car in multiplayer.
**Spec:** `docs/superpowers/specs/2026-11-20-mp-remote-nitro-flames-design.md`
**Files:** `index.html` (functions `cloneStageVehicle`, `buildNetCar`, `stepNetCars`, the `window.__mm.netCars` hook), `tests/test_multiplayer_cruise.py`, `CHANGELOG.md`. Not `netsync.js`. Buildless game, no bundler.

Locate by name (line numbers drift): `grep -n "function cloneStageVehicle\|function buildNetCar\|function stepNetCars\|__mm.netCars" index.html`.

## Task 1: failing test first

In `tests/test_multiplayer_cruise.py` add, reusing the `pair` fixture, `connect`, `ready_both` and `net_car` exactly as `test_two_players_see_each_other_drive` does:

```python
def test_remote_car_shows_nitro_flames_while_the_sender_holds_nitro(pair):
    """#1116: the other player's nitro flames follow the pose's nitro flag."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().session && document.querySelector('#mplobby').hidden", timeout=T)
    guest.wait_for_function("() => window.__mm.net().offset !== null", timeout=T)
    guest.wait_for_function(
        "() => window.__mm.netCars().some(c => c.id === 0 && c.built && c.visible)", timeout=T)
    assert net_car(guest, 0)["flames"]["n"] > 0            # the clone keeps the flames
    assert net_car(guest, 0)["flames"]["visible"] is False  # idle: hidden
    host.evaluate("() => window.__mm.driveSim(2.5, ['ArrowUp', 'KeyN'])")
    guest.wait_for_function(
        "() => window.__mm.netCars().find(c => c.id === 0).flames.visible", polling=250, timeout=T)
    assert errors == []
```

If the host's player id is not 0 in this fixture, use the id `test_two_players_see_each_other_drive` uses for the host (it checks `guest` sees id 0). If nitro does not light because the sim needs a held key across frames, hold it via the same `driveSim` hold list (it sets `keys[k]`); if `P.nitro` still stays 0, read how nitro is gated at `P.nitro = nitro || ...` in `stepCar` and set what it needs; do not edit the test to skip the check.

Run only this file, foreground, capped:
`env PW_CDP_ENDPOINT= systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_multiplayer_cruise.py -k nitro_flames -x`
Expected now: FAIL (`flames` is undefined, hook not yet extended).

## Task 2: implement in index.html

1. `cloneStageVehicle(id, paint, keepBlink)`: rename `keepBlink` to `remote` in the signature and its three uses. Replace the drop set:

```js
const drop = new Set();
if (!remote) { drop.add(flames); drop.add(BLINK.left); drop.add(BLINK.right); }   // a remote clone keeps flames and blinkers; depot and podium clones drop them
```

   Capture the flames index next to `li`/`ri` (before the removal loop): `const fi = stage.children.indexOf(flames);`. Declare `let flameGroup = null;` beside `blink`. After the clone: `if (remote && fi >= 0) { flameGroup = g.children[fi]; flameGroup.visible = false; }`. Return `{ mesh, paint: bodyPaint, lamps, blink, flames: flameGroup }`. Update the comment above the function (flames are no longer dropped for remote clones). The other two callers pass no third argument: unchanged.
2. `buildNetCar`: after `entry.blink = built.blink;` add `entry.flames = built.flames;`.
3. `stepNetCars`: right after the `entry.blink.right` line add:

```js
    if (entry.flames) {
      entry.flames.visible = !!(pose.flags & FLAG.nitro);
      if (entry.flames.visible) { const flick = 0.7 + 0.5 * Math.abs(Math.sin(performance.now() * 0.04)); for (const f of entry.flames.children) f.scale.y = flick; }
    }
```

4. `window.__mm.netCars` hook: add `flames: e.flames ? { n: e.flames.children.length, visible: e.flames.visible } : null,` to the returned object.

Check that `FLAG` is already imported in index.html (it is used by `stepNetCars` for `FLAG.visible`).

## Task 3: verify

- Re-run the Task 1 command: PASS. Then only the other tests in `tests/test_multiplayer_cruise.py` (same command without `-k`), and `node --test tests/netsync.test.mjs` (unchanged, must stay green). Never the full suite.
- Depot check without a browser run: `grep -n "cloneStageVehicle(" index.html` shows exactly three callers and only the `buildNetCar` one passes `true`.

## Task 4: changelog, commit

Under `## [Unreleased]` > `### Fixed` in `CHANGELOG.md` add a newest-first entry (timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`):
`- \`<timestamp>\` In multiplayer you now see the other player's **nitro flames** on their car.`

Commit `fix(multiplayer): show the other player's nitro flames (#1116)`; PR body `Closes #1116`.
