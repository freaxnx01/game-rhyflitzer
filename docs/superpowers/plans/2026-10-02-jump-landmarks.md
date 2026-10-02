# Jump Dialog Landmark List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The J dialog becomes a searchable list of the game's 14 landmarks, filterable by Gemeinde, with game keys silenced while it is open.

**Architecture:** A new pure ES module `prototype/landmarks.js` holds the hand-kept names and Gemeinden and joins them with positions from the loaded world (anchor keys or building ids). `prototype/index.html` replaces the fixed `PLACES` list and digit shortcuts with a search field, Gemeinde chips and a list, and routes every keydown to the dialog while it is open.

**Tech Stack:** Vanilla JS ES modules + three.js in the buildless `prototype/index.html`; node `node:test` for pure helpers; Playwright (Python, pytest) for browser tests.

**Spec:** `docs/superpowers/specs/2026-10-02-jump-landmarks-design.md` (issue #41)

## Global Constraints

- Buildless: no framework, no bundler, no `package.json`, no new dependencies.
- `const`/`let` only; no `var`.
- No pipeline change and no edit of `data/world_hochrhein.json` — positions come from the world as it is.
- Landmark names, Gemeinden and sources exactly as the spec's landmark table (14 entries); `GEMEINDEN` order west → east: `Bad Säckingen`, `Stein`, `Münchwilen`, `Eiken`, `Sisseln`.
- Search folds case and accents (`normalize('NFD')`, strip `̀-ͯ`, lower-case), matches the **name only**, substring; search AND chip.
- Random spot is always the last row, never filtered out, shown as `{ n: 'Random spot', g: null }` by `window.__mm.jumpList()`.
- UI strings stay English: title `Jump to`, placeholder `Search landmarks`, chip `All`, hint `type to search · ↑↓ Enter · J / Esc closes`.
- Digit shortcuts `1–9`/`0` are removed.
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs`; browser tests `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q` (slow, several minutes — run in the **foreground**, never in the background). Full browser suite: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`.
- Commit and push the branch **before** starting the slow browser verification.

## Review Focus

- A game key typed into the search field (`r`, `c`, `m`, `w`, Space) must not reset the car, switch the camera, mute, drive or brake — covered in Task 2 (`test_game_keys_are_silent_while_the_dialog_is_open`).
- A driving key still held when J opens must not keep the car moving — Task 2 clears `keys` in `openJump()` (same test, `KeyW` held).
- Clicking a Gemeinde chip must leave focus in the search field so typing keeps filtering — Task 2 (`test_chip_filters_and_keeps_typing_in_the_field`).
- After a jump the hidden field must not keep focus, so game keys work again (`C` switches the camera) — Task 2 (`test_enter_jumps_and_game_keys_work_again`).
- A search with no match shows only Random spot, and Enter then does a random spot — Task 2 (`test_no_match_leaves_random_spot`).

---

### Task 1: `prototype/landmarks.js` — landmark data and pure helpers

**Files:**
- Create: `prototype/landmarks.js`
- Test: `prototype/tests/landmarks.test.mjs`

**Interfaces:**
- Consumes: world `anchors.landmarks` (`{ <key>: { x, z, kind, h, rot } }`) and world `buildings` (`[{ id, ring: [[x, z], …], … }]`; `id` may be a number or a numeric string).
- Produces:
  - `GEMEINDEN: string[]` — the five Gemeinden, west → east.
  - `LANDMARK_INFO: Array<{ name: string, gemeinde: string, anchor?: string, building?: number }>` — 14 entries, spec table order.
  - `foldText(s: string): string`
  - `landmarkEntries(info, anchors, buildings): Array<{ n: string, g: string, x: number, z: number }>` — skips entries whose source is missing; sorted by `GEMEINDEN` index, then `info` order.
  - `filterLandmarks(entries, query: string, gemeinde: string | null): entries` — `null` gemeinde = all, empty query = all.
  - `gemeindenOf(entries): string[]` — the `GEMEINDEN` that occur, in `GEMEINDEN` order.

- [ ] **Step 1: Write the failing test**

Create `prototype/tests/landmarks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEMEINDEN, LANDMARK_INFO, foldText, landmarkEntries, filterLandmarks, gemeindenOf } from '../landmarks.js';

const ANCHORS = { muenster: { x: -1331, z: -172.7 }, smileKreisel: { x: 1270, z: -148 } };
const BUILDINGS = [{ id: '171822634', ring: [[0, 0], [10, 0], [10, 20], [0, 20]] }];
const INFO = [
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Bodenackerstrasse 6c', gemeinde: 'Sisseln', building: 171822634 },
  { name: 'Fridolinsmünster', gemeinde: 'Bad Säckingen', anchor: 'muenster' },
  { name: 'Gone', gemeinde: 'Stein', anchor: 'notInWorld' },
  { name: 'Gone too', gemeinde: 'Eiken', building: 1 },
];

test('foldText drops accents and case', () => {
  assert.equal(foldText('Fridolinsmünster'), 'fridolinsmunster');
  assert.equal(foldText('MÜNST'), 'munst');
  assert.equal(foldText('Bad Säckingen'), 'bad sackingen');
});

test('landmarkEntries takes anchor positions and building ring means', () => {
  const e = landmarkEntries(INFO, ANCHORS, BUILDINGS);
  assert.deepEqual(e.find(x => x.n === 'Fridolinsmünster'), { n: 'Fridolinsmünster', g: 'Bad Säckingen', x: -1331, z: -172.7 });
  assert.deepEqual(e.find(x => x.n === 'Bodenackerstrasse 6c'), { n: 'Bodenackerstrasse 6c', g: 'Sisseln', x: 5, z: 10 });
});

test('landmarkEntries skips sources missing from the world', () => {
  const names = landmarkEntries(INFO, ANCHORS, BUILDINGS).map(x => x.n);
  assert.ok(!names.includes('Gone'));
  assert.ok(!names.includes('Gone too'));
  assert.equal(names.length, 3);
});

test('landmarkEntries orders west to east by Gemeinde, then by table order', () => {
  assert.deepEqual(landmarkEntries(INFO, ANCHORS, BUILDINGS).map(x => x.n), ['Fridolinsmünster', 'Smile-Kreisel', 'Bodenackerstrasse 6c']);
});

test('landmarkEntries copes with a world without anchors or buildings', () => {
  assert.deepEqual(landmarkEntries(INFO, undefined, undefined), []);
});

test('filterLandmarks searches names accent-blind and combines with the Gemeinde', () => {
  const e = landmarkEntries(INFO, ANCHORS, BUILDINGS);
  assert.deepEqual(filterLandmarks(e, 'munst', null).map(x => x.n), ['Fridolinsmünster']);
  assert.deepEqual(filterLandmarks(e, ' Münst ', null).map(x => x.n), ['Fridolinsmünster']);
  assert.deepEqual(filterLandmarks(e, '', 'Sisseln').map(x => x.n), ['Smile-Kreisel', 'Bodenackerstrasse 6c']);
  assert.deepEqual(filterLandmarks(e, 'smile', 'Sisseln').map(x => x.n), ['Smile-Kreisel']);
  assert.deepEqual(filterLandmarks(e, 'smile', 'Bad Säckingen'), []);
  assert.deepEqual(filterLandmarks(e, 'sisseln', null), []);   // Gemeinde is not searched, only names
  assert.equal(filterLandmarks(e, '', null).length, 3);
});

test('gemeindenOf lists the Gemeinden present, west to east', () => {
  assert.deepEqual(gemeindenOf(landmarkEntries(INFO, ANCHORS, BUILDINGS)), ['Bad Säckingen', 'Sisseln']);
});

test('LANDMARK_INFO holds the 14 landmarks of the spec', () => {
  assert.equal(LANDMARK_INFO.length, 14);
  for (const l of LANDMARK_INFO) {
    assert.ok(GEMEINDEN.includes(l.gemeinde), l.name);
    assert.ok(!!l.anchor !== !!l.building, `${l.name}: exactly one of anchor / building`);
  }
  assert.deepEqual(GEMEINDEN, ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln']);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.building).map(l => [l.name, l.building]),
    [['Bodenackerstrasse 6c', 171822634], ['Bodenackerstrasse 10B', 171822943]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/*.test.mjs`
Expected: FAIL — `Cannot find module '…/prototype/landmarks.js'` (the existing `world.test.mjs` still passes).

- [ ] **Step 3: Write the implementation**

Create `prototype/landmarks.js`:

```js
// The J dialog's landmarks (#41): names and Gemeinden kept by hand here, positions from the loaded world
// (an anchors.landmarks key or a world building id). Pure: no DOM, no three.js.
export const GEMEINDEN = ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln'];   // west → east

// Gemeinden verified against OpenStreetMap on 2026-10-02
export const LANDMARK_INFO = [
  { name: 'Fridolinsmünster', gemeinde: 'Bad Säckingen', anchor: 'muenster' },
  { name: 'Holzbrücke', gemeinde: 'Bad Säckingen', anchor: 'holzbruecke' },
  { name: 'Fridolinsbrücke', gemeinde: 'Bad Säckingen', anchor: 'fridolinsbruecke' },
  { name: 'Kirche Stein', gemeinde: 'Stein', anchor: 'steinChurch' },
  { name: 'Bahnhof Stein-Säckingen', gemeinde: 'Stein', anchor: 'stationStein' },
  { name: 'Plattform Sisslerfeld', gemeinde: 'Münchwilen', anchor: 'plattform' },
  { name: 'DSM-Kamin', gemeinde: 'Eiken', anchor: 'dsmChimney' },
  { name: 'Bahnhof Sisseln', gemeinde: 'Eiken', anchor: 'stationSisseln' },
  { name: 'DSM-Wasserturm', gemeinde: 'Sisseln', anchor: 'dsmWaterTower' },
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Hallenbad Sissila', gemeinde: 'Sisseln', anchor: 'hallenbad' },
  { name: 'Bodenackerstrasse 6c', gemeinde: 'Sisseln', building: 171822634 },
  { name: 'Bodenackerstrasse 10B', gemeinde: 'Sisseln', building: 171822943 },
  { name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp' },
];

export function foldText(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ringMean(ring) {
  let x = 0, z = 0;
  for (const [px, pz] of ring) { x += px; z += pz; }
  return { x: x / ring.length, z: z / ring.length };
}

function sourcePos(item, anchors, buildingsById) {
  if (item.anchor) {
    const a = anchors[item.anchor];
    return a ? { x: a.x, z: a.z } : null;
  }
  const b = buildingsById.get(Number(item.building));
  return b && b.ring && b.ring.length ? ringMean(b.ring) : null;
}

export function landmarkEntries(info, anchors, buildings) {
  const byId = new Map((buildings || []).map(b => [Number(b.id), b]));
  const found = [];
  info.forEach((item, i) => {
    const p = sourcePos(item, anchors || {}, byId);
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, i });
  });
  found.sort((a, b) => GEMEINDEN.indexOf(a.g) - GEMEINDEN.indexOf(b.g) || a.i - b.i);
  return found.map(({ i, ...entry }) => entry);
}

export function filterLandmarks(entries, query, gemeinde) {
  const q = foldText(query.trim());
  return entries.filter(e => (!gemeinde || e.g === gemeinde) && (!q || foldText(e.n).includes(q)));
}

export function gemeindenOf(entries) {
  const present = new Set(entries.map(e => e.g));
  return GEMEINDEN.filter(g => present.has(g));
}
```

Note: the test fixture ring `[[0,0],[10,0],[10,20],[0,20]]` is open (no repeated first vertex), so the mean is `(5, 10)`. Real world rings may repeat the first vertex; the slight bias is irrelevant because `jumpTo` snaps to the nearest road anyway.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/*.test.mjs`
Expected: PASS — all tests in `landmarks.test.mjs` and `world.test.mjs`.

- [ ] **Step 5: Check the real world resolves all 14 sources**

Run (repo root):

```bash
node --input-type=module -e "
import fs from 'node:fs';
import { LANDMARK_INFO, landmarkEntries } from './prototype/landmarks.js';
const w = JSON.parse(fs.readFileSync('data/world_hochrhein.json', 'utf8'));
const e = landmarkEntries(LANDMARK_INFO, w.anchors.landmarks, w.buildings);
console.log(e.length, e.map(x => x.n).join(' | '));"
```

Expected: `14 Fridolinsmünster | Holzbrücke | Fridolinsbrücke | Kirche Stein | Bahnhof Stein-Säckingen | Plattform Sisslerfeld | DSM-Kamin | Bahnhof Sisseln | DSM-Wasserturm | Smile-Kreisel | Hallenbad Sissila | Bodenackerstrasse 6c | Bodenackerstrasse 10B | Sprungschanze`. If fewer than 14, stop and report which source is missing — do not change the world file.

- [ ] **Step 6: Commit**

```bash
git add prototype/landmarks.js prototype/tests/landmarks.test.mjs
git commit -m "feat(prototype): landmark data and search helpers for the J dialog (#41)"
```

---

### Task 2: J dialog — search field, Gemeinde chips, list, key routing

**Files:**
- Modify: `prototype/index.html` — CSS `:35`, help lines `:112` and `:171`, markup `:120`, imports `:192`, keydown listener `:815`, `PLACES` `:843-844`, `placeOnRoad` `:847`, list fill `:928-929` (line numbers as of `main` @ `4db004a`; locate by the quoted text if they moved)
- Create: `prototype/tests/test_jump.py`
- Modify: `CHANGELOG.md`, `test-todo.md`

**Interfaces:**
- Consumes (Task 1): `LANDMARK_INFO`, `landmarkEntries(info, anchors, buildings)`, `filterLandmarks(entries, query, gemeinde)`, `gemeindenOf(entries)`.
- Consumes (existing): `jumpTo({ n, x, z })`, `randomSpot()`, `placeOnRoad(...)`, `keys`, `L` (layout or `null`), `CPS`, `FINISH`, `$`, `window.__mm.car()`, `window.__mm.place(x, z)`, `window.__mm.camView`.
- Produces: `window.__mm.jumpList(): Array<{ n: string, g: string | null }>` (rows currently shown, Random spot last); DOM ids `#jumpq` (search field), `#jumpchips` (chip buttons with `data-g`, `All` for all), `#jumplist` (`li` rows with `data-i`, selected row has class `sel`).

- [ ] **Step 1: Write the failing browser test**

Create `prototype/tests/test_jump.py`:

```python
"""#41: J opens a searchable landmark list with Gemeinde chips; game keys are silent while it is open.
Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
SISSELN_ROWS = ["DSM-Wasserturm", "Smile-Kreisel", "Hallenbad Sissila", "Bodenackerstrasse 6c", "Bodenackerstrasse 10B", "Sprungschanze"]


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")   # J only opens with the start overlay hidden
    return b, page


def rows(page):
    return page.evaluate("() => window.__mm.jumpList()")


def names(page):
    return [r["n"] for r in rows(page)]


def car(page):
    return page.evaluate("() => window.__mm.car()")


def anchor(name):
    lm = json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"][name]
    return lm["x"], lm["z"]


@needs_world
def test_j_opens_the_landmark_list_with_focus_in_the_search_field(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        assert page.is_visible("#jump")
        assert page.evaluate("() => document.activeElement.id") == "jumpq"
        r = rows(page)
        assert len(r) == 15
        assert r[0] == {"n": "Fridolinsmünster", "g": "Bad Säckingen"}
        assert r[-1] == {"n": "Random spot", "g": None}
        chips = page.eval_on_selector_all("#jumpchips button", "bs => bs.map(b => b.textContent)")
        assert chips == ["All", "Bad Säckingen", "Stein", "Münchwilen", "Eiken", "Sisseln"]
        page.keyboard.type("münst")
        assert names(page) == ["Fridolinsmünster", "Random spot"]
        page.fill("#jumpq", "")
        page.keyboard.type("MUNST")
        assert names(page) == ["Fridolinsmünster", "Random spot"]
        b.close()


@needs_world
def test_chip_filters_and_keeps_typing_in_the_field(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.click('#jumpchips button[data-g="Sisseln"]')
        assert names(page) == SISSELN_ROWS + ["Random spot"]
        assert page.evaluate("() => document.activeElement.id") == "jumpq"
        page.keyboard.type("bodenacker")
        assert names(page) == ["Bodenackerstrasse 6c", "Bodenackerstrasse 10B", "Random spot"]
        page.click('#jumpchips button[data-g="Stein"]')
        assert names(page) == ["Random spot"]
        page.click('#jumpchips button[data-g="All"]')
        assert names(page) == ["Bodenackerstrasse 6c", "Bodenackerstrasse 10B", "Random spot"]
        b.close()


@needs_world
def test_enter_jumps_and_game_keys_work_again(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("smile")
        page.keyboard.press("Enter")
        assert page.is_hidden("#jump")
        kx, kz = anchor("smileKreisel")
        c = car(page)
        assert math.hypot(c["x"] - kx, c["z"] - kz) < 60
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is True
        assert page.evaluate("() => document.activeElement.id") != "jumpq"
        view = page.evaluate("() => window.__mm.camView")
        page.keyboard.press("KeyC")
        assert page.evaluate("() => window.__mm.camView") != view
        b.close()


@needs_world
def test_arrows_move_the_selection_and_click_jumps(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.click('#jumpchips button[data-g="Stein"]')
        sel = lambda: page.text_content("#jumplist li.sel")
        assert sel().startswith("Kirche Stein")
        page.keyboard.press("ArrowDown")
        assert sel().startswith("Bahnhof Stein-Säckingen")
        page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown")   # Random spot, then wrap
        assert sel().startswith("Kirche Stein")
        page.keyboard.press("ArrowUp")
        assert sel().startswith("Random spot")
        page.click("#jumplist li:has-text('Bahnhof Stein-Säckingen')")
        assert page.is_hidden("#jump")
        sx, sz = anchor("stationStein")
        c = car(page)
        assert math.hypot(c["x"] - sx, c["z"] - sz) < 60
        b.close()


@needs_world
def test_game_keys_are_silent_while_the_dialog_is_open(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        kx, kz = anchor("smileKreisel")
        page.evaluate(f"() => window.__mm.place({kx}, {kz})")   # place() does not move the reset point
        page.keyboard.down("KeyW")                              # held while J opens
        page.keyboard.press("KeyJ")
        view = page.evaluate("() => window.__mm.camView")
        page.keyboard.type("rcm ")
        page.wait_for_timeout(1500)
        page.keyboard.up("KeyW")
        assert page.input_value("#jumpq") == "rcm "
        c = car(page)
        assert math.hypot(c["x"] - kx, c["z"] - kz) < 1.5, "R reset or W drove the car"
        assert page.evaluate("() => window.__mm.camView") == view, "C switched the camera"
        assert "Muted" not in (page.text_content("#toast") or ""), "M muted the sound"
        assert page.is_visible("#jump")
        b.close()


@needs_world
def test_j_types_with_text_and_closes_when_empty_esc_closes(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("j")                  # opening J was consumed; the field is empty, so this J closes
        assert page.is_hidden("#jump")
        page.keyboard.press("KeyJ")
        page.keyboard.type("bahnhof")
        page.keyboard.press("KeyJ")              # text in the field: J is a letter
        assert page.is_visible("#jump")
        assert page.input_value("#jumpq") == "bahnhofj"
        page.keyboard.press("Escape")
        assert page.is_hidden("#jump")
        page.keyboard.press("KeyJ")              # reopened: cleared, All, first row selected
        assert page.input_value("#jumpq") == ""
        assert len(rows(page)) == 15
        assert page.text_content("#jumpchips button.on") == "All"
        b.close()


@needs_world
def test_no_match_leaves_random_spot(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("xyzzy")
        assert rows(page) == [{"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        assert page.is_hidden("#jump")
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is True
        b.close()


def test_without_world_the_list_shows_the_race_points_and_no_chips(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True)
        page.keyboard.press("KeyJ")
        r = rows(page)
        assert len(r) == 7                       # 5 checkpoints + finish + Random spot
        assert all(x["g"] is None for x in r)
        assert r[-1]["n"] == "Random spot"
        assert page.eval_on_selector_all("#jumpchips button", "bs => bs.length") == 0
        b.close()
```

Note on `test_game_keys_are_silent_while_the_dialog_is_open`: `KeyW` goes down *before* the dialog opens, so it reaches the game handler (setting `keys.KeyW`) and never types into the field; `openJump()` must clear `keys`, otherwise the car drives off while the dialog is open.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q` (foreground, several minutes)
Expected: FAIL — `window.__mm.jumpList is not a function` in every test.

- [ ] **Step 3: Replace the dialog markup and CSS**

In `prototype/index.html`, replace line 35:

```css
#jump ol{margin:8px 0;padding-left:26px}#jump li{cursor:pointer;padding:3px 0}#jump li:hover{color:#ffc61a}#jump small{color:var(--steel-l)}
```

with:

```css
#jump{width:420px;max-width:calc(100vw - 32px);box-sizing:border-box}#jump input{width:100%;box-sizing:border-box;margin:8px 0 6px;padding:6px 8px;font:inherit;color:#fff;background:#0b0d12;border:2px solid #4a515e}
#jump .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}#jump .chips button{font:inherit;font-size:13px;color:#f5efe0;background:none;border:2px solid #4a515e;padding:2px 8px;cursor:pointer}#jump .chips button.on{background:#ffc61a;border-color:#ffc61a;color:#14171d}
#jump ul{list-style:none;margin:6px 0;padding:0;max-height:50vh;overflow-y:auto}#jump li{display:flex;justify-content:space-between;gap:12px;cursor:pointer;padding:3px 4px}#jump li span{color:var(--steel-l);font-weight:600}#jump li:hover,#jump li.sel{color:#ffc61a}#jump small{color:var(--steel-l)}
```

Replace line 120:

```html
  <div id="jump" hidden><div>Jump to</div><ol></ol><small>1–9, 0 or click · J / Esc closes</small></div>
```

with:

```html
  <div id="jump" hidden><div>Jump to</div><input id="jumpq" type="search" placeholder="Search landmarks" autocomplete="off" spellcheck="false" aria-label="Search landmarks"><div class="chips" id="jumpchips"></div><ul id="jumplist"></ul><small>type to search · ↑↓ Enter · J / Esc closes</small></div>
```

In the two help lines (`:112` `<kbd>J</kbd><span>jump to a place</span>` and `:171` `<kbd>N · J</kbd><span>nitro (hold) · jump to a place</span>`), replace `jump to a place` with `jump to a landmark`.

- [ ] **Step 4: Import the module**

After line 192 (`import { makeGrid, … } from './world.js';`) add:

```js
import { LANDMARK_INFO, landmarkEntries, filterLandmarks, gemeindenOf } from './landmarks.js';
```

- [ ] **Step 5: Route keys to the open dialog**

In the keydown listener (line 815), replace:

```js
addEventListener('keydown', e => { if (e.repeat) return; keys[e.code] = true;
```

with:

```js
addEventListener('keydown', e => { if (!$('jump').hidden) { jumpKey(e); return; } if (e.repeat) return; keys[e.code] = true;
```

In the same line, replace:

```js
if (e.code === 'KeyJ' && $('overlay').hidden) $('jump').hidden = !$('jump').hidden; else if (e.code === 'Escape') $('jump').hidden = true; else if (!$('jump').hidden && /^(Digit|Numpad)[0-9]$/.test(e.code) && !['+', '=', '-'].includes(e.key)) { const n = +e.code.slice(-1), p = PLACES[n - 1]; if (!n) randomSpot(); else if (p) jumpTo(p); }
```

with:

```js
if (e.code === 'KeyJ' && $('overlay').hidden) { e.preventDefault(); openJump(); }
```

(`preventDefault` keeps the opening `j` out of the freshly focused field.)

- [ ] **Step 6: Replace `PLACES` with the landmark entries and dialog logic**

Replace lines 843-844:

```js
// J: places to jump to (villages from the map labels, the railway stations; hand path: the race points), max 9 for the digit keys
const PLACES = (L ? [...L.anchors.labels.filter(l => l.t !== 'RHEIN').map(l => ({ n: l.t.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase()), x: l.x, z: l.z })), ...CPS.filter(c => c.n.startsWith('Bahnhof'))] : [...CPS, FINISH]).slice(0, 9);
```

with:

```js
// J: the 3D landmarks (landmarks.js), searched by name and filtered by Gemeinde; hand layout: the race points, no Gemeinde
const JUMP_ENTRIES = L ? landmarkEntries(LANDMARK_INFO, L.anchors.landmarks, L.buildings) : [...CPS, FINISH].map(c => ({ n: c.n, g: null, x: c.x, z: c.z }));
const JUMP = { q: '', g: null, sel: 0, rows: [] };
```

Replace in `placeOnRoad` (line 847) `$('jump').hidden = true;` with `closeJump();`.

Replace lines 928-929:

```js
$('jump').querySelector('ol').innerHTML = PLACES.map(p => `<li>${p.n}</li>`).join('') + '<li value="0">Random spot</li>';
$('jump').querySelectorAll('li').forEach((li, i) => li.onclick = () => PLACES[i] ? jumpTo(PLACES[i]) : randomSpot());
```

with:

```js
function jumpRows() { return [...filterLandmarks(JUMP_ENTRIES, JUMP.q, JUMP.g), { n: 'Random spot', g: null, random: true }]; }
function renderJump() {
  JUMP.rows = jumpRows(); JUMP.sel = Math.min(JUMP.sel, JUMP.rows.length - 1);
  $('jumplist').innerHTML = JUMP.rows.map((r, i) => `<li data-i="${i}"${i === JUMP.sel ? ' class="sel"' : ''}>${r.n}<span>${r.g || ''}</span></li>`).join('');
  $('jumpchips').innerHTML = L ? ['All', ...gemeindenOf(JUMP_ENTRIES)].map(g => `<button type="button" data-g="${g}"${(g === 'All' ? !JUMP.g : JUMP.g === g) ? ' class="on"' : ''}>${g}</button>`).join('') : '';
  $('jumplist').querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}
function openJump() { for (const k in keys) keys[k] = false; JUMP.q = ''; JUMP.g = null; JUMP.sel = 0; $('jumpq').value = ''; $('jump').hidden = false; renderJump(); $('jumpq').focus(); }
function closeJump() { $('jump').hidden = true; $('jumpq').blur(); }
function pickJump(i) { const r = JUMP.rows[i]; if (!r) return; if (r.random) randomSpot(); else jumpTo(r); }
function moveJumpSel(step) { const n = JUMP.rows.length; JUMP.sel = (JUMP.sel + step + n) % n; renderJump(); }
function jumpKey(e) {
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); moveJumpSel(e.code === 'ArrowDown' ? 1 : -1); return; }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); pickJump(JUMP.sel); return; }
  if (e.code === 'Escape' || (e.code === 'KeyJ' && !$('jumpq').value)) { e.preventDefault(); closeJump(); }
}
$('jumpq').addEventListener('input', () => { JUMP.q = $('jumpq').value; JUMP.sel = 0; renderJump(); });
$('jumplist').addEventListener('click', e => { const li = e.target.closest('li'); if (li) pickJump(+li.dataset.i); });
$('jumpchips').addEventListener('mousedown', e => e.preventDefault());   // keeps the focus (and the typing) in the search field
$('jumpchips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; JUMP.g = b.dataset.g === 'All' ? null : b.dataset.g; JUMP.sel = 0; renderJump(); });
window.__mm.jumpList = () => JUMP.rows.map(r => ({ n: r.n, g: r.g }));
```

Then confirm no stale reference is left: `grep -n "PLACES" prototype/index.html` must print nothing.

- [ ] **Step 7: Run the unit tests, then commit and push before the slow check**

Run: `node --test prototype/tests/*.test.mjs` — Expected: PASS.

```bash
git add prototype/index.html prototype/tests/test_jump.py
git commit -m "feat(prototype): searchable landmark list with Gemeinde chips in the J dialog (#41)"
git push -u origin HEAD
```

- [ ] **Step 8: Run the browser test to verify it passes**

Run (foreground, generous timeout): `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q`
Expected: PASS — 8 tests (7 skip only if `data/world_hochrhein.json` is missing, which it is not on `main`).

If `test_arrows_move_the_selection_and_click_jumps` or `test_enter_jumps_and_game_keys_work_again` fails only on the 60 m distance, print the car position and the nearest road distance before touching anything — `jumpTo` snaps to the nearest non-bridge, non-motorway road, so the threshold is about the data, not the dialog.

- [ ] **Step 9: Run the whole browser suite**

Run (foreground): `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`
Expected: PASS — the other tests (minimap double-click uses `jumpTo`/`placeOnRoad`) are unaffected.

- [ ] **Step 10: CHANGELOG and test-todo**

In `CHANGELOG.md` under `## [Unreleased]`, add a `### Changed` section after the `### Added` list (create it if absent) with:

```markdown
- **J** now opens a list of the landmarks — Fridolinsmünster, Holzbrücke, the DSM chimney, the Smile-Kreisel, Bodenackerstrasse 6c and more. Type part of a name (umlauts optional: "munster" finds the Münster) or pick a Gemeinde — Bad Säckingen, Stein, Münchwilen, Eiken, Sisseln — then press Enter or click. Keys typed into the search don't steer the car. The number keys are gone; **Random spot** is the last row.
```

In `test-todo.md`, append:

```markdown
## Landmark list in the J dialog (#41)

- [ ] J opens the list with the cursor in the search field; typing "münst" or "munst" leaves the Fridolinsmünster; Enter puts the car next to it.
- [ ] The Gemeinde chips filter (Sisseln: 6 landmarks); search and chip combine; Random spot is always the last row.
- [ ] While the dialog is open, R, C, M, W and Space do nothing to the car, camera or sound; after a jump they work again.
- [ ] On a phone-width window the chips wrap and the panel fits the screen.
```

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs: changelog and playtest list for the J landmark list (#41)"
git push
```
