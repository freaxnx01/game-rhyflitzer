# Postauto thanks display (#800) Implementation Plan

Goal: rear display shows smiley + "Vielen Dank!"/"Thank you!" for 4 s when the player waits behind a departing Postauto.
Spec: `docs/superpowers/specs/2026-11-10-postauto-thanks-display-design.md` (assumptions A1-A8 are fixed, do not re-decide).
Tests: `node --test tests/<name>.test.mjs`. Do not run the whole Playwright suite; run only the one new file (Task 5) with
`pipeline/.venv/bin/python -m pytest tests/test_postauto_thanks.py`. Commit per task.

## Task 1: busdisplay.js layout (tests/busdisplay.test.mjs)

Append the failing test first:

```js
import { thanksLayout, SMILEY } from '../busdisplay.js';
test('thanksLayout_TwoWords_FitTheRearWindow', () => {
  for (const text of ['Vielen Dank!', 'Thank you!']) {
    const l = thanksLayout(text, measure);
    assert.equal(l.lines.length, 2);
    for (const ln of l.lines) assert.ok(ln.x + measure(ln.text, ln.size) <= 0.22 * DISPLAY_TEX.w, ln.text);
    assert.ok(l.lines[0].x > l.smiley.x + 7 * l.smiley.cell - 1e-9);
  }
});
test('thanksLayout_Smiley_IsSevenBySevenInsideTheWindow', () => {
  assert.equal(SMILEY.length, 7);
  assert.ok(SMILEY.every((r) => r.length === 7));
  const { smiley } = thanksLayout('Thank you!', measure);
  assert.ok(smiley.x >= 0.004 * DISPLAY_TEX.w && smiley.y >= 0 && smiley.y + 7 * smiley.cell <= DISPLAY_TEX.h);
});
```

Append to `busdisplay.js` (reuses `fit`, which takes `h`; here the start size is 0.4*h):

```js
// #800: the thank-you block, drawn only inside the rear quad's u window (0.004..0.22): a 7x7 dot smiley left, the text
// split at the space into two lines right of it. '#' = lit dot.
export const SMILEY = ['..###..', '.#...#.', '#.#.#.#', '#.....#', '#.#.#.#', '.#.#.#.', '..###..'];
export function thanksLayout(text, measure, tex = DISPLAY_TEX) {
  const cell = 8, x0 = 0.004 * tex.w, limit = 0.215 * tex.w, tx = x0 + 7 * cell + 8;
  const words = text.split(' ');
  return {
    smiley: { x: x0, y: (tex.h - 7 * cell) / 2, cell },
    lines: words.map((w, i) => ({ text: w, x: tx, y: (i === 0 ? 0.46 : 0.88) * tex.h, size: fit(w, tx, limit, measure, tex.h / 0.75 * 0.4) })),
  };
}
```

Note: `fit` starts at `0.75 * h`, so passing `tex.h / 0.75 * 0.4` gives a start size of 0.4 * tex.h (about 51 px).
Run `node --test tests/busdisplay.test.mjs`.

## Task 2: postauto.js decision (tests/postauto.test.mjs)

Failing tests first (add `thankDue, markThanked` to the existing import from `../postauto.js`, and `routeLaneOffset` to the
`../route.js` import). Fixture `R` (route along z = 0, x east) already exists in the file:

```js
const lane = (s) => routeLaneOffset(R, s);
const dep = (over = {}) => ({ phase: 'drive', route: R, s: 105, leftAt: 100, shift: 0, ...over });
const behind = (back, v = 0, dz = 0) => ({ x: 105 - back, z: lane(105 - back) + dz, v, r: 1 });
test('thankDue_PlayerWaitsBehind_True', () => assert.equal(thankDue(dep(), 102, behind(25)), true));
test('thankDue_PlayerOvertakesBeside_False', () => assert.equal(thankDue(dep(), 102, behind(2)), false));
test('thankDue_PlayerAhead_False', () => assert.equal(thankDue(dep(), 102, behind(-20)), false));
test('thankDue_PlayerFar_False', () => assert.equal(thankDue(dep(), 102, behind(60)), false));
test('thankDue_PlayerFast_False', () => assert.equal(thankDue(dep(), 102, behind(25, 12)), false));
test('thankDue_PlayerInOtherLane_False', () => assert.equal(thankDue(dep(), 102, behind(25, 0, 5)), false));
test('thankDue_LongAfterDeparture_False', () => assert.equal(thankDue(dep(), 111, behind(25)), false));
test('thankDue_BusPlacedWhileDriving_False', () => assert.equal(thankDue(dep({ leftAt: -Infinity }), 102, behind(25)), false));
test('thankDue_BusStanding_False', () => assert.equal(thankDue(dep({ phase: 'stand' }), 102, behind(25)), false));
test('markThanked_OncePerDeparture_ThenAgainAfterNextDeparture', () => {
  const b = dep();
  markThanked(b, 102);
  assert.equal(b.thanksUntil, 102 + PA.thanksSecs);
  assert.equal(thankDue(b, 103, behind(25)), false);
  b.leftAt = 300;
  assert.equal(thankDue(b, 302, behind(25)), true);
});
```

Implement in `postauto.js`. Add to `PA`: `thankBehind: 40, thankLane: 2.5, thankKmh: 20, thankWindow: 10, thankSecs: 4,` (a
line `// #800`). Add after `obstacleGap`:

```js
// #800: should the bus thank the player at fleet time t? He waits behind the bus that just left a stop: 6..40 m behind its
// centre, in its lane, slow. `thankedAt` remembers the departure (leftAt) already thanked. player { x, z, v, r }.
// trackRoute only scans 10 m behind its seed, so it is seeded thankBehind / 2 back.
export function thankDue(b, t, player, cfg = PA) {
  if (b.phase !== 'drive' || b.thankedAt === b.leftAt || !(t - b.leftAt < cfg.thankWindow)) return false;
  if (player.v > cfg.thankKmh / 3.6) return false;
  const tr = trackRoute(b.route, player.x, player.z, b.s - cfg.thankBehind / 2), back = b.s - tr.s;
  if (back < BUS.length / 2 || back > cfg.thankBehind) return false;
  return Math.abs(tr.d - Math.abs(routeLaneOffset(b.route, tr.s))) <= cfg.thankLane;
}
export function markThanked(b, t, cfg = PA) { b.thankedAt = b.leftAt; b.thanksUntil = t + cfg.thankSecs; }
```

Run `node --test tests/postauto.test.mjs`.

## Task 3: strings.js

Add `paThanks: 'Thank you!'` to `en` and `paThanks: 'Vielen Dank!'` to `de` (next to the `dbgPa*` keys, comment `// #800`).
Run `node --test tests/strings.test.mjs`.

## Task 4: index.html wiring (no new test file; covered by Task 5)

1. Import: `import { DISPLAY_TEX, displayLayout, thanksLayout, SMILEY } from './busdisplay.js';` and add `thankDue, markThanked` to the `./postauto.js` import (line ~787).
2. `displayTexture({ line, dest, thanks })`: after drawing line and dest, when `thanks` is set (not null):

```js
    if (thanks) {
      const tl = thanksLayout(thanks, measure), rear = 0.22 * w;
      g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, rear, h);   // wipe the line number; the destination (u > 0.254) stays
      g.fillStyle = '#ff9a1a';
      SMILEY.forEach((row, r) => [...row].forEach((c, q) => { if (c === '#') { g.beginPath(); g.arc(tl.smiley.x + (q + 0.5) * tl.smiley.cell, tl.smiley.y + (r + 0.5) * tl.smiley.cell, tl.smiley.cell * 0.4, 0, 7); g.fill(); } }));
      for (const ln of tl.lines) { g.font = `700 ${ln.size}px "Barlow Condensed", sans-serif`; g.fillText(ln.text, ln.x, ln.y); }
    }
```

3. `repaintBusLed(g, trip, thanks = null)`: `const text = { ...ledText(trip), thanks };` and compare `g.userData.led.thanks === text.thanks` too in the early return. Callers: `buildPostautoMesh` keeps `repaintBusLed(g, trip)`; `drawPostauto` becomes `repaintBusLed(g, b.trip, thanksText(b))` where `const thanksText = (b) => (b.thanksUntil > postautoClock() + b.shift ? tr('paThanks') : null);` (define next to `drawPostauto`; for a new mesh the first frame is repainted on the next call, which is fine).
4. In `stepPostauto`, `player` gets the speed: `const player = { x: P.x, z: P.z, v: Math.hypot(P.vx, P.vz), r: ... }`, and after the `stepBus` loop, before `if (b.phase === 'done') continue;`:

```js
    if (surface && thankDue(b, now + b.shift, player)) markThanked(b, now + b.shift);
```

(`now` is the fleet clock at frame end; `now + b.shift` is the bus's own time, as `stepBus` uses.)
Run `node --test tests/*.test.mjs`.

## Task 5: Playwright (tests/test_postauto_thanks.py, foreground, only this file)

Reuse the stepped clock helpers: `from test_bus_stops import open_paused, set_fleet_clock, hhmm, TT, needs_data, RUETTI`
(if tests are not importable as modules, copy the three small helpers as `test_postauto_143.py` does). Test:
`test_waiting_behind_a_departing_bus_shows_thanks_then_returns`. Flow: read the earliest `RUETTI` call `arr` like the
existing test, `set_fleet_clock(page, hhmm(arr - 60), 60)`, step `page.clock.run_for(250)` until a bus has `phase == "stand"`
at that stop; place the player 15 m behind it: `page.evaluate("([x,z,th]) => window.__mm.place(x,z,th)", [bus.x - 15*cos(th), bus.z - 15*sin(th), th])`;
keep stepping until `bus["led"]["thanks"]` is truthy (max 60 frames); assert it equals `"Thank you!"` (page locale en-US); then
step up to 30 more frames and assert `led["thanks"]` is `None` and `led["line"]` is unchanged; assert no page errors.
Commit and push before running it; the test needs ~2 min.

## Task 6: CHANGELOG.md

Under `[Unreleased]` add, in the player's voice: "Postautos bedanken sich: Wartest Du hinter einem Postauto, das gerade von der Haltestelle losfährt, zeigt seine Anzeige für vier Sekunden einen Smiley und «Vielen Dank!»."
