# Night Driving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **L** (or the „Time of day" button on the start screen) switches the scene to night and back in both graphic styles: dark sky, short dark fog, low ambient light, a moon instead of the sun. The car gets two real headlights with visible cones and glare, glowing tail lights; every OpenStreetMap street lamp glows and the six nearest lamps light the road. By day nothing extra is rendered. Not remembered across reloads (#2).

**Architecture:** A new pure module `prototype/night.js` holds the look (`NIGHT_LOOK`) and three helpers (`lighting`, `lampHeads`, `nearestLamps`), unit-tested with `node --test`. `prototype/index.html` gains `NIGHT = { on }`, `applyLighting()` (the sky / fog / hemi / sun lines move out of `applyStyle` into it), `toggleNight()`, a `LIGHTS` group (spot lights, cones, glare sprites) refilled by `buildLights(VEH)` on every car build and moved with the car by `stepNight()`, a `GLOWS` `Points` mesh for all lamp heads and a `LAMP_POOL` of six `PointLight`s moved to the nearest lamps every 250 ms. Strings through `tr()` (#9). Screenshots for a human to judge the look.

**Tech Stack:** vanilla JS + three.js r170 in the buildless `prototype/index.html`, pure ES modules (`node --test`), Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-night-driving-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write the failing test first, watch it fail, implement minimally to pass, verify green. Never edit a test to make it pass.
- **Do not change `stepCar`.** `test_vehicles.py::test_golden_trace_of_the_compact_car` pins it to 1e-6 and must stay green unchanged. `stepNight()` is called from `loop`, after `stepCamera`.
- Key **L** only. Do not touch Esc / P (#83), F / Shift (#10), B (#65).
- Constants exactly as in `NIGHT_LOOK` (Task 1). **By day every lighting value stays as today** — `lighting(key, style, false)` returns the style's own numbers; the day assertions in `test_night.py` pin them.
- `STYLES.*.fog` turns from a factory into plain data with the **same numbers** (`320 / 1400`, `0.00095`); the far plane (`index.html:803`) is untouched.
- No `castShadow` on any light. The lamp pool keeps all six lights in the scene at night (intensity 0 when unused) so the light count never changes within a night.
- All new UI text through `tr()`, en and de in `prototype/strings.js` (same keys — `strings.test.mjs` enforces it; Swiss spelling, no `ß`).
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency.
- New prototype code must **not** call `rr()` or `rnd()` (the seeded RNG drives house colours and trees); `makeTex` with a gradient draw is fine (the sun sprite does the same, `index.html:809`).
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_night.py -q` — slow (several minutes), **foreground only, never `run_in_background`**. Exit 137 = memory cap hit: stop and report. Without `systemd-run --user` (CI runner) run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- `applyLighting()` by day must reproduce today's sky, fog, hemi and sun exactly (pinned by `DAY_ORIGINAL` in `test_night.py` and by the unchanged `test_smoke.py` / `test_i18n.py`).
- `LIGHTS` is a **scene sibling** of `car`, not a child — the eye views set `car.visible = false` (`index.html:993`) and three.js skips invisible objects' lights. Pinned by `test_headlights_follow_the_car_and_the_views` (cockpit keeps the headlights, V hides them).
- The lamp pool never changes the number of lights in the scene at night (intensity 0, not `visible = false`): a changing light count recompiles every lit material.
- `buildCar` still runs `buildLights(VEH)` on every vehicle swap (`test_vehicles.py` swaps copies of compact).
- If `FLY` exists in `index.html` when this lands (#10 merged first), `LIGHTS.visible` also needs `&& !FLY.on` (Task 4 Step 7).

---

## File map

- Create: `prototype/night.js`, `prototype/tests/night.test.mjs`, `prototype/tests/test_night.py`, `docs/ai-notes/screenshots/2026-10-03-night/*.png`.
- Modify `prototype/strings.js`: four keys in `en` (~L96, ~L75) and `de` (~L191, ~L170).
- Modify `prototype/index.html`: F1 help line after the T line (~L124); `#nightbtn` in the overlay `.row` (~L186); `night.js` import after the `strings.js` import (~L205); night scene objects after the sun sprite (~L809); `lights` entry in `VEHICLES.compact` (~L831); `LIGHTS` / `GLARE` after `BLINK` (~L843); `buildLights` and the `buildCar` call (~L866); `STYLES` fog data (~L875, ~L877); `applyStyle` (~L881); `NIGHT` block after `toggleStyle` (~L894); `keydown` (~L889); `stepNight` + hooks after `stepCamera` (~L996); `rerenderAll` (~L1044); `loop` (~L1104).
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `188eb0f`; verify with `grep -n` before editing (other PRs may have shifted them).

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check the anchors exist exactly once.** From the repo root, each on its own:

```bash
grep -c "KeyL" prototype/index.html
grep -c "if (e.code === 'KeyT') toggleStyle();" prototype/index.html
grep -c "skyMat.uniforms.top.value.set(St.sky\[0\]); skyMat.uniforms.hor.value.set(St.sky\[1\]); scene.fog = St.fog(); hemi.intensity = St.hemi; sun.intensity = St.sunI; " prototype/index.html
grep -c "MODELS\[VEH.model\](car, VEH); car.traverse(o => { o.castShadow = true; }); blob.scale" prototype/index.html
grep -c "stepCamera(dt); window.__mm.physMs" prototype/index.html
grep -c "function rerenderAll() { applyStaticStrings(); renderStyleName();" prototype/index.html
grep -c "wheelR: 0.34," prototype/index.html
grep -c "FLY" prototype/index.html
```

Expected: `0 1 1 1 1 1 1 0`. If `KeyL` is already used, or an anchor is missing, STOP and report. If the last count is > 0, #10 has landed: note it for Task 4 Step 7.

- [ ] **Step 2: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass. Note the count.

---

### Task 1: Pure night module `prototype/night.js`

**Files:**
- Create: `prototype/night.js`
- Test: `prototype/tests/night.test.mjs`

**Interfaces:**
- Produces: `NIGHT_LOOK` (constants); `lighting(key, style, night, look = NIGHT_LOOK)` → `{ sky: [top, hor], fog: { color, near, far } | { color, density }, hemi: { colors: [sky, ground], intensity }, sun: { color, intensity }, sunSprite: bool }`; `lampHeads(props, groundAt, look = NIGHT_LOOK)` → `[{ x, y, z }]` for `kind === 'lamp'`; `nearestLamps(heads, x, z, n, reach)` → up to `n` heads within `reach`, nearest first (`heads` may be any iterable, e.g. a `Set` from `gridQuery`).
- `style` is a `STYLES` row (`{ sky, fog, hemi, sunI, … }`); `key` its name (`'original'` / `'smooth'`).

- [ ] **Step 1: Write the failing test** `prototype/tests/night.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_LOOK, lighting, lampHeads, nearestLamps } from '../night.js';

const ORIGINAL = { sky: ['#3d6fb5', '#e8bd8c'], fog: { color: '#e8bd8c', near: 320, far: 1400 }, hemi: 0.95, sunI: 0.75, shadows: false };
const SMOOTH = { sky: ['#5d9be0', '#f2d9c4'], fog: { color: '#f2d9c4', density: 0.00095 }, hemi: 0.55, sunI: 1.6, shadows: true };

test('NIGHT_LOOK: the agreed night look', () => {
  assert.deepEqual(NIGHT_LOOK, {
    original: { sky: ['#070b1a', '#1a2238'], fog: { color: '#1a2238', near: 200, far: 900 }, hemi: 0.18, sunI: 0.12 },
    smooth: { sky: ['#0b1430', '#2a3550'], fog: { color: '#2a3550', density: 0.0016 }, hemi: 0.12, sunI: 0.25 },
    hemiColors: { day: ['#dfe8ff', '#6a5a40'], night: ['#3a4a7a', '#101418'] },
    sunColor: { day: '#fff2d8', night: '#aab8ff' },
    headlight: { color: '#fff2cc', intensity: 150, distance: 60, angle: 0.42, penumbra: 0.6, decay: 2, aim: [40, -3], cone: { len: 14, r: 2.2, opacity: 0.1, tilt: 0.06 }, glare: 0.9 },
    tail: { glare: 0.5 },
    lamp: { color: '#ffe0b0', intensity: 40, distance: 25, decay: 2, pool: 6, reach: 60, head: [0.85, 5.8], glowSize: 2.5 },
  });
});

test('lighting by day: the style\'s own values, untouched, for any style key', () => {
  assert.deepEqual(lighting('original', ORIGINAL, false), { sky: ORIGINAL.sky, fog: ORIGINAL.fog, hemi: { colors: ['#dfe8ff', '#6a5a40'], intensity: 0.95 }, sun: { color: '#fff2d8', intensity: 0.75 }, sunSprite: true });
  assert.deepEqual(lighting('smooth', SMOOTH, false).fog, { color: '#f2d9c4', density: 0.00095 });
  assert.deepEqual(lighting('retro', ORIGINAL, false).sky, ORIGINAL.sky);
});

test('lighting at night: the night look of the style, moon instead of sun, sprite hidden', () => {
  assert.deepEqual(lighting('original', ORIGINAL, true), { sky: ['#070b1a', '#1a2238'], fog: { color: '#1a2238', near: 200, far: 900 }, hemi: { colors: ['#3a4a7a', '#101418'], intensity: 0.18 }, sun: { color: '#aab8ff', intensity: 0.12 }, sunSprite: false });
  assert.deepEqual(lighting('smooth', SMOOTH, true), { sky: ['#0b1430', '#2a3550'], fog: { color: '#2a3550', density: 0.0016 }, hemi: { colors: ['#3a4a7a', '#101418'], intensity: 0.12 }, sun: { color: '#aab8ff', intensity: 0.25 }, sunSprite: false });
  assert.throws(() => lighting('retro', ORIGINAL, true), /No night look for style 'retro'/);
});

test('lampHeads: the luminaire 0.85 m along the prop\'s +x (rotated like propMeshes) and 5.8 m above the ground; other kinds skipped', () => {
  const props = [{ kind: 'lamp', x: 10, z: 20, rot: 0 }, { kind: 'bench', x: 0, z: 0, rot: 0 }, { kind: 'lamp', x: 0, z: 0, rot: Math.PI / 2 }];
  const heads = lampHeads(props, (x, z) => x + z);
  assert.equal(heads.length, 2);
  assert.deepEqual(heads[0], { x: 10.85, y: 35.8, z: 20 });
  assert.ok(Math.abs(heads[1].x) < 1e-12 && Math.abs(heads[1].z - 0.85) < 1e-12 && heads[1].y === 5.8, JSON.stringify(heads[1]));
  assert.deepEqual(lampHeads([], () => 0), []);
});

test('nearestLamps: nearest first, at most n, nothing beyond reach, any iterable', () => {
  const H = [{ x: 30, y: 6, z: 0 }, { x: 5, y: 6, z: 0 }, { x: 0, y: 6, z: 12 }, { x: 100, y: 6, z: 0 }];
  assert.deepEqual(nearestLamps(H, 0, 0, 6, 60), [H[1], H[2], H[0]]);
  assert.deepEqual(nearestLamps(H, 0, 0, 2, 60), [H[1], H[2]]);
  assert.deepEqual(nearestLamps(new Set(H), 0, 0, 6, 10), [H[1]]);
  assert.deepEqual(nearestLamps([], 0, 0, 6, 60), []);
});
```

- [ ] **Step 2: Run it, watch it fail.** `node --test prototype/tests/*.test.mjs` → `night.test.mjs` fails with `Cannot find module '../night.js'`.

- [ ] **Step 3: Implement** `prototype/night.js`:

```js
// #2: night lighting -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// Colours are CSS hex strings (index.html turns them into THREE.Color with col()); light intensities are three r170 physical
// units (spot / point in candela); lengths in metres, angles in radians.
export const NIGHT_LOOK = {
  original: { sky: ['#070b1a', '#1a2238'], fog: { color: '#1a2238', near: 200, far: 900 }, hemi: 0.18, sunI: 0.12 },
  smooth: { sky: ['#0b1430', '#2a3550'], fog: { color: '#2a3550', density: 0.0016 }, hemi: 0.12, sunI: 0.25 },
  hemiColors: { day: ['#dfe8ff', '#6a5a40'], night: ['#3a4a7a', '#101418'] },
  sunColor: { day: '#fff2d8', night: '#aab8ff' },
  headlight: { color: '#fff2cc', intensity: 150, distance: 60, angle: 0.42, penumbra: 0.6, decay: 2, aim: [40, -3], cone: { len: 14, r: 2.2, opacity: 0.1, tilt: 0.06 }, glare: 0.9 },
  tail: { glare: 0.5 },
  lamp: { color: '#ffe0b0', intensity: 40, distance: 25, decay: 2, pool: 6, reach: 60, head: [0.85, 5.8], glowSize: 2.5 },
};

// what applyLighting sets for a style (a STYLES row) by day or at night. By day the style's own values come back untouched.
export function lighting(key, style, night, look = NIGHT_LOOK) {
  const n = night ? look[key] : null;
  if (night && !n) throw new Error(`No night look for style '${key}'`);
  const when = night ? 'night' : 'day';
  return { sky: n ? n.sky : style.sky, fog: n ? n.fog : style.fog, hemi: { colors: look.hemiColors[when], intensity: n ? n.hemi : style.hemi }, sun: { color: look.sunColor[when], intensity: n ? n.sunI : style.sunI }, sunSprite: !night };
}

// world position of every lamp's luminaire: head[0] along the prop's local +x (propMeshes rotates by -rot about y, so +x -> (cos rot, sin rot)), head[1] up
export function lampHeads(props, groundAt, look = NIGHT_LOOK) {
  const [ahead, up] = look.lamp.head;
  return props.filter(p => p.kind === 'lamp').map(p => ({ x: p.x + ahead * Math.cos(p.rot), y: groundAt(p.x, p.z) + up, z: p.z + ahead * Math.sin(p.rot) }));
}

// the n heads nearest to (x, z) within reach, nearest first
export function nearestLamps(heads, x, z, n, reach) {
  const out = [];
  for (const h of heads) { const d = Math.hypot(h.x - x, h.z - z); if (d <= reach) out.push({ h, d }); }
  return out.sort((a, b) => a.d - b.d).slice(0, n).map(o => o.h);
}
```

- [ ] **Step 4: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` → all pass (baseline + 5).

- [ ] **Step 5: Commit.**

```bash
git add prototype/night.js prototype/tests/night.test.mjs
git commit -m "feat(prototype): pure night lighting module (#2)"
```

---

### Task 2: Strings

**Files:**
- Modify: `prototype/strings.js`

**Interfaces:**
- Produces: string keys `keyNight`, `daytimeLabel`, `day`, `night` in `en` and `de`.

- [ ] **Step 1: Failing check.** `node -e "import('./prototype/strings.js').then(m => { for (const k of ['keyNight', 'daytimeLabel', 'day', 'night']) if (!(k in m.STRINGS.en) || !(k in m.STRINGS.de)) { console.error('missing ' + k); process.exit(1); } })"` → exits 1 (`missing keyNight`).

- [ ] **Step 2: Add the English keys** in `en`:
  - after `copyFailed: 'Copy failed',` (~L76): `  daytimeLabel: 'Time of day:',`, `  day: 'Day',`, `  night: 'Night',`
  - after `keyStyle: 'toggle graphic style',` (~L96): `  keyNight: 'day / night',`

- [ ] **Step 3: Add the German keys** in `de`, at the same places:
  - after `copyFailed: 'Kopieren fehlgeschlagen',` (~L172): `  daytimeLabel: 'Tageszeit:',`, `  day: 'Tag',`, `  night: 'Nacht',`
  - after `keyStyle: 'Grafikstil wechseln',` (~L191): `  keyNight: 'Tag / Nacht',`

- [ ] **Step 4: Verify.** The Step 1 command exits 0; `node --test prototype/tests/*.test.mjs` → all pass (`strings.test.mjs` checks same keys, no `ß`).

- [ ] **Step 5: Commit.** `git add prototype/strings.js` then `git commit -m "feat(i18n): day / night strings (#2)"`.

---

### Task 3: Failing browser tests `prototype/tests/test_night.py`

**Files:**
- Create: `prototype/tests/test_night.py`

**Interfaces:**
- Consumes (to be built in Task 4): `__mm.night()` → `{ on, sky: [topHex, horHex], fog: { type: 'linear' | 'exp2', color, near, far, density }, hemi, hemiColor, sun, sunColor, sunSprite, headlights, spots, cones, pos: [x, y, z], glows, glowsVisible, lampLights, lampsVisible }` (hex strings without `#`, as `Color.getHexString()` gives them); `__mm.toggleNight()`; the existing `__mm.hud().carVisible`, `__mm.car()`, `__mm.place(x, z)`, `__mm.counts.props.lamp`.

- [ ] **Step 1: Write the tests.**

```python
"""#2 night driving: L toggles a night lighting profile in both styles, the headlights follow the car and the camera
views, the street lamps glow and the nearest six light the road, nothing extra is rendered by day, nothing is remembered.
Hand-traced layout (world + terrain blocked) unless marked needs_world. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.night && document.querySelector('#worldstatus')?.textContent"
FRAMES = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
SISSELN_HAUPTSTRASSE = (1829, -284.5)       # a lit village street in the world file (zoom-18 anchor, index.html V())

DAY_ORIGINAL = {"sky": ["3d6fb5", "e8bd8c"], "fog": {"type": "linear", "color": "e8bd8c", "near": 320, "far": 1400, "density": None},
                "hemi": 0.95, "hemiColor": "dfe8ff", "sun": 0.75, "sunColor": "fff2d8", "sunSprite": True}
NIGHT_ORIGINAL = {"sky": ["070b1a", "1a2238"], "fog": {"type": "linear", "color": "1a2238", "near": 200, "far": 900, "density": None},
                  "hemi": 0.18, "hemiColor": "3a4a7a", "sun": 0.12, "sunColor": "aab8ff", "sunSprite": False}
NIGHT_SMOOTH = {"sky": ["0b1430", "2a3550"], "fog": {"type": "exp2", "color": "2a3550", "near": None, "far": None, "density": 0.0016},
                "hemi": 0.12, "hemiColor": "3a4a7a", "sun": 0.25, "sunColor": "aab8ff", "sunSprite": False}


def open_page(p, server, block_world=True, lang=None):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(locale="en-US", viewport={"width": 960, "height": 540})
    if lang:
        ctx.add_init_script(f"try {{ localStorage.setItem('gg-lang', '{lang}'); }} catch (e) {{}}")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") and server in m.location.get("url", "") else None)
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def night(page):
    return page.evaluate("() => window.__mm.night()")


def look(n):
    return {k: n[k] for k in DAY_ORIGINAL}


def text(page, sel):
    """textContent, not inner_text: #toast is text-transform: uppercase."""
    return page.evaluate("(s) => document.querySelector(s).textContent", sel)


def test_starts_by_day_and_l_toggles_night_and_back(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start = night(page)
        page.keyboard.press("KeyL"); page.evaluate(FRAMES)
        on = night(page); toast_on = text(page, "#toast")
        page.keyboard.press("KeyL"); page.evaluate(FRAMES)
        off = night(page); toast_off = text(page, "#toast")
        b.close()
    assert start["on"] is False and look(start) == DAY_ORIGINAL, start
    assert on["on"] is True and look(on) == NIGHT_ORIGINAL, on
    assert toast_on == "Night" and toast_off == "Day"
    assert off["on"] is False and look(off) == DAY_ORIGINAL, off
    assert errors == []


def test_t_at_night_keeps_night_in_the_other_style(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("KeyL"); page.keyboard.press("KeyT"); page.evaluate(FRAMES)
        smooth = night(page)
        page.keyboard.press("KeyT"); page.evaluate(FRAMES)
        original = night(page)
        page.keyboard.press("KeyL"); page.evaluate(FRAMES)
        day = night(page)
        b.close()
    assert smooth["on"] is True and look(smooth) == NIGHT_SMOOTH, smooth
    assert look(original) == NIGHT_ORIGINAL, original
    assert look(day) == DAY_ORIGINAL, day
    assert errors == []


def test_day_renders_nothing_extra(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn"); page.evaluate(FRAMES)
        n = night(page)
        b.close()
    assert n["on"] is False and n["headlights"] is False and n["lampsVisible"] is False and n["glowsVisible"] is False and n["lampLights"] == 0, n
    assert n["spots"] == 2 and n["cones"] == 2       # built with the car, just hidden
    assert errors == []


def test_headlights_follow_the_car_and_the_views(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn")
        page.keyboard.press("KeyL"); page.evaluate(FRAMES)
        chase = night(page)
        page.keyboard.press("KeyC"); page.keyboard.press("KeyC"); page.evaluate(FRAMES)      # cockpit: the car group is hidden
        cockpit = night(page); car_visible = page.evaluate("() => window.__mm.hud().carVisible")
        page.keyboard.press("KeyV"); page.evaluate(FRAMES)
        hidden = night(page)
        page.keyboard.press("KeyV"); page.evaluate(FRAMES)
        shown = night(page)
        page.evaluate(f"() => window.__mm.place({SISSELN_HAUPTSTRASSE[0]}, {SISSELN_HAUPTSTRASSE[1]})"); page.evaluate(FRAMES)
        moved = night(page); car = page.evaluate("() => window.__mm.car()")
        page.keyboard.press("KeyL"); page.evaluate(FRAMES)
        day = night(page)
        b.close()
    assert chase["headlights"] is True and chase["spots"] == 2 and chase["cones"] == 2, chase
    assert cockpit["headlights"] is True and car_visible is False, (cockpit, car_visible)
    assert hidden["headlights"] is False and shown["headlights"] is True
    assert abs(moved["pos"][0] - car["x"]) < 1e-6 and abs(moved["pos"][2] - car["z"]) < 1e-6 and abs(moved["pos"][1] - car["y"]) < 1e-6, (moved, car)
    assert day["headlights"] is False
    assert errors == []


@pytest.mark.parametrize("lang,day,night_label,toast,help_line", [
    (None, "Time of day: Day", "Time of day: Night", "Night", "day / night"),
    ("de", "Tageszeit: Tag", "Tageszeit: Nacht", "Nacht", "Tag / Nacht"),
])
def test_overlay_button_and_help(server, lang, day, night_label, toast, help_line):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, lang=lang)
        before = text(page, "#nightbtn")
        page.click("#nightbtn"); page.evaluate(FRAMES)
        after = text(page, "#nightbtn"); on = night(page)["on"]; shown_toast = text(page, "#toast")
        help_text = page.text_content("#help")
        b.close()
    assert before == day and after == night_label and on is True, (before, after, on)
    assert shown_toast == toast
    assert help_line in help_text, help_text
    assert errors == []


def test_not_remembered_across_a_reload(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("KeyL"); page.evaluate(FRAMES)
        on = night(page)["on"]
        page.reload(); page.wait_for_function(READY, timeout=240000)
        after = night(page)["on"]
        keys = page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('mm.'))")
        b.close()
    assert on is True and after is False
    assert "mm.night" not in keys and all(k in ("mm.odo", "mm.best2") for k in keys), keys
    assert errors == []


@needs_world
def test_lamps_glow_and_the_nearest_light_up(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, block_world=False)
        lamps = page.evaluate("() => window.__mm.counts.props.lamp")
        page.click("#startbtn")
        page.evaluate(f"() => window.__mm.place({SISSELN_HAUPTSTRASSE[0]}, {SISSELN_HAUPTSTRASSE[1]})")
        page.keyboard.press("KeyL")
        page.wait_for_function("() => window.__mm.night().lampLights > 0", timeout=60000)
        on = night(page)
        page.keyboard.press("KeyL"); page.evaluate(FRAMES)
        off = night(page)
        b.close()
    assert lamps > 1000 and on["glows"] == lamps and on["glowsVisible"] is True and on["lampsVisible"] is True, (lamps, on)
    assert 1 <= on["lampLights"] <= 6, on
    assert off["glowsVisible"] is False and off["lampsVisible"] is False and off["lampLights"] == 0, off
    assert errors == []
```

- [ ] **Step 2: Commit and push the branch** (before the long run): `git add prototype/tests/test_night.py`, `git commit -m "test(prototype): night driving browser tests (#2)"`, `git push -u origin HEAD`.

- [ ] **Step 3: Run, watch them fail** (foreground, see Global Constraints): `test_night.py` → every test fails on `READY` timing out or `window.__mm.night is not a function`. (The browser language is English: Playwright's context is created with `locale="en-US"`.)

---

### Task 4: Wire night into `prototype/index.html`

**Files:**
- Modify: `prototype/index.html`

**Interfaces:**
- Consumes: `NIGHT_LOOK`, `lighting`, `lampHeads`, `nearestLamps` (Task 1); string keys (Task 2).
- Produces: `NIGHT`, `applyLighting`, `toggleNight`, `renderDaytime`, `LIGHTS`, `GLARE`, `buildLights(v)`, `freeLights`, `GLOWS`, `LAMPS`, `LAMP_POOL`, `LAMP_HEADS`, `LAMP_GRID`, `stepNight`; hooks `__mm.night`, `__mm.toggleNight`; `VEHICLES.compact.lights`; `#nightbtn`.

- [ ] **Step 1: Import.** After `import { translate } from './strings.js';` (~L205) add:

```js
import { NIGHT_LOOK, lighting, lampHeads, nearestLamps } from './night.js';
```

- [ ] **Step 2: Markup.** In `#help` after the line `      <kbd>T</kbd><span data-i18n="keyStyle">toggle graphic style</span>` (~L124) add:

```html
      <kbd>L</kbd><span data-i18n="keyNight">day / night</span>
```

In the overlay `.row`, after `      <button id="stylebtn2" class="btn" type="button">Style: Original</button>` (~L186) add:

```html
      <button id="nightbtn" class="btn" type="button">Time of day: Day</button>
```

- [ ] **Step 3: Night scene objects.** After the `sunSprite` line (~L809, ends with `scene.add(sunSprite);`) add:

```js
// #2 night: a soft additive glare texture (headlights, tail lights, lamp glows); no rr(), so the seeded RNG sequence stays the same
const glareTex = (rgb) => makeTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 1, 32, 32, 32); r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(0.35, `rgba(${rgb},.5)`); r.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = r; g.fillRect(0, 0, w, h); }, { alpha: true });
// every OSM lamp head glows as one vertex of a single Points mesh; a pool of point lights follows the car to the nearest lamps (stepNight). Both hidden by day
const LAMP_HEADS = L ? lampHeads(L.props, terrainH) : [], LAMP_GRID = makeGrid(32); for (const h of LAMP_HEADS) gridAdd(LAMP_GRID, h.x, h.z, h.x, h.z, h);
const GLOWS = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(LAMP_HEADS.flatMap(h => [h.x, h.y, h.z]), 3)), new THREE.PointsMaterial({ map: glareTex('255,230,180'), size: NIGHT_LOOK.lamp.glowSize, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); GLOWS.visible = false; scene.add(GLOWS);
const LAMPS = new THREE.Group(), LAMP_POOL = []; LAMPS.visible = false; scene.add(LAMPS); for (let i = 0; i < NIGHT_LOOK.lamp.pool; i++) { const l = new THREE.PointLight(col(NIGHT_LOOK.lamp.color), 0, NIGHT_LOOK.lamp.distance, NIGHT_LOOK.lamp.decay); LAMP_POOL.push(l); LAMPS.add(l); }
```

- [ ] **Step 4: Vehicle table.** In `VEHICLES.compact` (~L831) after `wheelR: 0.34,` add ` lights: { head: [2.2, 0.82, 0.6], tail: [-2.24, 0.86, 0.62] },` (model metres, mirrored to ±z; the same spots the unlit boxes use in `buildCompact`).

- [ ] **Step 5: Car lights.** After the `BLINK` line (~L843, `const BLINK = …`) add:

```js
// #2: headlights, cones and glare live in LIGHTS, a scene sibling of the car -- the eye views hide the car group (lights included), stepNight moves LIGHTS with the car
const LIGHTS = new THREE.Group(); LIGHTS.visible = false; scene.add(LIGHTS);
const GLARE = { head: new THREE.SpriteMaterial({ map: glareTex('255,240,200'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), tail: new THREE.SpriteMaterial({ map: glareTex('255,60,40'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }) };
function freeLights() { LIGHTS.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); LIGHTS.clear(); }
// two spot lights (no shadows) aimed 40 m ahead and 3 m down, a translucent cone each, a glare sprite at every lamp; positions from the vehicle table (model metres)
function buildLights(v) { freeLights(); const H = NIGHT_LOOK.headlight, C = H.cone, [hx, hy, hz] = v.lights.head, [tx, ty, tz] = v.lights.tail; const coneG = new THREE.ConeGeometry(C.r, C.len, 16, 1, true), coneM = new THREE.MeshBasicMaterial({ color: col(H.color), transparent: true, opacity: C.opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); for (const s of [-1, 1]) { const spot = new THREE.SpotLight(col(H.color), H.intensity, H.distance, H.angle, H.penumbra, H.decay); spot.position.set(hx, hy, s * hz); spot.target.position.set(hx + H.aim[0], hy + H.aim[1], s * hz); const cone = new THREE.Mesh(coneG, coneM); cone.rotation.z = Math.PI / 2 - C.tilt; cone.position.set(hx + C.len / 2 * Math.cos(C.tilt), hy - C.len / 2 * Math.sin(C.tilt), s * hz); const hg = new THREE.Sprite(GLARE.head); hg.scale.setScalar(H.glare); hg.position.set(hx + 0.1, hy, s * hz); const tg = new THREE.Sprite(GLARE.tail); tg.scale.setScalar(NIGHT_LOOK.tail.glare); tg.position.set(tx - 0.1, ty, s * tz); LIGHTS.add(spot, spot.target, cone, hg, tg); } }
```

(The cone's apex sits at the headlight and its open base 14 m ahead, tilted `C.tilt` down: a rotation of `π/2 − tilt` about z turns the cone's +y axis to the rear-and-up, so the base points forward-and-down; `spot.target` is a child of `LIGHTS`, so its world matrix updates with the car.)

In `buildCar` (~L866) replace `MODELS[VEH.model](car, VEH); car.traverse(o => { o.castShadow = true; }); blob.scale` with `MODELS[VEH.model](car, VEH); car.traverse(o => { o.castShadow = true; }); buildLights(VEH); blob.scale` (the rest of the line unchanged).

- [ ] **Step 6: Styles and lighting.** In `STYLES` (~L875, ~L877) replace `fog: () => new THREE.Fog(col('#e8bd8c'), 320, 1400),` with `fog: { color: '#e8bd8c', near: 320, far: 1400 },` and `fog: () => new THREE.FogExp2(col('#f2d9c4'), 0.00095),` with `fog: { color: '#f2d9c4', density: 0.00095 },`.

In `applyStyle` (~L881) replace `skyMat.uniforms.top.value.set(St.sky[0]); skyMat.uniforms.hor.value.set(St.sky[1]); scene.fog = St.fog(); hemi.intensity = St.hemi; sun.intensity = St.sunI; ` with `applyLighting(); ` (one call, same place; `renderer.shadowMap.enabled = St.shadows;` follows unchanged).

After the `function toggleStyle() { … }` line (~L894) add:

```js
// #2 night: a lighting profile over the active style (night.js). NIGHT.on is not remembered, like the style. L toggles, so does #nightbtn (and the pause menu, #83, may call toggleNight)
const NIGHT = { on: false, t: 0 };
function applyLighting() { const Lt = lighting(styleKey, STYLES[styleKey], NIGHT.on); skyMat.uniforms.top.value.set(Lt.sky[0]); skyMat.uniforms.hor.value.set(Lt.sky[1]); scene.fog = Lt.fog.density ? new THREE.FogExp2(col(Lt.fog.color), Lt.fog.density) : new THREE.Fog(col(Lt.fog.color), Lt.fog.near, Lt.fog.far); hemi.color.set(Lt.hemi.colors[0]); hemi.groundColor.set(Lt.hemi.colors[1]); hemi.intensity = Lt.hemi.intensity; sun.color.set(Lt.sun.color); sun.intensity = Lt.sun.intensity; sunSprite.visible = Lt.sunSprite; GLOWS.visible = NIGHT.on && LAMP_HEADS.length > 0; LAMPS.visible = NIGHT.on; if (!NIGHT.on) for (const l of LAMP_POOL) l.intensity = 0; NIGHT.t = 0; renderDaytime(); }
function toggleNight() { NIGHT.on = !NIGHT.on; applyLighting(); toast(tr(NIGHT.on ? 'night' : 'day')); }
function renderDaytime() { document.getElementById('nightbtn').textContent = `${tr('daytimeLabel')} ${tr(NIGHT.on ? 'night' : 'day')}`; }
document.getElementById('nightbtn').onclick = toggleNight;
```

(`document.getElementById`, not `$`: `$` is declared further down (~L1001) and this block runs at module top level before it.)

- [ ] **Step 7: Keys.** In the `keydown` listener (~L889) replace `if (e.code === 'KeyT') toggleStyle();` with `if (e.code === 'KeyT') toggleStyle(); if (e.code === 'KeyL') toggleNight();`.

- [ ] **Step 8: Per-frame follow and the lamp pool.** After the `stepCamera` function (the line ending `sun.target.position.set(P.x, 0, P.z); }`, ~L996) add:

```js
// #2: LIGHTS rides on the car every frame (hidden with V, by day, and while flying once #10 is in); every 250 ms the lamp pool moves to the nearest lamps, unused lights stay at 0 so the light count never changes
function stepNight() { LIGHTS.position.copy(car.position); LIGHTS.quaternion.copy(car.quaternion); LIGHTS.scale.copy(car.scale); LIGHTS.visible = NIGHT.on && !HUD.carHidden; if (!NIGHT.on || performance.now() - NIGHT.t < 250) return; NIGHT.t = performance.now(); const near = nearestLamps(gridQuery(LAMP_GRID, P.x, P.z, NIGHT_LOOK.lamp.reach), P.x, P.z, LAMP_POOL.length, NIGHT_LOOK.lamp.reach); LAMP_POOL.forEach((l, i) => { const h = near[i]; l.intensity = h ? NIGHT_LOOK.lamp.intensity : 0; if (h) l.position.set(h.x, h.y, h.z); }); }
window.__mm.night = () => ({ on: NIGHT.on, sky: [skyMat.uniforms.top.value.getHexString(), skyMat.uniforms.hor.value.getHexString()], fog: { type: scene.fog.isFogExp2 ? 'exp2' : 'linear', color: scene.fog.color.getHexString(), near: scene.fog.near ?? null, far: scene.fog.far ?? null, density: scene.fog.density ?? null }, hemi: hemi.intensity, hemiColor: hemi.color.getHexString(), sun: sun.intensity, sunColor: sun.color.getHexString(), sunSprite: sunSprite.visible, headlights: LIGHTS.visible, spots: LIGHTS.children.filter(o => o.isSpotLight).length, cones: LIGHTS.children.filter(o => o.isMesh).length, pos: LIGHTS.position.toArray(), glows: GLOWS.geometry.attributes.position.count, glowsVisible: GLOWS.visible, lampLights: LAMP_POOL.filter(l => l.intensity > 0).length, lampsVisible: LAMPS.visible });
window.__mm.toggleNight = toggleNight;
```

If Task 0 found `FLY` in the file (#10 landed first), write `LIGHTS.visible = NIGHT.on && !HUD.carHidden && !FLY.on;` instead.

- [ ] **Step 9: Loop and re-render.** In `loop` (~L1104) replace `stepCamera(dt); window.__mm.physMs` with `stepCamera(dt); stepNight(); window.__mm.physMs`. In `rerenderAll` (~L1044) replace `function rerenderAll() { applyStaticStrings(); renderStyleName();` with `function rerenderAll() { applyStaticStrings(); renderStyleName(); renderDaytime();`.

- [ ] **Step 10: Run the new tests, watch them pass** (foreground): `test_night.py` → 8 passed (9 with the world file). If a test fails 3 times, STOP and report. Typical slips: `hemiColor` off by one hex digit (compare with `getHexString()` on both sides, never with the raw constant), `#nightbtn` text not re-rendered on load (`renderDaytime` must be in `rerenderAll`), the day fog `near`/`far` coming back as `undefined` instead of `null` (`?? null`).

- [ ] **Step 11: Commit and push.**

```bash
git add prototype/index.html
git commit -m "feat(prototype): night driving on L with headlights and glowing street lamps (#2)"
git push
```

---

### Task 5: Screenshots for a human to judge the look

**Files:** `docs/ai-notes/screenshots/2026-10-03-night/original-chase.png`, `smooth-chase.png`, `original-cockpit.png` (new).

The night colours, fog ranges and light intensities are a graphics judgement call (spec A5); a person decides whether it reads as night on the Hochrhein. Produce three screenshots on the real world file and commit them for the reviewer. Needs `data/world_hochrhein.json` (present on `main`).

- [ ] **Step 1: Take them.** Start `python3 -m http.server 8000` in the repo root (foreground in a second shell, or `conftest.py`'s server in a one-off pytest), then run this snippet in the **foreground** with the pipeline venv's Python:

```python
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("docs/ai-notes/screenshots/2026-10-03-night"); OUT.mkdir(parents=True, exist_ok=True)
X, Z = 1829, -284.5                                                   # Sisseln Hauptstrasse, a lit village street
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    page = br.new_page(viewport={"width": 960, "height": 540})
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto("http://127.0.0.1:8000/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.night && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    page.evaluate(f"() => window.__mm.place({X}, {Z})")
    page.keyboard.press("KeyL")
    page.wait_for_timeout(8000)                                       # headless renders well under 1 fps; let the chase camera settle
    page.screenshot(path=str(OUT / "original-chase.png"))
    page.keyboard.press("KeyT")
    page.wait_for_timeout(8000)
    page.screenshot(path=str(OUT / "smooth-chase.png"))
    page.keyboard.press("KeyT"); page.keyboard.press("KeyC"); page.keyboard.press("KeyC")   # back to original, cockpit view
    page.wait_for_timeout(8000)
    page.screenshot(path=str(OUT / "original-cockpit.png"))
    br.close()
```

If the car faces away from the lamps, place it a few metres further along the street (`X += 10`) and retake.

- [ ] **Step 2: Look at the three PNGs.** Expected: dark blue sky fading to a dark horizon, the road ahead lit in a warm pool with two faint cones, red tail glare in the chase views, a string of warm lamp glows along the Hauptstrasse with light pools under the nearest ones, houses dim but readable, the HUD unchanged. If the headlight pool is a blown-out white disc in the original style, lower `NIGHT_LOOK.headlight.intensity` (one place, Task 1 — update its test too) and retake. Leave the final judgement to the reviewer; note what was changed in the PR.

- [ ] **Step 3: Commit and push.**

```bash
git add docs/ai-notes/screenshots/2026-10-03-night
git commit -m "docs(prototype): night driving screenshots for review (#2)"
git push
```

---

### Task 6: Full suites, changelog, playtest note

**Files:**
- Modify: `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: Full suites** (foreground): `node --test prototype/tests/*.test.mjs` → all pass. Then the whole Playwright suite: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q` → all pass, in particular `test_vehicles.py` (golden trace), `test_smoke.py` (no console warnings by day), `test_i18n.py` unchanged. `test_rebuilds_free_gpu_memory` is known flaky (#64); re-run it alone once before reporting a failure.

- [ ] **Step 2: CHANGELOG.** Under `## [Unreleased]` → `### Added`, add as the first bullet (player-facing voice; never regenerate the file with `git cliff -o`):

```markdown
- Press **L** (or the „Time of day" button on the start screen) to drive at night: a dark sky, short fog and a pale moon in both graphic styles. Your car switches on its headlights — two real beams that light the road ahead, with a soft glare and red tail lights — and every street lamp from OpenStreetMap glows, the nearest ones throwing a pool of light onto the road. **L** again brings the day back; the game always starts by day.
```

- [ ] **Step 3: test-todo.** Append a section:

```markdown
## Night driving (#2)

- [ ] **L** on the start screen and while driving: does it read as night in both styles (T)? Is the fog too short or too long? Is the sky too black or too blue?
- [ ] Headlights: the road ahead is lit, the cones look like beams and not like two white triangles; the pool in front of the car is not a blown-out white disc (original style). Cockpit view (C ×2): you see your own beams.
- [ ] Street lamps on the Sisseln Hauptstrasse and in Bad Säckingen glow, the nearest ones light the road; do the light pools pop too visibly at speed?
- [ ] Phone: night keeps a playable frame rate (8 extra lights per pixel on everything lit).
- [ ] German: the F1 line, the button and the toasts read well. A reload starts by day again.
```

- [ ] **Step 4: Commit and push.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(prototype): changelog and playtest note for night driving (#2)"
git push
```
