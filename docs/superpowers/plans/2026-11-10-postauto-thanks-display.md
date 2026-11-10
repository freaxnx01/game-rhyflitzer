# Postauto thanks display (#800) Implementation Plan

Goal: the rear display (own material, own texture) shows a smiley + "Vielen Dank!"/"Thank you!" for 4 s when the player waits
behind a departing Postauto; front and side never change.
Spec: `docs/superpowers/specs/2026-11-10-postauto-thanks-display-design.md` (A1-A10 are fixed, do not re-decide). No model
rebuild: the rear quad is split off at runtime (A9).
Tests: `node --test tests/<name>.test.mjs`. No whole Playwright suite: only the new file (Task 5) and `tests/test_postauto.py` via
`pipeline/.venv/bin/python -m pytest <file>`. Commit per task.

## Task 1: busdisplay.js (tests/busdisplay.test.mjs)

Failing tests first (`measure` already exists in the file):

```js
import { REAR_TEX, SMILEY, rearLayout, thanksLayout, splitRearTriangles, normalizeUv } from '../busdisplay.js';
test('rearLayout_LineNumber_CentredAndFits', () => {
  const l = rearLayout('1234', measure);
  assert.equal(l.x, REAR_TEX.w / 2);
  assert.ok(measure('1234', l.size) <= 0.92 * REAR_TEX.w);
});
test('thanksLayout_TextFitsAndSitsBelowTheSmiley', () => {
  for (const text of ['Vielen Dank!', 'Thank you!']) {
    const l = thanksLayout(text, measure);
    assert.ok(measure(text, l.text.size) <= 0.92 * REAR_TEX.w, text);
    assert.ok(l.smiley.y + 7 * l.smiley.cell < l.text.y - 0.5 * l.text.size);
  }
  assert.ok(SMILEY.length === 7 && SMILEY.every((r) => r.length === 7));
});
// two quads: the tail at x = -5.8 (vertices 0-3) and the nose at x = 5.8 (4-7)
const POS = [-5.8, 2.5, -0.2, -5.8, 2.5, 0.2, -5.8, 2.8, 0.2, -5.8, 2.8, -0.2, 5.8, 2.4, -1, 5.8, 2.4, 1, 5.8, 2.7, 1, 5.8, 2.7, -1];
const IDX = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
test('splitRearTriangles_TwoQuads_SeparatesTheTail', () => {
  const { rear, rest } = splitRearTriangles(POS, IDX);
  assert.deepEqual(rear, [0, 1, 2, 0, 2, 3]);
  assert.deepEqual(rest, [4, 5, 6, 4, 6, 7]);
});
test('normalizeUv_RearVertices_CoverZeroToOne', () => {
  const uv = [0.004, 0.1, 0.22, 0.1, 0.22, 0.9, 0.004, 0.9, 0.5, 0.5, 0.9, 0.5, 0.9, 0.6, 0.5, 0.6];
  normalizeUv(uv, [0, 1, 2, 0, 2, 3]);
  assert.deepEqual(uv.slice(0, 8), [0, 0, 1, 0, 1, 1, 0, 1]);
  assert.deepEqual(uv.slice(8), [0.5, 0.5, 0.9, 0.5, 0.9, 0.6, 0.5, 0.6]);   // the other quad is untouched
});
```

Implement (append to `busdisplay.js`; `MIN_SIZE` exists there):

```js
export const REAR_TEX = { w: 330, h: 200 };
function fitWidth(text, maxW, start, measure) {
  let size = start;
  while (size > MIN_SIZE && measure(text, size) > maxW) size -= 2;
  return size;
}
export function rearLayout(line, measure, tex = REAR_TEX) {
  return { x: tex.w / 2, y: 0.72 * tex.h, size: fitWidth(line, 0.92 * tex.w, 0.7 * tex.h, measure) };
}
export const SMILEY = ['..###..', '.#...#.', '#.#.#.#', '#.....#', '#.#.#.#', '.#.#.#.', '..###..'];
export function thanksLayout(text, measure, tex = REAR_TEX) {
  const cell = 12;
  return { smiley: { x: (tex.w - 7 * cell) / 2, y: 0.08 * tex.h, cell },
    text: { x: tex.w / 2, y: 0.94 * tex.h, size: fitWidth(text, 0.92 * tex.w, 0.26 * tex.h, measure) } };
}
// +x is forward (tools/prepare-bus.mjs:12): triangles within tol m of the most negative x are the rear quad
export function splitRearTriangles(pos, index, tol = 0.1) {
  let minX = Infinity;
  for (let i = 0; i < pos.length; i += 3) minX = Math.min(minX, pos[i]);
  const rear = [], rest = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    (tri.every((v) => pos[3 * v] <= minX + tol) ? rear : rest).push(...tri);
  }
  return { rear, rest };
}
// scales these vertices' UVs to 0..1 in place
export function normalizeUv(uv, vertices) {
  const ids = [...new Set(vertices)], us = ids.map((i) => uv[2 * i]), vs = ids.map((i) => uv[2 * i + 1]);
  const u0 = Math.min(...us), v0 = Math.min(...vs), du = Math.max(...us) - u0 || 1, dv = Math.max(...vs) - v0 || 1;
  for (const i of ids) { uv[2 * i] = (uv[2 * i] - u0) / du; uv[2 * i + 1] = (uv[2 * i + 1] - v0) / dv; }
}
```

## Task 2: postauto.js decision (tests/postauto.test.mjs)

Failing tests first (add `thankDue, markThanked` to the `../postauto.js` import and `routeLaneOffset` to the `../route.js`
import; fixture `R`, a route along z = 0, x east, exists in the file):

```js
const lane = (s) => routeLaneOffset(R, s);
const dep = (over = {}) => ({ phase: 'drive', route: R, s: 105, leftAt: 100, shift: 0, ...over });
const behind = (back, v = 0, dz = 0) => ({ x: 105 - back, z: lane(105 - back) + dz, v, r: 1 });
const CASES = [['PlayerWaitsBehind', dep(), 102, behind(25), true], ['PlayerOvertakesBeside', dep(), 102, behind(2), false],
  ['PlayerAhead', dep(), 102, behind(-20), false], ['PlayerFar', dep(), 102, behind(60), false],
  ['PlayerFast', dep(), 102, behind(25, 12), false], ['PlayerInOtherLane', dep(), 102, behind(25, 0, 5), false],
  ['LongAfterDeparture', dep(), 111, behind(25), false], ['BusPlacedWhileDriving', dep({ leftAt: -Infinity }), 102, behind(25), false],
  ['BusStanding', dep({ phase: 'stand' }), 102, behind(25), false]];
for (const [name, b, t, player, want] of CASES) test(`thankDue_${name}_${want}`, () => assert.equal(thankDue(b, t, player), want));
test('markThanked_OncePerDeparture_ThenAgainAfterNextDeparture', () => {
  const b = dep();
  markThanked(b, 102);
  assert.equal(b.thanksUntil, 102 + PA.thanksSecs);
  assert.equal(thankDue(b, 103, behind(25)), false);
  b.leftAt = 300;
  assert.equal(thankDue(b, 302, behind(25)), true);
});
```

Implement in `postauto.js`. In `PA` add a line `thankBehind: 40, thankLane: 2.5, thankKmh: 20, thankWindow: 10, thankSecs: 4,   // #800`. After `obstacleGap`:

```js
// #800: does the player (x, z, v) wait behind the bus that just left a stop? trackRoute scans only 10 m behind its seed, hence the offset
export function thankDue(b, t, player, cfg = PA) {
  if (b.phase !== 'drive' || b.thankedAt === b.leftAt || !(t - b.leftAt < cfg.thankWindow)) return false;
  if (player.v > cfg.thankKmh / 3.6) return false;
  const tr = trackRoute(b.route, player.x, player.z, b.s - cfg.thankBehind / 2), back = b.s - tr.s;
  if (back < BUS.length / 2 || back > cfg.thankBehind) return false;
  return Math.abs(tr.d - Math.abs(routeLaneOffset(b.route, tr.s))) <= cfg.thankLane;
}
export function markThanked(b, t, cfg = PA) { b.thankedAt = b.leftAt; b.thanksUntil = t + cfg.thankSecs; }
```


## Task 3: strings.js

Add `paThanks: 'Thank you!'` to `en` and `paThanks: 'Vielen Dank!'` to `de`, next to the `dbgPa*` keys (comment `// #800`).

## Task 4: index.html wiring (covered by Task 5)

1. Imports: `import { DISPLAY_TEX, displayLayout, REAR_TEX, SMILEY, rearLayout, thanksLayout, splitRearTriangles, normalizeUv } from './busdisplay.js';` and add `thankDue, markThanked` to the `./postauto.js` import (line ~787).
2. Next to `displayTexture` (line ~4205), add:

```js
function rearTexture({ line, thanks }) {
  const tex = makeTex(REAR_TEX.w, REAR_TEX.h, (g, w, h) => {
    g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff9a1a'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const measure = (s, size) => { g.font = `700 ${size}px "Barlow Condensed", sans-serif`; return g.measureText(s).width; };
    if (!thanks) { const l = rearLayout(line, measure); g.font = `700 ${l.size}px "Barlow Condensed", sans-serif`; g.fillText(line, l.x, l.y); return; }
    const l = thanksLayout(thanks, measure);
    SMILEY.forEach((row, r) => [...row].forEach((c, q) => {
      if (c !== '#') return;
      g.beginPath(); g.arc(l.smiley.x + (q + 0.5) * l.smiley.cell, l.smiley.y + (r + 0.5) * l.smiley.cell, l.smiley.cell * 0.4, 0, 7); g.fill();
    }));
    g.font = `700 ${l.text.size}px "Barlow Condensed", sans-serif`; g.fillText(thanks, l.text.x, l.text.y);
  });
  tex.flipY = false;
  return tex;
}
```

3. Replace `paintBusDisplay` (and its comment) by the functions below. The Display mesh gets, on its first paint, its own
   geometry copy with two groups and a material array `[front/side, rear]`; the cached glTF stays untouched.

```js
const displayMeshes = (root) => { const out = []; root.traverse((o) => { if (o.isMesh && (Array.isArray(o.material) ? o.material[0] : o.material)?.userData?.overGlass) out.push(o); }); return out; };
// #800 (A9): own geometry copy, rear quad = group 1; false when none found
function splitDisplayRear(o) {
  const geo = o.geometry.clone(), uv = geo.attributes.uv, count = geo.attributes.position.count;
  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: count }, (_, i) => i);
  const { rear, rest } = splitRearTriangles(geo.attributes.position.array, index);
  const shared = rear.some((v) => rest.includes(v));
  if (!rear.length || !uv || shared) { geo.dispose(); console.warn('Postauto Display: no separable rear quad, no thank-you on the rear'); return false; }
  normalizeUv(uv.array, rear);
  geo.setIndex([...rest, ...rear]); geo.clearGroups(); geo.addGroup(0, rest.length, 0); geo.addGroup(rest.length, rear.length, 1);
  o.geometry = geo; o.userData.sharedGeo = false;   // freed by disposePostautoMesh
  return true;
}
function ownDisplayMaterials(o) {
  if (!o.userData.ownDisplay) {
    const base = o.material, split = splitDisplayRear(o), front = base.clone(), rear = split ? base.clone() : null;
    for (const m of [front, rear]) if (m) m.map = m.emissiveMap = null;   // never dispose the shared map
    o.material = rear ? [front, rear] : front; o.userData.ownDisplay = true;
  }
  return Array.isArray(o.material) ? { front: o.material[0], rear: o.material[1] } : { front: o.material, rear: null };
}
function setDisplayMap(m, tex) { m.map?.dispose(); m.map = m.emissiveMap = tex; }
function paintFront(root, text) { const meshes = displayMeshes(root); for (const o of meshes) setDisplayMap(ownDisplayMaterials(o).front, displayTexture(text)); return meshes.length; }
function paintRear(root, text) { for (const o of displayMeshes(root)) { const { rear } = ownDisplayMaterials(o); if (rear) setDisplayMap(rear, rearTexture(text)); } }
```

4. `repaintBusLed(g, trip, thanks = null)` becomes:

```js
function repaintBusLed(g, trip, thanks = null) {
  const text = { ...ledText(trip), thanks }, prev = g.userData.led;
  const frontSame = !!prev && prev.line === text.line && prev.dest === text.dest;
  if (frontSame && prev.thanks === text.thanks) return;
  console.info(`Painting line ${text.line} to ${text.dest}${thanks ? ' with the thank-you' : ''} onto the bus display`);
  if (!frontSame && paintFront(g.userData.root, text) === 0) console.warn('Postauto model has no Display material: no line/destination shown');
  paintRear(g.userData.root, text);
  g.userData.led = text;
}
```

   `buildPostautoMesh` keeps its call. In `drawPostauto` use `else repaintBusLed(g, b.trip, b.thanksUntil > postautoClock() + b.shift ? tr('paThanks') : null);`.
5. `stepPostauto`: `player` gets `v: Math.hypot(P.vx, P.vz)`; after the `stepBus` loop, before `if (b.phase === 'done') continue;` add `if (surface && thankDue(b, now + b.shift, player)) markThanked(b, now + b.shift);`.
6. `__mm.postautoDisplay` (line ~4822): `const m = displays[0]?.material;` becomes `const mat = displays[0]?.material, m = Array.isArray(mat) ? mat[0] : mat;` and the returned object gains `frontMap: m?.map?.uuid ?? null, rearMap: Array.isArray(mat) ? mat[1].map?.uuid ?? null : null, split: Array.isArray(mat)`. The existing `displays === 1`, `own`, `ownMap`, `flipY` fields then describe the front material as before.

Run `node --test tests/*.test.mjs` after each task.

## Task 5: Playwright (tests/test_postauto_thanks.py, foreground, only this file and tests/test_postauto.py)

Reuse `open_paused`, `set_fleet_clock`, `hhmm`, `TT`, `needs_data`, `RUETTI` from `test_bus_stops.py` (copy them if the import fails).
Test `test_waiting_behind_a_departing_bus_thanks_on_the_rear_only`: as in the existing Rütti test (earliest `arr`,
`set_fleet_clock(page, hhmm(arr - 60), 60)`, `page.clock.run_for(250)` until a bus has `phase == "stand"` there). Read
`postautoDisplay()` for its key: `split` is true; keep `frontMap`, `rearMap`. `window.__mm.place(x - 15*cos(th), z - 15*sin(th), th)`
puts the player behind it. Step until `postauto().buses[].led.thanks` is truthy (max 60 frames): it equals `"Thank you!"` (en-US),
`rearMap` changed, `frontMap` did not. Step up to 30 more frames: `led.thanks` is None, `frontMap` unchanged. No page errors.
Commit and push before running (about 2 min).

## Task 6: CHANGELOG.md

Under `[Unreleased]` add: "Postautos bedanken sich: Wartest Du hinter einem Postauto, das gerade von der Haltestelle losfährt, zeigt seine Heckanzeige für vier Sekunden einen Smiley und «Vielen Dank!»."
