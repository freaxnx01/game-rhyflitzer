# Postauto display in the model's own slots (#713): implementation plan

**Goal:** One display per position (front, side, rear) on every Postauto, flush in the glTF's `Display` quads, showing line and destination; no floating plane, no baked "811 Sisseln".

**Spec:** [docs/superpowers/specs/2026-11-07-postauto-led-display-design.md](../specs/2026-11-07-postauto-led-display-design.md)

**Global constraints:**
- Buildless; `busdisplay.js` is pure (no DOM, no three.js). Do not touch `postauto.js`, `assets/bus.glb` or `tools/prepare-bus.mjs`.
- Do not modify the cached glTF materials (`SHARED_CAR_MATS`): `clone()` the `Display` material per bus.
- Tests: `node --test tests/busdisplay.test.mjs`, then full `node --test tests/`; Playwright **only** `tests/test_postauto.py` (foreground, generous timeout, one added test). Not the whole suite.
- CHANGELOG entry under `[Unreleased]` -> `### Fixed` (create it if absent), player/tester voice, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.
- Commit and push after each task.

### Task 1: pure module `busdisplay.js`

**Files:** `busdisplay.js` (new), `tests/busdisplay.test.mjs` (new)

**Interfaces:**
- `DISPLAY_TEX = { w: 1024, h: 128 }`
- `displayLayout({ line, dest }, measure, tex = DISPLAY_TEX) -> { line: { x, y, size }, dest: { x, y, size } }`, pixels in `tex`, text drawn with `textAlign = 'left'`, `textBaseline = 'alphabetic'`. `measure(text, size) -> width px`.
  - line: x = 0.016 * w, size starts at 0.75 * h and drops by 2 until `x + width <= 0.205 * w` (the rear window ends at u 0.22) or size 20.
  - dest: x = 0.254 * w, size starts at 0.75 * h and drops by 2 until `x + width <= 0.984 * w` or size 20.
  - both: y = 0.78 * h (baseline).

- [ ] **Write the failing test** (`tests/busdisplay.test.mjs`):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_TEX, displayLayout } from '../busdisplay.js';

const measure = (text, size) => text.length * size * 0.55;   // a fixed-width fake font

test('displayLayout_ShortTexts_KeepFullSize', () => {
  const l = displayLayout({ line: '133', dest: 'Frick' }, measure);
  assert.equal(l.line.size, 0.75 * DISPLAY_TEX.h);
  assert.equal(l.dest.size, 0.75 * DISPLAY_TEX.h);
});

test('displayLayout_LineNumber_StaysInsideTheRearWindow', () => {
  for (const line of ['7', '133', '811', '1234']) {
    const l = displayLayout({ line, dest: 'x' }, measure);
    assert.ok(l.line.x + measure(line, l.line.size) <= 0.205 * DISPLAY_TEX.w, line);
  }
});

test('displayLayout_LongDestination_ShrinksToFit', () => {
  const dest = 'Stein-Säckingen, Bahnhof (Umleitung über Rheinfelden)';
  const l = displayLayout({ line: '133', dest }, measure);
  assert.ok(l.dest.size < 0.75 * DISPLAY_TEX.h);
  assert.ok(l.dest.x + measure(dest, l.dest.size) <= 0.984 * DISPLAY_TEX.w);
});

test('displayLayout_Destination_StartsRightOfTheRearWindow', () => {
  const l = displayLayout({ line: '133', dest: 'Frick' }, measure);
  assert.ok(l.dest.x > 0.22 * DISPLAY_TEX.w);
});

test('displayLayout_ImpossibleWidth_StopsAtMinimumSize', () => {
  const l = displayLayout({ line: '133', dest: 'x'.repeat(500) }, measure);
  assert.equal(l.dest.size, 20);
});
```

- [ ] **Run it, see it fail** (`node --test tests/busdisplay.test.mjs`: module not found).
- [ ] **Write the minimum `busdisplay.js`** to make it pass (constants as named exports-free consts at the top, a small `fit(text, x, limit, measure, h)` helper shared by both fields).
- [ ] **Run it, see it pass**, then `node --test tests/`. Commit `feat(postauto): pure layout for the bus display texture (#713)`.

### Task 2: retexture the Display material in `buildPostautoMesh`

**Files:** `index.html`

**Interfaces:**
- `import { DISPLAY_TEX, displayLayout } from './busdisplay.js';` next to the `./postauto.js` import (`index.html:728`)
- `displayTexture({ line, dest }) -> THREE.CanvasTexture`: replaces `ledTexture` (`index.html:3880-3888`). Uses `makeTex(DISPLAY_TEX.w, DISPLAY_TEX.h, draw)`, then `tex.flipY = false` (glTF UVs; `makeTex` already sets `Repeat` wrap and sRGB). Draw: fill `#0a0a0a`, fill style `#ff9a1a`, font `700 <size>px "Barlow Condensed", sans-serif`, `measure = (s, size) => { g.font = ...; return g.measureText(s).width; }`, positions from `displayLayout`.
- `paintBusDisplay(root, text)`: traverses `root`; for every mesh whose `material.userData.overGlass` is true: `const m = o.material.clone(); m.map = m.emissiveMap = displayTexture(text); o.material = m;`. Returns the number of meshes painted; `buildPostautoMesh` throws nothing, but logs `console.warn('Postauto model has no Display material: no line/destination shown')` when it is 0 (Information log before, per the repo's logging rule: `console.info('Painting line 133 ... onto the bus display')`).
- `buildPostautoMesh` no longer creates `led` or the `PlaneGeometry`; `g.userData.led = ledText(trip)` stays (the existing test and hook read it).

- [ ] **Write the failing test first:** extend Task 3's Playwright test (written there) and run it to see it fail against the old plane (`planes` is 1, not 0).
- [ ] **Implement** the three changes above; delete `ledTexture` and the plane lines `index.html:3894-3895` (the `box` on line 3893 goes with them if nothing else reads it). Update the comment above `buildPostautoMesh` ("a clone of bus.glb ... an LED") to say the display is the model's own `Display` material, cloned per bus. `disposePostautoMesh` (`index.html:3903-3908`) needs no change: the cloned material is not in `SHARED_CAR_MATS`, so it and its `map` are freed.
- [ ] **Add the hook** next to `__mm.postauto` (`index.html:4432`):

```js
window.__mm.postautoDisplay = () => {   // #713: read-only, for the test
  const cached = GLTF_CARS.bus?.mats?.all.find((m) => m.name === 'Display') ?? null;
  return { cachedMapWidth: cached?.map?.image?.width ?? null,
    buses: [...POSTAUTO.meshes].map(([key, g]) => {
      const planes = [], displays = [];
      g.traverse((o) => { if (o.geometry?.type === 'PlaneGeometry') planes.push(o); if (o.isMesh && o.material?.userData?.overGlass) displays.push(o); });
      const m = displays[0]?.material;
      return { key, planes: planes.length, displays: displays.length, own: !!m && m !== cached, ownMap: !!m?.map && m.map !== cached?.map, flipY: m?.map?.flipY ?? null, led: g.userData.led };
    }) };
};
```

- [ ] **Commit** `fix(postauto): show line and destination in the model's own display slots (#713)`.

### Task 3: one Playwright test, CHANGELOG, look check

**Files:** `tests/test_postauto.py`, `CHANGELOG.md`

- [ ] **Add one test** to `tests/test_postauto.py`, reusing `open_at` and `needs_data` (see `test_postauto_drives_line_133_with_led`, `tests/test_postauto.py:31`):

```python
@needs_data
def test_postauto_display_uses_the_models_own_slot(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postautoDisplay().buses.length > 0", timeout=120000)
        d = page.evaluate("() => window.__mm.postautoDisplay()")
        assert d["cachedMapWidth"] == 512            # the shared baked texture is untouched
        for bus in d["buses"]:
            assert bus["planes"] == 0                # no floating plane any more
            assert bus["displays"] == 1 and bus["own"] and bus["ownMap"] and bus["flipY"] is False
            assert bus["led"]["line"] == "133" and bus["led"]["dest"]
        assert not errors
        b.close()
```

- [ ] **Run only it**, foreground: `python3 -m pytest tests/test_postauto.py -k display_uses -x` with a generous timeout (it needs `data/timetable_hochrhein.json`; skipped otherwise, then say so).
- [ ] **Look check (manual, one pass):** open `?patime=<a departure + 1 min>`, follow a bus with F3 > Postauto row, screenshot front, right side and rear at 1920x1080. Expected: one orange-on-black display per position, flush, `133` + destination, no "811 Sisseln". If the text is mirrored or upside down, check `flipY` and the wrap mode first.
- [ ] **CHANGELOG** under `[Unreleased]` -> `### Fixed`: the Postauto's line and destination now sit in the bus's own display (front, side and rear shows the line number) instead of floating in front of the windscreen on top of an old "811 Sisseln".
- [ ] **Full unit run** `node --test tests/`, commit `docs(changelog): Postauto display fix (#713)` and push.
