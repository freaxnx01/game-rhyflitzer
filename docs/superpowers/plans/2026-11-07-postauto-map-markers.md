# Postautos on the minimap and the full map (#711): implementation plan

**Goal:** one yellow arrow per active Postauto on the map canvas (minimap and full map), the line number on the full map, optionally
the line 133 route as a faint line on the full map.

**Spec:** `docs/superpowers/specs/2026-11-07-postauto-map-markers-design.md`. **Stack:** buildless browser game, `node --test` for pure logic,
one Playwright test.

## Global Constraints

- Do not edit `buildPostautoMesh`, `busPose`, or `postauto.js` (#710, #713 run in parallel).
- No framework, no `package.json`. `version.js` untouched.
- Run Playwright in the foreground, the one new file only, never the full suite.

## File Structure

- Create `busmarks.js` (pure), `tests/busmarks.test.mjs`
- Modify `index.html` (import, `drawPostautoMarks`, one call in `drawMap`, test hook)
- Create `tests/test_postauto_map.py`
- Modify `CHANGELOG.md` (`[Unreleased]`, player-facing German sentence)

### Task 1: Pure marker list (busmarks.js)

**Files:** create `busmarks.js`, `tests/busmarks.test.mjs`.

**Interfaces:**

```js
export function busMarks(buses, poseOf)           // -> [{ key, line, x, z, th }], skips phase 'done'
export function markLabel(mark, full)             // -> mark.line when full, else null
export function onCanvas(px, py, w, h, pad = 14)  // -> boolean
```

- [ ] **Step 1: Write the failing test** `tests/busmarks.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { busMarks, markLabel, onCanvas } from '../busmarks.js';

const pose = (b) => ({ x: b.s, z: -b.s, th: 1.5 });
const bus = (key, phase, line = 133, s = 10) => ({ key, phase, s, trip: { line }, route: {} });

test('busMarks_ActiveBuses_OneMarkEachWithPose', () => {
  const m = busMarks([bus('a', 'drive', 133, 5), bus('b', 'stand', 133, 7)], pose);
  assert.deepEqual(m, [{ key: 'a', line: '133', x: 5, z: -5, th: 1.5 }, { key: 'b', line: '133', x: 7, z: -7, th: 1.5 }]);
});
test('busMarks_DoneBus_Skipped', () => {
  assert.equal(busMarks([bus('a', 'done')], pose).length, 0);
});
test('busMarks_NoBuses_Empty', () => {
  assert.deepEqual(busMarks([], pose), []);
});
test('markLabel_FullMapOnly', () => {
  assert.equal(markLabel({ line: '133' }, true), '133');
  assert.equal(markLabel({ line: '133' }, false), null);
});
test('onCanvas_InsideAndPastPad', () => {
  assert.equal(onCanvas(400, 200, 800, 400), true);
  assert.equal(onCanvas(-14, 200, 800, 400), true);
  assert.equal(onCanvas(-15, 200, 800, 400), false);
  assert.equal(onCanvas(400, 415, 800, 400), false);
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing): `node --test tests/busmarks.test.mjs`
- [ ] **Step 3: Implement** `busmarks.js`

```js
// busmarks.js (#711): pure helpers for the Postauto markers on the map. No DOM, no three.js: node --test only.

// one mark per bus still on the road; poseOf(bus) -> { x, z, th } (index.html passes busPose on the bus's route)
export function busMarks(buses, poseOf) {
  const marks = [];
  for (const b of buses) {
    if (b.phase === 'done') continue;
    const p = poseOf(b);
    marks.push({ key: b.key, line: String(b.trip.line), x: p.x, z: p.z, th: p.th });
  }
  return marks;
}

// the line number is drawn on the full map only
export const markLabel = (mark, full) => (full ? mark.line : null);

// canvas px inside the canvas, or at most `pad` px outside it (the arrow's reach)
export const onCanvas = (px, py, w, h, pad = 14) => px >= -pad && py >= -pad && px <= w + pad && py <= h + pad;
```

- [ ] **Step 4: Run, expect PASS.** Commit `feat(map): pure Postauto marker list (#711)`.

### Task 2: Draw the markers in drawMap

**Files:** modify `index.html`.

- [ ] **Step 1:** add a new line after the `postauto.js` import at `index.html:728`:
  `import { busMarks, markLabel, onCanvas } from './busmarks.js';   // #711`
- [ ] **Step 2:** add before `function drawMap()` (`index.html:5342`):

```js
// #711: one yellow arrow per Postauto on the map (minimap and full map share the canvas), the line number on the full map
const BUS_MARK = { fill: '#ffcc00', ink: '#1c1f26', scale: 0.8 };
function postautoMapMarks() { return POSTAUTO.ready ? busMarks(POSTAUTO.buses, b => busPose(b.route, b.s)) : []; }
function drawPostautoMarks(v) {
  for (const m of postautoMapMarks()) {
    const [x, y] = mapPt(v, m.x, m.z); if (!onCanvas(x, y, mapC.width, mapC.height)) continue;
    mg.save(); mg.translate(x, y); mg.rotate(m.th); mg.scale(BUS_MARK.scale, BUS_MARK.scale); mg.beginPath(); mg.moveTo(10, 0); mg.lineTo(-7, 6); mg.lineTo(-4, 0); mg.lineTo(-7, -6); mg.closePath();
    mg.fillStyle = BUS_MARK.fill; mg.fill(); mg.lineWidth = 2; mg.strokeStyle = BUS_MARK.ink; mg.stroke(); mg.restore();
    const label = markLabel(m, MAP.full); if (!label) continue;
    mg.font = '800 12px "Barlow Condensed", sans-serif'; mg.textAlign = 'center'; mg.lineWidth = 3; mg.strokeStyle = BUS_MARK.ink; mg.strokeText(label, x, y - 9); mg.fillStyle = BUS_MARK.fill; mg.fillText(label, x, y - 9); mg.textAlign = 'left';
  }
}
```

- [ ] **Step 3:** in `drawMap()` replace `for (const m of MAP_MARKS.list) drawEnterableDoor(v, m); const [px, py]` with
  `for (const m of MAP_MARKS.list) drawEnterableDoor(v, m); drawPostautoMarks(v); const [px, py]` (before the player arrow, which stays on top).
- [ ] **Step 4:** test hook right after the `window.__mm.map = ...` line (`index.html:5294`):

```js
window.__mm.mapBuses = () => { const v = mapView(); return { full: MAP.full, marks: postautoMapMarks().map(m => { const [px, py] = mapPt(v, m.x, m.z); return { key: m.key, line: m.line, px, py, th: m.th, label: markLabel(m, MAP.full) }; }) }; };   // #711: read-only, for the test
```

- [ ] **Step 5:** `node --test tests/busmarks.test.mjs` still passes; commit `feat(map): Postauto arrows on the minimap and full map (#711)`.

### Task 3: One Playwright test

**Files:** create `tests/test_postauto_map.py`; copy the imports, `ROOT`, `TT`, `needs_data`, `ARGS`, `hhmm` and `open_at` from `tests/test_postauto.py:1-28` (the `server` fixture comes from `tests/conftest.py`).

- [ ] **Step 1: Write the test**

```python
@needs_data
def test_postauto_on_the_map(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.length > 0 && window.__mm.mapBuses().marks.length > 0", timeout=120000)
        buses = page.evaluate("() => window.__mm.postauto().buses")
        got = page.evaluate("() => window.__mm.mapBuses()")
        assert len(got["marks"]) == len(buses)
        assert all(m["line"] == "133" and m["label"] is None for m in got["marks"])   # minimap: no label
        m = got["marks"][0]
        if 0 <= m["px"] <= 800 and 0 <= m["py"] <= 400:
            yellow = page.evaluate("""([x, y]) => { const d = document.getElementById('map').getContext('2d').getImageData(Math.round(x) - 6, Math.round(y) - 6, 12, 12).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 170 && d[i + 2] < 60) n++; return n; }""", [m["px"], m["py"]])
            assert yellow > 5
        page.keyboard.down("Tab")
        page.wait_for_function("() => window.__mm.mapBuses().full", timeout=10000)
        assert page.evaluate("() => window.__mm.mapBuses().marks.every(m => m.label === '133')")
        page.keyboard.up("Tab")
        assert errors == []
        b.close()
```

- [ ] **Step 2:** run once, foreground, `timeout=600000`: `python3 -m pytest tests/test_postauto_map.py -x -q`. Expect PASS (skips without the timetable data).
- [ ] **Step 3:** commit `test(map): Postauto marks on the map (#711)`.

### Task 4: Line 133 route on the full map [med]

**Files:** modify `index.html` only.

- [ ] **Step 1:** in `drawPostautoMarks(v)`, before the `for` loop, add:

```js
  if (MAP.full && POSTAUTO.ready) {
    mg.save(); mg.globalAlpha = 0.35; mg.lineWidth = 2; mg.lineJoin = 'round'; mg.strokeStyle = BUS_MARK.fill;
    for (const r of POSTAUTO.routes.values()) { mg.beginPath(); r.pts.forEach(([x, z], i) => { const [px, py] = mapPt(v, x, z); if (i) mg.lineTo(px, py); else mg.moveTo(px, py); }); mg.stroke(); }
    mg.restore();
  }
```

- [ ] **Step 2:** no new test (visual); rerun the Task 3 test (Tab held, no page errors). Commit `feat(map): faint line 133 route on the full map (#711)`.

### Task 5: Changelog

**Files:** modify `CHANGELOG.md`.

- [ ] Under `## [Unreleased]` add, in the player voice: `Die Postautos der Linie 133 sind jetzt auf der Minikarte und auf der grossen Karte (Tab) als gelbe Pfeile zu sehen; auf der grossen Karte steht die Linienummer dabei und die Strecke ist schwach eingezeichnet.` Commit `docs(changelog): Postautos on the map (#711)`.
