# Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A debug overlay, switched with **F3** or `?debug`, that shows the car's coordinates (game, LV95, WGS84) and the height data of nearby buildings, copies it all with one click, and lets later debug content plug in as sections and layers (#39).

**Architecture:** Pure helpers go into a new ES module `prototype/debug.js` (URL flag, LV95/WGS84, label text, panel lines), tested with `node --test`. `prototype/world.js` exports its roof-top rule as `roofTop` and passes the world `origin` through `layoutFromWorld`. `prototype/index.html` gets a `DEBUG` registry (`debugSection`, `debugLayer`), a panel `#debug`, the F3 key, the URL flag, a building-height sprite layer built like the house-number labels, a click-to-copy, and the `__mm.debug()` test hook.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, pure ES modules (`node --test`), Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-02-debug-mode-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write the failing test first, watch it fail, implement minimally to pass, verify green. Never edit a test to make it pass.
- **Key: F3 only.** Do not bind `G` (reserved by #48 Gemeinde boundaries) or `B` (#24). Do not change any existing binding.
- Default off; `?debug` (or `?debug=<anything but 0/false/off/no>`) switches it on at load; nothing goes into `localStorage`.
- Toasts exactly: `Debug on`, `Debug off`, `Copied`, `Copy failed`.
- Label text exactly `heightText`: `<h.toFixed(1)> m[ +<rh.toFixed(1)>] <hsrc or 'osm'>`, e.g. `22.8 m +1.2 dsm`, `12.0 m osm`. Labels within **60 m**, at most **40**, refreshed every **250 ms**, at `terrainH + roofTop + 4`.
- Panel lines exactly `positionLines` / `buildingLines` (see Task 2). Copy text = lines joined with ` | `.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency (no proj4).
- New prototype code must **not** call `rr()` or `rnd()` (the seeded RNG drives house colours and trees).
- No world rebuild: `origin`, `h`, `rh`, `hsrc` are already in `data/world_hochrhein.json`. Do not touch `data/` or `pipeline/`.
- New files: `prototype/debug.js`, `prototype/tests/debug.test.mjs`, `prototype/tests/test_debug.py`. Existing tests stay unchanged and green (only `world.test.mjs` gets two new tests appended and one name added to its import).
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -q` — slow (about 3 minutes), **foreground only, never `run_in_background`**. Exit 137 = memory cap hit: stop and report. Without `systemd-run --user` (CI runner) run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- F3 must not reach the browser ("find next"): `e.preventDefault()` in the handler, like F1. Pinned by `test_f3_toggles_the_panel_and_the_hand_layout_has_no_lv95` (toggle works) — the browser default itself is a manual check.
- Turning debug off must hide every debug sprite and leave the house-number labels (`LABELS`) alone. Pinned by `test_coordinates_and_building_heights_near_the_car` (`sprites === 0`, `labelSprites` unchanged).
- The hand-traced layout (no world file, `L === null`): no crash, `LV95 —`, `bldg —`, no sprites. Pinned by the F3 test.
- `roofTop` is a pure extraction: `addrLabels` must return exactly what it did. Pinned by the existing `addrLabels` test plus the new `roofTop` test.
- LV95 is an exact shift (`E = origin.E + x`, `N = origin.N − z`, z points south). Pinned in Task 2 and in the Playwright test (`E − x == origin.E`, `N + z == origin.N`).

---

## File map

- `prototype/world.js`: `layoutFromWorld` (~L67-69) gains `origin`; `addrLabels`' inline `top` (~L114-117) becomes the exported `roofTop`.
- `prototype/debug.js` (new): pure helpers.
- `prototype/index.html`: CSS after `#roadname{…}` (~L33); `#debug` div after `#stylebtn` (~L146); F1 help line after `M` (~L117); import after the `world.js` import (~L192); F3 in the `keydown` listener (~L816); the `DEBUG` block right before `function hud(dt)` (~L962); `debugTick()` call at the end of `hud(dt)`.
- `prototype/tests/world.test.mjs`, `prototype/tests/debug.test.mjs` (new), `prototype/tests/test_debug.py` (new).
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `236cc61`; verify with `grep -n` before editing (other PRs, e.g. #41/#48, may have shifted them).

---

### Task 1: `roofTop` and `origin` in `world.js`

**Files:**
- Modify: `prototype/world.js`
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- Produces: `export function roofTop(b)` (number: roof top above the base, as `addrLabels` computed it); `layoutFromWorld(w).origin` (`w.origin` or `null`).

- [ ] **Step 1: Write the failing tests.** In `prototype/tests/world.test.mjs` add `roofTop` to the import from `'../world.js'` (end of the list), then append:

```js
test('roofTop: measured ridge, gable guess, flat roofs at least 3 m', () => {
  assert.equal(roofTop({ h: 20, rh: 1.5, roof: 'flat', rect: [0, 0, 60, 22, 0] }), 21.5);
  assert.equal(roofTop({ h: 6, roof: 'gable', rect: [0, 0, 12, 8, 0] }), 6 + 0.4 * 8);
  assert.equal(roofTop({ h: 2, roof: 'flat', rect: [0, 0, 10, 10, 0] }), 3);
});

test('layoutFromWorld passes origin and defaults to null', () => {
  const base = { roads: [], junctions: [], water: [], buildings: [], rail: [], bbox: [0, 0, 1, 1], waterSdf: { x0: 0, z0: 0, step: 8, w: 1, h: 1, data: 'AA==' }, anchors: { landmarks: {}, cps: [], labels: [], areas: {} } };
  assert.equal(layoutFromWorld(base).origin, null);
  const origin = { lat: 47.5506, lon: 7.9671, E: 2639781.3, N: 1266787.1, crs: 'EPSG:2056' };
  assert.deepEqual(layoutFromWorld({ ...base, origin }).origin, origin);
});
```

- [ ] **Step 2: Run and expect FAIL.** `node --test prototype/tests/*.test.mjs` → the import fails (`does not provide an export named 'roofTop'`).

- [ ] **Step 3: Implement.** In `prototype/world.js`, replace the comment + first two lines of `addrLabels`:

```js
// #12: house-number labels (OSM addr) at the footprint centre; top = roof top above the base, as osmBuilding draws it (roughly)
export function addrLabels(buildings, landmarks = {}) {
  const top = b => typeof b.rh === 'number' ? b.h + b.rh : b.roof === 'gable' ? b.h + 0.4 * Math.min(b.rect[2], b.rect[3]) : Math.max(b.h, 3);
  return [...buildings.filter(b => b.addr).map(b => ({ t: b.addr, x: b.rect[0], z: b.rect[1], top: top(b) })),
```

with

```js
// roof top above the base, as osmBuilding draws it (roughly); shared by the house-number (#12) and debug height (#39) labels
export function roofTop(b) { return typeof b.rh === 'number' ? b.h + b.rh : b.roof === 'gable' ? b.h + 0.4 * Math.min(b.rect[2], b.rect[3]) : Math.max(b.h, 3); }
// #12: house-number labels (OSM addr) at the footprint centre
export function addrLabels(buildings, landmarks = {}) {
  return [...buildings.filter(b => b.addr).map(b => ({ t: b.addr, x: b.rect[0], z: b.rect[1], top: roofTop(b) })),
```

and in `layoutFromWorld` change the end of the returned object from `sources: w.sources || [] };` to `sources: w.sources || [], origin: w.origin || null };`.

- [ ] **Step 4: Run and expect PASS.** `node --test prototype/tests/*.test.mjs` → all pass (the existing `addrLabels` test unchanged).

- [ ] **Step 5: Commit.** `git add prototype/world.js prototype/tests/world.test.mjs && git commit -m "refactor(world): export roofTop and pass the world origin (#39)"`

---

### Task 2: Pure debug helpers `prototype/debug.js`

**Files:**
- Create: `prototype/debug.js`
- Test: `prototype/tests/debug.test.mjs` (new)

**Interfaces:**
- Consumes: `roofTop` (Task 1).
- Produces: `debugFromQuery(search) → bool`; `gameToLv95(origin, x, z) → {E, N} | null`; `lv95ToWgs84(E, N) → {lat, lon}`; `debugPosition(origin, x, z) → {x, z, E, N, lat, lon}` (the last four `null` without an origin); `heightText(b) → string`; `heightLabels(buildings) → [{t, x, z, top, id}]`; `positionLines(pos, y, bearing) → string[]`; `buildingLines(label?) → string[]`; `copyText(lines) → string`.

- [ ] **Step 1: Write the failing test** `prototype/tests/debug.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debugFromQuery, gameToLv95, lv95ToWgs84, debugPosition, heightText, heightLabels, positionLines, buildingLines, copyText } from '../debug.js';

const ORIGIN = { lat: 47.5506, lon: 7.9671, E: 2639781.3458206826, N: 1266787.080520644, crs: 'EPSG:2056' };   // data/world_hochrhein.json

test('debugFromQuery: ?debug and ?debug=1 switch on, 0/false/off/no and no flag leave it off', () => {
  for (const q of ['?debug', '?debug=1', '?debug=on', '?x=1&debug', '?debug=TRUE']) assert.equal(debugFromQuery(q), true, q);
  for (const q of ['', '?', '?debug=0', '?debug=false', '?debug=Off', '?debug=no', '?debugx=1']) assert.equal(debugFromQuery(q), false, q);
});

test('gameToLv95: exact shift by the origin, z points south; null without an origin', () => {
  assert.deepEqual(gameToLv95({ E: 2600000, N: 1200000 }, 10.5, -20), { E: 2600010.5, N: 1200020 });
  assert.equal(gameToLv95(null, 1, 2), null);
  assert.equal(gameToLv95({ lat: 47, lon: 8 }, 1, 2), null);
});

test('lv95ToWgs84: the world origin comes back within 1e-5 degrees', () => {
  const { lat, lon } = lv95ToWgs84(ORIGIN.E, ORIGIN.N);
  assert.ok(Math.abs(lat - ORIGIN.lat) < 1e-5, String(lat));
  assert.ok(Math.abs(lon - ORIGIN.lon) < 1e-5, String(lon));
});

test('debugPosition: game, LV95 and WGS84 together; nulls without an origin', () => {
  const p = debugPosition(ORIGIN, 0, 0);
  assert.equal(p.E, ORIGIN.E); assert.equal(p.N, ORIGIN.N);
  assert.ok(Math.abs(p.lat - ORIGIN.lat) < 1e-5 && Math.abs(p.lon - ORIGIN.lon) < 1e-5);
  assert.deepEqual(debugPosition(null, 3, 4), { x: 3, z: 4, E: null, N: null, lat: null, lon: null });
});

test('heightText: eaves, measured ridge, source; osm when unmeasured', () => {
  assert.equal(heightText({ h: 22.8, rh: 1.2, hsrc: 'dsm' }), '22.8 m +1.2 dsm');
  assert.equal(heightText({ h: 5, rh: 0, hsrc: 'dsm' }), '5.0 m +0.0 dsm');
  assert.equal(heightText({ h: 12 }), '12.0 m osm');
});

test('heightLabels: one per building at the rect centre, roof-top height, id kept', () => {
  const B = [{ id: 7, h: 20, rh: 1.5, hsrc: 'dsm', roof: 'flat', rect: [10, 20, 60, 22, 0] }, { id: 8, h: 6, roof: 'gable', rect: [1, 2, 12, 8, 0] }];
  assert.deepEqual(heightLabels(B), [{ t: '20.0 m +1.5 dsm', x: 10, z: 20, top: 21.5, id: 7 }, { t: '6.0 m osm', x: 1, z: 2, top: 6 + 0.4 * 8, id: 8 }]);
  assert.deepEqual(heightLabels([]), []);
});

test('positionLines: game x/z/y and heading, then LV95 and WGS84; LV95 — without an origin', () => {
  const p = { x: 1234.54, z: -253.26, E: 2641015.9, N: 1267040.3, lat: 47.552843, lon: 7.983451 };
  assert.deepEqual(positionLines(p, 312.44, 86.6), ['x 1234.5  z -253.3  y 312.4  87°', 'LV95 2641016 / 1267040', 'WGS84 47.552843, 7.983451']);
  assert.deepEqual(positionLines({ x: 1, z: 2, E: null, N: null, lat: null, lon: null }, 0, 0), ['x 1.0  z 2.0  y 0.0  0°', 'LV95 —']);
});

test('buildingLines and copyText', () => {
  assert.deepEqual(buildingLines({ id: 171822634, t: '22.8 m +1.2 dsm' }), ['bldg 171822634 · 22.8 m +1.2 dsm']);
  assert.deepEqual(buildingLines(undefined), ['bldg —']);
  assert.equal(copyText(['a', 'b c']), 'a | b c');
});
```

- [ ] **Step 2: Run and expect FAIL.** `node --test prototype/tests/*.test.mjs` → `debug.test.mjs` fails (`Cannot find module '…/prototype/debug.js'`).

- [ ] **Step 3: Implement** `prototype/debug.js`:

```js
// #39: pure helpers for the debug overlay (F3 / ?debug) -- no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
import { roofTop } from './world.js';

const OFF = new Set(['0', 'false', 'off', 'no']);
export function debugFromQuery(search) {
  const p = new URLSearchParams(search);
  return p.has('debug') && !OFF.has(p.get('debug').toLowerCase());
}

// the game frame is LV95 shifted to the world origin, x east, z south (pipeline/geo.py Frame.lv95_to_game)
export function gameToLv95(origin, x, z) {
  if (!origin || typeof origin.E !== 'number' || typeof origin.N !== 'number') return null;
  return { E: origin.E + x, N: origin.N - z };
}
// swisstopo's approximate formulas LV95 -> WGS84 (under 1 m off in Switzerland)
export function lv95ToWgs84(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return { lat: lat * 100 / 36, lon: lon * 100 / 36 };
}
export function debugPosition(origin, x, z) {
  const lv = gameToLv95(origin, x, z);
  if (!lv) return { x, z, E: null, N: null, lat: null, lon: null };
  return { x, z, ...lv, ...lv95ToWgs84(lv.E, lv.N) };
}

// data values, not the drawn height: eaves h, +ridge rh when measured, source ('osm' = OSM tag, levels or type default)
export function heightText(b) {
  const ridge = typeof b.rh === 'number' ? ` +${b.rh.toFixed(1)}` : '';
  return `${b.h.toFixed(1)} m${ridge} ${b.hsrc || 'osm'}`;
}
export function heightLabels(buildings) {
  return buildings.map(b => ({ t: heightText(b), x: b.rect[0], z: b.rect[1], top: roofTop(b), id: b.id }));
}

export function positionLines(pos, y, bearing) {
  const head = `x ${pos.x.toFixed(1)}  z ${pos.z.toFixed(1)}  y ${y.toFixed(1)}  ${Math.round(bearing)}°`;
  if (pos.E === null) return [head, 'LV95 —'];
  return [head, `LV95 ${Math.round(pos.E)} / ${Math.round(pos.N)}`, `WGS84 ${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)}`];
}
export function buildingLines(label) { return [label ? `bldg ${label.id} · ${label.t}` : 'bldg —']; }
export function copyText(lines) { return lines.join(' | '); }
```

- [ ] **Step 4: Run and expect PASS.** `node --test prototype/tests/*.test.mjs` → all pass.

- [ ] **Step 5: Commit.** `git add prototype/debug.js prototype/tests/debug.test.mjs && git commit -m "feat(prototype): pure debug helpers for coordinates and height labels (#39)"`

---

### Task 3: Debug overlay in `index.html` (F3, `?debug`, panel, height labels, copy)

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_debug.py` (new)

**Interfaces:**
- Consumes: Task 1 (`L.origin`), Task 2 (all helpers except `gameToLv95`/`lv95ToWgs84`, which `debugPosition` uses).
- Produces: `DEBUG`, `debugSection(fn)`, `debugLayer({ tick(x, z), hide() })`, `toggleDebug()`, `debugTick()`; `window.__mm.debug() → { on, lines, copy, pos, heights: [{t, id, d}], sprites }`.

- [ ] **Step 1: Write the failing test** `prototype/tests/test_debug.py`:

```python
"""#39: debug overlay (F3 or ?debug) with car coordinates and building heights. Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
BODENACKER_6 = 171822634


def open_page(p, server, block_world=False, query=""):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 960, "height": 540})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def height_text(b):
    ridge = f" +{b['rh']:.1f}" if isinstance(b.get("rh"), (int, float)) else ""
    return f"{b['h']:.1f} m{ridge} {b.get('hsrc') or 'osm'}"


def test_f3_toggles_the_panel_and_the_hand_layout_has_no_lv95(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        dbg = lambda: page.evaluate("() => window.__mm.debug()")
        start = dbg()["on"]; hidden_at_start = not page.is_visible("#debug")
        page.keyboard.press("F3")
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
        on = dbg(); shown = page.is_visible("#debug"); text = page.inner_text("#debug")
        page.keyboard.press("F3")
        off = dbg()["on"]; hidden_again = not page.is_visible("#debug")
        help_text = page.text_content("#help")
        br.close()
    assert start is False and hidden_at_start
    assert on["on"] is True and shown
    assert text.startswith("x ") and "LV95 —" in text and "bldg —" in text, text
    assert on["pos"]["E"] is None and on["heights"] == [] and on["sprites"] == 0
    assert off is False and hidden_again
    assert "F3" in help_text and "debug" in help_text.lower()


@pytest.mark.parametrize("query,expected", [("?debug", True), ("?debug=1", True), ("?debug=0", False)])
def test_url_flag_switches_debug_on_at_load(server, query, expected):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query=query)
        on = page.evaluate("() => window.__mm.debug().on")
        visible = page.is_visible("#debug")
        br.close()
    assert on is expected and visible is expected


@needs_world
def test_coordinates_and_building_heights_near_the_car(server):
    w = json.loads(WORLD.read_text(encoding="utf-8")); o = w["origin"]
    b = next(x for x in w["buildings"] if x["id"] == BODENACKER_6)
    want = height_text(b)
    cx, cz = b["rect"][0] + 20, b["rect"][1]
    with sync_playwright() as p:
        br, page = open_page(p, server, query="?debug")
        page.evaluate(f"() => window.__mm.place({cx}, {cz})")
        page.wait_for_function(f"() => window.__mm.debug().heights.some(l => l.id === {BODENACKER_6})", timeout=60000)
        dbg = page.evaluate("() => window.__mm.debug()")
        addr_before = page.evaluate("() => window.__mm.labelSprites()")
        page.keyboard.press("F3")
        page.wait_for_function("() => window.__mm.debug().sprites === 0", timeout=60000)
        addr_after = page.evaluate("() => window.__mm.labelSprites()")
        br.close()
    pos = dbg["pos"]
    assert abs(pos["E"] - pos["x"] - o["E"]) < 1e-6 and abs(pos["N"] + pos["z"] - o["N"]) < 1e-6, pos
    assert abs(pos["lat"] - o["lat"]) < 0.05 and abs(pos["lon"] - o["lon"]) < 0.05, pos
    assert f"LV95 {round(pos['E'])} / {round(pos['N'])}" in dbg["lines"], dbg["lines"]
    label = next(l for l in dbg["heights"] if l["id"] == BODENACKER_6)
    assert label["t"] == want and label["d"] <= 60, label
    assert 1 <= len(dbg["heights"]) <= 40 and dbg["sprites"] == len(dbg["heights"])
    near = dbg["heights"][0]
    assert f"bldg {near['id']} · {near['t']}" in dbg["lines"], dbg["lines"]
    assert addr_before > 0 and addr_after == addr_before                     # house numbers are not the debug layer


def test_click_on_the_panel_copies_one_line(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query="?debug")
        page.click("#startbtn")
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
        page.evaluate("() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; }")
        page.click("#debug")
        page.wait_for_function("() => window.__copied !== null", timeout=30000)
        copied = page.evaluate("() => window.__copied")
        lines = page.evaluate("() => window.__mm.debug().lines")
        toast = page.text_content("#toast")                               # CSS upper-cases the toast
        br.close()
    assert copied.startswith("x ") and " | LV95 —" in copied, copied
    assert copied.split(" | ")[0].split("  ")[0] == lines[0].split("  ")[0]    # same panel (the car may have moved a frame since)
    assert toast == "Copied"
```

- [ ] **Step 2: Run and expect FAIL.** Commit the test first and push, then run in the foreground: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -q` → every test fails with `TypeError: window.__mm.debug is not a function` (the world test is skipped if `data/world_hochrhein.json` is absent).

- [ ] **Step 3: CSS.** Insert a new line right after the `#roadname{…}` line (~L33):

```css
#debug{position:fixed;left:16px;bottom:calc(232px + env(safe-area-inset-bottom,0px));z-index:5;padding:6px 10px;background:rgba(20,23,29,.82);border:2px solid #3a404b;font:600 13px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#b6ff7a;white-space:pre;pointer-events:auto;cursor:copy}#debug[hidden]{display:none}
@media (max-width:900px){#debug{bottom:calc(162px + env(safe-area-inset-bottom,0px))}}
@media (pointer:coarse){#debug{bottom:auto;top:calc(120px + env(safe-area-inset-top,0px))}}
```

- [ ] **Step 4: Markup.** Right after `<button id="stylebtn" type="button">Style: <b id="stylename">Original</b> · T</button>` (~L146, still inside `#hud`) add:

```html
  <div id="debug" hidden title="Click to copy"></div>
```

- [ ] **Step 5: F1 help.** Right after the line `      <kbd>M</kbd><span>mute</span>` (~L117) add:

```html
      <kbd>F3</kbd><span>debug: coordinates, building heights (click the panel to copy · ?debug in the URL)</span>
```

- [ ] **Step 6: Import.** Right after the line `import { makeGrid, … facadeLabels } from './world.js';` (~L192) add:

```js
import { debugFromQuery, debugPosition, heightLabels, positionLines, buildingLines, copyText } from './debug.js';
```

- [ ] **Step 7: Key.** In the single `keydown` listener (~L816), right after `if (e.code === 'Escape') $('help').hidden = true; ` insert:

```js
if (e.code === 'F3') { e.preventDefault(); toggleDebug(); } 
```

- [ ] **Step 8: The `DEBUG` block.** Insert immediately **before** the line that starts with `function hud(dt) {` (~L962; at that point `$`, `toast`, `bearing`, `P`, `L`, `scene`, `textTex`, `terrainH` all exist):

```js
// #39: debug overlay (F3 or ?debug, not persisted). Extensible: debugSection(fn) adds panel lines, debugLayer({ tick(x, z), hide() }) adds world content.
const DEBUG = { on: false, t: 0, sections: [], layers: [], lines: [] };
function debugSection(fn) { DEBUG.sections.push(fn); }
function debugLayer(layer) { DEBUG.layers.push(layer); }
function toggleDebug() { DEBUG.on = !DEBUG.on; DEBUG.t = 0; $('debug').hidden = !DEBUG.on; if (!DEBUG.on) for (const l of DEBUG.layers) l.hide(); toast(DEBUG.on ? 'Debug on' : 'Debug off'); }
function debugTick() { if (!DEBUG.on || performance.now() - DEBUG.t < 250) return; DEBUG.t = performance.now(); for (const l of DEBUG.layers) l.tick(P.x, P.z); DEBUG.lines = DEBUG.sections.flatMap(fn => fn()); $('debug').textContent = DEBUG.lines.join('\n'); }
function copyDebug() { const text = copyText(DEBUG.lines); if (!navigator.clipboard) { toast('Copy failed'); return; } navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed')); }
$('debug').addEventListener('click', copyDebug);
// building heights (data h, +rh, hsrc) over the buildings within 60 m: own grid, sprite pool and LRU, built like the house numbers (LABELS)
const DEBUG_H = { grid: makeGrid(64), mat: new Map(), cap: 128, pool: [], shown: [] };
if (L) for (const it of heightLabels(L.buildings)) { it.y = terrainH(it.x, it.z) + it.top + 4; gridAdd(DEBUG_H.grid, it.x, it.z, it.x, it.z, it); }
for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(); s.scale.set(6.4, 1.2, 1); s.visible = false; DEBUG_H.pool.push(s); scene.add(s); }
function debugMat(t) { let m = DEBUG_H.mat.get(t); if (m) DEBUG_H.mat.delete(t); else m = new THREE.SpriteMaterial({ map: textTex(t, 512, 96, 'rgba(14,30,8,.85)', '#b6ff7a', '700 56px "Barlow Condensed", sans-serif', '#b6ff7a'), depthWrite: false }); DEBUG_H.mat.set(t, m); return m; }
function trimDebugMats() { const inUse = new Set(DEBUG_H.pool.filter(s => s.visible).map(s => s.material)); for (const [t, m] of DEBUG_H.mat) { if (DEBUG_H.mat.size <= DEBUG_H.cap) return; if (inUse.has(m)) continue; DEBUG_H.mat.delete(t); m.map.dispose(); m.dispose(); } }
debugLayer({
  tick(x, z) { DEBUG_H.shown = pickLabels(gridQuery(DEBUG_H.grid, x, z, 60), x, z, 60, 40); DEBUG_H.pool.forEach((s, i) => { const it = DEBUG_H.shown[i]; s.visible = !!it; if (it) { s.material = debugMat(it.t); s.position.set(it.x, it.y, it.z); } }); trimDebugMats(); },
  hide() { DEBUG_H.shown = []; for (const s of DEBUG_H.pool) s.visible = false; },
});
debugSection(() => positionLines(debugPosition(L && L.origin, P.x, P.z), P.y, bearing()));
debugSection(() => buildingLines(DEBUG_H.shown[0]));
window.__mm.debug = () => ({ on: DEBUG.on, lines: [...DEBUG.lines], copy: copyText(DEBUG.lines), pos: debugPosition(L && L.origin, P.x, P.z), heights: DEBUG_H.shown.map(l => ({ t: l.t, id: l.id, d: +l.d.toFixed(1) })), sprites: DEBUG_H.pool.filter(s => s.visible).length });
if (debugFromQuery(location.search)) toggleDebug();
```

- [ ] **Step 9: Tick.** At the very end of the `function hud(dt) { … }` one-liner, change ` drawMap(); }` to ` debugTick(); drawMap(); }`.

- [ ] **Step 10: Run and expect PASS.** Node tests `node --test prototype/tests/*.test.mjs`, then (foreground) `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -q` → 6 passed (5 without the world file). This plan's code was run against `main` @ `236cc61` in an enrichment dry run: 6 passed in about 3 minutes.

- [ ] **Step 11: Commit.** `git add prototype/index.html prototype/tests/test_debug.py && git commit -m "feat(prototype): debug overlay with coordinates and building heights (#39)"`

---

### Task 4: Docs, manual playtest entry and full verification

**Files:**
- Modify: `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` → `### Added`, append (player-facing voice, never regenerate the file with `git cliff -o`):

```markdown
- Press **F3** for a debug view for playtesting: the car's position (game metres, LV95 and WGS84) and the height of every building around you, floating above its roof — measured eaves and ridge, and where the number comes from. Click the panel to copy it all into a bug report. Adding `?debug` to the address opens the game with it on.
```

- [ ] **Step 2: test-todo.** Append a section:

```markdown
## Debug mode (#39)

- [ ] F3 next to Bodenackerstrasse 6: a green height label floats above the house number, readable from the chase camera; the panel bottom left shows x/z/y, LV95, WGS84 and the nearest building. F3 again: everything gone, and the browser's "find" did not open.
- [ ] Click the panel and paste into a bug report: the LV95 pair finds the spot in map.geo.admin.ch, the WGS84 pair in Google Maps.
- [ ] Phone: `…/prototype/index.html?debug` opens with the panel on, top left, clear of the steering buttons.
```

- [ ] **Step 3: Full verification (foreground).** `node --test prototype/tests/*.test.mjs`, then `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q` (several minutes) → all green. Open the page once in Playwright or a browser and confirm the console is empty with and without `?debug`.

- [ ] **Step 4: Commit.** `git add CHANGELOG.md test-todo.md && git commit -m "docs(changelog): debug mode with coordinates and building heights (#39)"`
