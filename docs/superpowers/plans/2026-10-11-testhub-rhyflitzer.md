# Testhub — Rhyflitzer integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `game-rhyflitzer` a Testhub game: a dev-only loader for the shared `/testhub/client.js`, one jump target per **J** entry plus four hidden spots, a PNG-data-URL screenshot hook, and `{go: …}` tags in `test-todo.md`.

**Architecture:** A pure ES module `prototype/testhub-targets.js` turns the J entries and the hidden-spot coordinates into a list of `{id, label, kind, …}` targets (node-tested). `prototype/index.html` gets a classic-script loader (dev flag in `localStorage['gg-dev']`) and, at the end of the game module, a small wiring block that registers those targets with `window.ggTesthub` and routes every jump through the existing `placeOnRoad()` (so a race in progress is flagged exactly like a J jump). The X-photo code gets a one-shot "sink" so the same capture path can return a PNG data URL instead of downloading.

**Tech Stack:** Vanilla JS (ES modules, no build), `node --test` for pure modules, Playwright (pytest) for the browser.

**Spec:** `docs/superpowers/specs/2026-10-11-testhub-design.md` (this plan covers section 3 "Rhyflitzer integration", the game-side loader from section 2, and the Rhyflitzer test bullet; the hub page and `client.js` are a separate plan in `freaxnx01.github.io`). Closes #251 and #248 (#248's in-game dev list is superseded).

## Contract for the hub client

The hub plan (`freaxnx01.github.io`, `testhub/client.js`) MUST honour this so both sides match. The game side is written against exactly this.

1. **Global:** `client.js` defines `window.ggTesthub` with `register(id, fn, label)`, `onScreenshot(fn)`, `setInfo({game, version})`.
2. **Ready event:** immediately after defining `window.ggTesthub`, `client.js` dispatches `window.dispatchEvent(new Event('gg-testhub-ready'))`. The game handles both orders (script before or after the game module): if `window.ggTesthub` already exists it registers at once, otherwise it waits for that event (`{once: true}`). No polling anywhere.
3. **Late registration:** the game registers *after* the client's first `hello` (the client is loaded async). Therefore every call to `register` / `setInfo` / `onScreenshot` MUST (re-)announce: the client sends a fresh `{type:'hello', game, version, targets:[{id,label}]}` on the channel, debounced to the end of the current tick (e.g. `queueMicrotask` or `setTimeout(0)`) so the game's synchronous burst of ~35 `register` calls yields one hello.
4. **`register(id, fn, label)`:** `id` matches `/^[a-z0-9._-]+$/` (the game guarantees this); registering an existing id replaces it. `fn()` is called with no arguments on `go`; its return value is ignored (the game's jump functions are synchronous). If `fn` throws, the client answers `{type:'error', req?, message}`.
5. **`onScreenshot(fn)`:** `fn()` returns a `Promise<string>` resolving to a `data:image/png;base64,…` URL, or rejects with an `Error` (e.g. `screenshot already pending`, `photo failed`). The promise only settles after the game has rendered its next frame; in a hidden tab (rAF paused) it may never settle, so the hub's 10 s timeout from the spec is the safety net. The client forwards a rejection as `{type:'error', req, message}`.
6. **`setInfo`:** the game calls `setInfo({game:'rhyflitzer', version: window.GAME_VERSION})` (string like `"0.2.0"`, no leading `v`) once, before the `register` calls.
7. **Loader URL:** the game loads exactly `/testhub/client.js` (absolute path on the shared origin) as an async classic script, only when dev mode is on. The hub must serve that file at that path.
8. **Target ids the game provides:** `j.<slug>` for every J entry (slug rules in Task 1, e.g. `j.reservoir-huebel`, `j.suedspange-sisslerfeld`), plus `uw.boat`, `uw.car`, `hideout.gate`, `hideout.tower`. `hideout.*` exist only in the Hochrhein region with the real world loaded; `uw.*` exist in every layout.

## Global Constraints

- Buildless: no `package.json`, bundler, framework or new dependency (stack overlay "Agent Guardrails").
- Players load nothing from the Testhub: no `/testhub/client.js` request unless dev mode is on.
- No second version source: `version.js` is untouched (the hub reads `window.GAME_VERSION`).
- Target ids match `[a-z0-9._-]+` and are unique (spec section 1/2).
- A Testhub jump counts like a **J** jump: a race in progress is flagged (`R.jumped = true`), not counted.
- The browser is required for anything JS-driven at runtime: Playwright, **foreground only, never `run_in_background`** (stack overlay). First frame can take 30 s+; rAF can stall headless, so tests act via `page.evaluate`, never by waiting for animation.
- Run only the affected Playwright files, not the ~2 h full suite.
- Commit messages: Conventional Commits, end with the attribution lines from the session reminder. All changes land via PR (`feat/251-testhub-rhyflitzer` branch from `origin/main`); PR body contains `Closes #251` and `Closes #248`.
- CHANGELOG entry is short and framed "for testers" (the feature is dev-only).

Commands used below (repo root = your worktree):

```bash
PY=/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python
node --test prototype/tests/testhub-targets.test.mjs          # pure module
$PY -m pytest prototype/tests/test_testhub.py -v               # new Playwright file (foreground!)
```

## Review Focus

1. **Player without dev mode:** nothing is requested from `/testhub/client.js` (Task 2 test).
2. **`localStorage` throws** (private window, blocked site data): `?dev=1` must still load the client for this view and the page must not error (Task 2 test).
3. **Two J names that slug to the same id:** ids stay unique, deterministically (`-2` suffix) (Task 1 node test).
4. **Hub client arrives before the game module, or after it:** registration works in both orders (Task 3 tests).
5. **A second screenshot request while one is pending:** rejects instead of hanging or overwriting the first (Task 4 test).
6. **Hand layout / other region (no hideout):** `hideout.*` are simply absent, nothing throws (Task 1 + Task 3 tests).

## File Structure

- Create `prototype/testhub-targets.js` — pure: `TARGET_ID_RE`, `slugify`, `jumpTargets`, `spotTargets`, `buildTargets`. No DOM, no three.js.
- Create `prototype/tests/testhub-targets.test.mjs` — node tests for the above.
- Create `prototype/tests/test_testhub.py` — Playwright: loader gating, registration, jumps, screenshot, hideout.
- Modify `prototype/index.html` — loader `<script>` (after `i18n.js`, ~line 2563), import (line ~345), `capturePhoto` sink (~line 2529), wiring block (after `savePhoto`, ~line 2537).
- Modify `test-todo.md` — `{go: …}` tags on the four newest blocks.
- Modify `CHANGELOG.md` — one line under `## [Unreleased]` / `### Added`.

---

### Task 1: Pure target-list module (node-tested)

**Files:**
- Create: `prototype/testhub-targets.js`
- Test: `prototype/tests/testhub-targets.test.mjs`

**Interfaces:**
- Consumes: J entries as `landmarkEntries()` returns them, i.e. `{ n: string, g: string|null, x: number, z: number, j?: [x,z], look?: [x,z], ramp?: true }`.
- Produces (used by Task 3):
  - `export const TARGET_ID_RE = /^[a-z0-9._-]+$/`
  - `export function slugify(name: string): string`
  - `export function jumpTargets(entries): Array<{ id: string, label: string, kind: 'jump', entry: object }>`
  - `export function spotTargets({ underwater, hideout }): Array<{ id: string, label: string, kind: 'spot', spot: { x: number, z: number, th: number, floor?: true } }>` where `underwater` is `null | { wreck: [x,z], wreckCar: [x,z] }` and `hideout` is `null | { mouth: [x,z], heading: number, n1: [x,z], hall: [x,z] }`
  - `export function buildTargets({ entries, underwater, hideout })` = `[...jumpTargets(entries), ...spotTargets({ underwater, hideout })]`
- Heading convention (from `prototype/landmarks.js:81`): the car's forward vector is `(cos th, sin th)` in `(x, z)`.

- [ ] **Step 1: Write the failing test**

Create `prototype/tests/testhub-targets.test.mjs`:

```js
// #251: the Testhub target list. Unit-tested with `node --test prototype/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARK_INFO, LANDMARK_INFO_EHRENDINGEN } from '../landmarks.js';
import { TARGET_ID_RE, slugify, jumpTargets, spotTargets, buildTargets } from '../testhub-targets.js';

const asEntries = (info) => info.map(i => ({ n: i.name, g: i.gemeinde, x: 0, z: 0 }));

test('slugify: umlauts become ae/oe/ue, punctuation collapses to one dash', () => {
  assert.equal(slugify('Reservoir Hübel'), 'reservoir-huebel');
  assert.equal(slugify('Südspange Sisslerfeld'), 'suedspange-sisslerfeld');
  assert.equal(slugify('Schloss Schönau (Trompeterschloss)'), 'schloss-schoenau-trompeterschloss');
  assert.equal(slugify('Bahnhof Stein-Säckingen'), 'bahnhof-stein-saeckingen');
  assert.equal(slugify('Bodenackerstrasse 10B'), 'bodenackerstrasse-10b');
});

test('slugify: a name with no usable characters still yields a valid slug', () => {
  assert.equal(slugify('???'), 'x');
});

test('jumpTargets: every J entry of both regions becomes a j.<slug> target with a valid, unique id', () => {
  for (const info of [LANDMARK_INFO, LANDMARK_INFO_EHRENDINGEN]) {
    const entries = asEntries(info);
    const targets = jumpTargets(entries);
    assert.equal(targets.length, entries.length);
    const ids = targets.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    targets.forEach((t, i) => {
      assert.match(t.id, TARGET_ID_RE);
      assert.ok(t.id.startsWith('j.'), t.id);
      assert.equal(t.kind, 'jump');
      assert.equal(t.label, entries[i].n);
      assert.equal(t.entry, entries[i]);
    });
  }
});

test('jumpTargets: known ids are stable (test-todo.md tags rely on them)', () => {
  const ids = jumpTargets(asEntries(LANDMARK_INFO)).map(t => t.id);
  assert.ok(ids.includes('j.reservoir-huebel'));
  assert.ok(ids.includes('j.suedspange-sisslerfeld'));
});

test('jumpTargets: two names with the same slug get -2, -3 in list order', () => {
  const e = (n) => ({ n, g: null, x: 0, z: 0 });
  const ids = jumpTargets([e('Bahnhof'), e('bahnhof'), e('BAHNHOF')]).map(t => t.id);
  assert.deepEqual(ids, ['j.bahnhof', 'j.bahnhof-2', 'j.bahnhof-3']);
});

test('spotTargets: both wrecks, placed 8 m east of the wreck facing it (west)', () => {
  const t = spotTargets({ underwater: { wreck: [100, 5], wreckCar: [130, 6] }, hideout: null });
  assert.deepEqual(t.map(x => x.id), ['uw.boat', 'uw.car']);
  assert.deepEqual(t[0].spot, { x: 108, z: 5, th: Math.PI });
  assert.deepEqual(t[1].spot, { x: 138, z: 6, th: Math.PI });
  t.forEach(x => { assert.equal(x.kind, 'spot'); assert.match(x.id, TARGET_ID_RE); });
});

test('spotTargets: hideout gate is 12 m back from the mouth, facing along the tunnel axis', () => {
  const t = spotTargets({ underwater: null, hideout: { mouth: [0, 0], heading: 0, n1: [0, 0], hall: [0, 100] } });
  const gate = t.find(x => x.id === 'hideout.gate');
  assert.deepEqual(gate.spot, { x: -12, z: 0, th: 0 });
});

test('spotTargets: hideout tower is 110 m before the hall centre on the N1 -> hall axis, facing it, on the cave floor', () => {
  const t = spotTargets({ underwater: null, hideout: { mouth: [0, 0], heading: 0, n1: [0, 0], hall: [0, 100] } });
  const tower = t.find(x => x.id === 'hideout.tower');
  assert.equal(tower.spot.floor, true);
  assert.ok(Math.abs(tower.spot.x - 0) < 1e-9 && Math.abs(tower.spot.z - -10) < 1e-9, JSON.stringify(tower.spot));
  assert.ok(Math.abs(tower.spot.th - Math.PI / 2) < 1e-9);
});

test('spotTargets: no underwater / no hideout -> no spots (hand layout, other region)', () => {
  assert.deepEqual(spotTargets({ underwater: null, hideout: null }), []);
});

test('buildTargets: J entries first, then the four hidden spots; all ids valid and unique', () => {
  const entries = asEntries(LANDMARK_INFO);
  const targets = buildTargets({
    entries,
    underwater: { wreck: [0, 0], wreckCar: [30, 0] },
    hideout: { mouth: [0, 0], heading: 1.6, n1: [0, 50], hall: [0, 200] },
  });
  const ids = targets.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.match(id, TARGET_ID_RE));
  assert.equal(ids.filter(id => id.startsWith('j.')).length, entries.length);
  assert.deepEqual(ids.slice(entries.length), ['uw.boat', 'uw.car', 'hideout.gate', 'hideout.tower']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test prototype/tests/testhub-targets.test.mjs`
Expected: FAIL — `Cannot find module '.../prototype/testhub-targets.js'` (ERR_MODULE_NOT_FOUND).

- [ ] **Step 3: Write the minimal implementation**

Create `prototype/testhub-targets.js`:

```js
// #251: the Testhub jump targets -- pure rules, no DOM, no three.js. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// A target is { id, label, kind, ... }: kind 'jump' carries a J entry, kind 'spot' carries { x, z, th, floor? }.
// The car's forward vector is (cos th, sin th) in (x, z), as everywhere in the game.

export const TARGET_ID_RE = /^[a-z0-9._-]+$/;

const UMLAUTS = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue' };

// "Reservoir Hübel" -> "reservoir-huebel"; a name with nothing usable in it -> "x"
export function slugify(name) {
  const slug = String(name).replace(/[äöüßÄÖÜ]/g, c => UMLAUTS[c]).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'x';
}

// every J entry -> j.<slug>; a repeated slug gets -2, -3 ... in list order, so ids are deterministic
export function jumpTargets(entries) {
  const seen = new Map();
  return entries.map(entry => {
    const slug = slugify(entry.n), count = (seen.get(slug) || 0) + 1;
    seen.set(slug, count);
    return { id: `j.${count === 1 ? slug : `${slug}-${count}`}`, label: entry.n, kind: 'jump', entry };
  });
}

const WRECK_RUN = 8;      // m east of a wreck: where the console shortcut `__mm.place(x + 8, z)` has always put the car
const GATE_BACK = 12;     // m back from the tunnel mouth, so the gate is in view ahead
const TOWER_BACK = 110;   // m before the hall centre: outside the tower's feet (|x|,|z| <= 53 + 17), inside the hall (r 168)

const spot = (id, label, x, z, th, extra = {}) => ({ id, label, kind: 'spot', spot: { x, z, th, ...extra } });

function underwaterSpots(u) {
  if (!u) return [];
  const beside = ([x, z]) => [x + WRECK_RUN, z];   // facing west (th = PI) looks at the wreck
  return [
    spot('uw.boat', 'Underwater: capsized rowing boat', ...beside(u.wreck), Math.PI),
    spot('uw.car', 'Underwater: rusty car', ...beside(u.wreckCar), Math.PI),
  ];
}

function hideoutSpots(h) {
  if (!h) return [];
  const gate = [h.mouth[0] - Math.cos(h.heading) * GATE_BACK, h.mouth[1] - Math.sin(h.heading) * GATE_BACK];
  const dx = h.hall[0] - h.n1[0], dz = h.hall[1] - h.n1[1], len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  return [
    spot('hideout.gate', 'Hideout: reservoir gate', ...gate, h.heading),
    spot('hideout.tower', 'Hideout: Eiffel Tower hall', h.hall[0] - ux * TOWER_BACK, h.hall[1] - uz * TOWER_BACK, Math.atan2(uz, ux), { floor: true }),
  ];
}

export function spotTargets({ underwater, hideout }) {
  return [...underwaterSpots(underwater), ...hideoutSpots(hideout)];
}

export function buildTargets({ entries, underwater, hideout }) {
  return [...jumpTargets(entries), ...spotTargets({ underwater, hideout })];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test prototype/tests/testhub-targets.test.mjs`
Expected: PASS (all tests). Then run the whole node suite to check nothing else broke: `node --test prototype/tests/*.test.mjs` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add prototype/testhub-targets.js prototype/tests/testhub-targets.test.mjs
git commit -m "feat(testhub): pure jump-target list for J entries and hidden spots (#251)"
```
(End the message with the attribution lines from the session reminder.)

---

### Task 2: Dev-mode loader in `prototype/index.html`

**Files:**
- Modify: `prototype/index.html` (insert after the line `<script src="./i18n.js"></script>`, currently line 2563)
- Test: `prototype/tests/test_testhub.py` (create; this task adds the helpers and the loader tests)

**Interfaces:**
- Consumes: nothing.
- Produces: when dev mode is on, a `<script async src="/testhub/client.js">` in `<head>`. The test helpers `STUB`, `open_game()` defined here are reused by Tasks 3-5.

- [ ] **Step 1: Write the failing test**

Create `prototype/tests/test_testhub.py`:

```python
"""#251: Testhub integration -- dev-mode loader, jump targets, screenshot hook.
The hub client (/testhub/client.js) lives in another repo; here page.route() serves a minimal stub for that URL.
Slow (Playwright): run in the foreground; act through page.evaluate, rAF can stall headless."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
WORLD_ROUTE = "**/data/world_hochrhein.json"
CLIENT_ROUTE = "**/testhub/client.js"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")

# What the real client.js promises (plan "Contract for the hub client"): window.ggTesthub, then the ready event.
STUB = """
window.ggTesthub = {
  regs: {}, info: null, shot: null,
  register(id, fn, label) { this.regs[id] = { fn, label }; },
  setInfo(i) { this.info = i; },
  onScreenshot(fn) { this.shot = fn; },
};
window.__stubLoaded = true;
window.dispatchEvent(new Event('gg-testhub-ready'));
"""
# the same object, but already there before any page script runs (client.js beat the game module)
STUB_FIRST = """
window.ggTesthub = { regs: {}, info: null, shot: null,
  register(id, fn, label) { this.regs[id] = { fn, label }; }, setInfo(i) { this.info = i; }, onScreenshot(fn) { this.shot = fn; } };
"""


def new_page(p, server, query, block_world, viewport=(480, 270), serve_stub=True, init_script=None):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": viewport[0], "height": viewport[1]})
    if init_script:
        page.add_init_script(init_script)
    errors, client_requests = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda r: client_requests.append(r.url) if r.url.endswith("/testhub/client.js") else None)
    if serve_stub:
        page.route(CLIENT_ROUTE, lambda r: r.fulfill(status=200, content_type="text/javascript", body=STUB))
    if block_world:
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route(WORLD_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}", wait_until="domcontentloaded")
    return b, page, errors, client_requests


def start(page):
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)   # the first frame can take 30 s+ on a busy box


def test_loader_loads_the_client_only_in_dev_mode(server):
    with sync_playwright() as p:
        b, page, errors, requests = new_page(p, server, "", block_world=True)
        page.wait_for_timeout(3000)
        assert requests == [], "a player (no ?dev=1) must not request the hub client"
        assert page.evaluate("() => localStorage.getItem('gg-dev')") is None

        page.goto(f"{server}/prototype/index.html?dev=1", wait_until="domcontentloaded")
        page.wait_for_function("() => window.__stubLoaded === true", timeout=30000)
        assert page.evaluate("() => localStorage.getItem('gg-dev')") == "1"
        assert len(requests) == 1 and requests[0].endswith("/testhub/client.js"), requests

        requests.clear()
        page.goto(f"{server}/prototype/index.html", wait_until="domcontentloaded")   # the flag persists on the shared origin
        page.wait_for_function("() => window.__stubLoaded === true", timeout=30000)

        requests.clear()
        page.goto(f"{server}/prototype/index.html?dev=0", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        assert requests == [], "?dev=0 switches dev mode off again"
        assert page.evaluate("() => localStorage.getItem('gg-dev')") is None
        b.close()
    assert errors == []


def test_loader_survives_blocked_local_storage(server):
    blocked = "Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });"
    with sync_playwright() as p:
        b, page, errors, requests = new_page(p, server, "?dev=1", block_world=True, init_script=blocked)
        page.wait_for_function("() => window.__stubLoaded === true", timeout=30000)
        b.close()
    assert len(requests) == 1, requests
    assert not any("blocked" in e and "testhub" in e.lower() for e in errors), errors
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `$PY -m pytest prototype/tests/test_testhub.py -v -k loader`
Expected: FAIL — `test_loader_loads_the_client_only_in_dev_mode` times out in `wait_for_function(... __stubLoaded ...)` (no loader exists yet).

- [ ] **Step 3: Write the loader**

In `prototype/index.html`, directly after `<script src="./i18n.js"></script>` (grep for it: `grep -n 'src="./i18n.js"' prototype/index.html`), insert:

```html
<script>
  // Testhub (#251): dev mode loads the shared playtest client; a player loads nothing.
  // ?dev=1 sets localStorage['gg-dev'], ?dev=0 clears it; gg-dev is shared by every game on this origin.
  (function () {
    var q = new URLSearchParams(location.search).get('dev'), stored = null;
    try { if (q === '1') localStorage.setItem('gg-dev', '1'); else if (q === '0') localStorage.removeItem('gg-dev'); stored = localStorage.getItem('gg-dev'); } catch (e) { }
    if (q !== '1' && (q === '0' || stored !== '1')) return;
    var s = document.createElement('script'); s.src = '/testhub/client.js'; s.async = true; document.head.appendChild(s);
  })();
</script>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$PY -m pytest prototype/tests/test_testhub.py -v -k loader` (foreground)
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_testhub.py
git commit -m "feat(testhub): dev-mode loader for /testhub/client.js (#251)"
```

---

### Task 3: Register the targets; Testhub jump = J jump

**Files:**
- Modify: `prototype/index.html` — import near line 345 (`import { photoFileName, canPhoto } from './photo.js';`), wiring block directly after the `savePhoto` function (ends ~line 2537, just before `// ---------- loop ----------`)
- Test: `prototype/tests/test_testhub.py` (append)

**Interfaces:**
- Consumes: Task 1's `buildTargets`; existing in-module symbols `JUMP_ENTRIES` (line ~1962), `jumpTo(p)`, `jumpToRamp(name)`, `placeOnRoad(x, z, th, name)` (line 1965, sets `R.jumped` while racing/armed), `UWS.counts.wreck` / `.wreckCar` (line 1666, filled synchronously by `buildUnderwater()` at line 1671), `HIDE` (line 686, `null` unless Hochrhein + real world), `HIDEOUT.mouth` / `.heading`, `CAVE.nodes.n1.c` / `.hall.c`, `P`, `car`, `restShadow()`.
- Produces: `window.ggTesthub.register(...)` calls and `setInfo`; function `testhubGo(target)`; (Task 4 adds `onScreenshot` inside `testhubRegister`).

Why `placeOnRoad` for spots too: it already does `P.safe = …; clearNavi(); resetCar(); R.jumped = true (racing/armed); closeJump(); toast(name)`. `resetCar()` puts the car on `groundH(x, z, -Infinity)` (the lowest ground: the riverbed for wrecks). `R` returns to a Testhub spot afterwards, which is what a tester wants.

- [ ] **Step 1: Write the failing tests**

Append to `prototype/tests/test_testhub.py`:

```python
def car(page):
    return page.evaluate("() => window.__mm.car()")


def go(page, target_id):
    page.evaluate("(id) => window.ggTesthub.regs[id].fn()", target_id)


def reg_ids(page):
    return page.evaluate("() => Object.keys(window.ggTesthub.regs)")


def test_registers_j_entries_and_wrecks_and_jumps_flag_the_race(server):
    with sync_playwright() as p:
        b, page, errors, _ = new_page(p, server, "?dev=1", block_world=True)
        start(page)
        page.wait_for_function("() => window.ggTesthub && Object.keys(window.ggTesthub.regs).length > 0", timeout=30000)
        ids, info = reg_ids(page), page.evaluate("() => window.ggTesthub.info")
        wreck = page.evaluate("() => window.__mm.underwater().wreck")
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is False

        go(page, "uw.boat")                                  # the wreck, 8 m east of it, facing it
        c1, th = car(page), page.evaluate("() => window.__mm.heading()")
        flags = page.evaluate("() => window.__mm.raceFlags()")
        go(page, [i for i in ids if i.startswith("j.")][-1])
        c2 = car(page)
        b.close()
    assert errors == []
    assert info == {"game": "rhyflitzer", "version": "0.2.0"}, info
    assert {"uw.boat", "uw.car"} <= set(ids) and not any(i.startswith("hideout.") for i in ids), ids
    assert len([i for i in ids if i.startswith("j.")]) >= 2, ids
    assert math.hypot(c1["x"] - (wreck[0] + 8), c1["z"] - wreck[1]) < 2, (c1, wreck)
    assert math.cos(th - math.pi) > 0.99, th
    assert flags["jumped"] is True, "a Testhub jump counts like a J jump"
    assert math.hypot(c2["x"] - c1["x"], c2["z"] - c1["z"]) > 20, "the j.* target moved the car"


def test_registers_when_the_client_was_there_before_the_game(server):
    with sync_playwright() as p:
        b, page, errors, requests = new_page(p, server, "", block_world=True, init_script=STUB_FIRST)   # no ?dev: nothing is fetched
        start(page)
        ids = reg_ids(page)
        b.close()
    assert requests == [] and errors == []
    assert "uw.boat" in ids and any(i.startswith("j.") for i in ids), ids
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `$PY -m pytest prototype/tests/test_testhub.py -v -k "registers"` (foreground)
Expected: FAIL — the `wait_for_function(... regs ...length > 0 ...)` times out (nothing registers yet); the second test fails on `"uw.boat" in ids` (`ids == []`).

- [ ] **Step 3: Write the wiring**

3a. In `prototype/index.html` add the import on the line after `import { photoFileName, canPhoto } from './photo.js';`:

```js
import { buildTargets } from './testhub-targets.js';
```

3b. Directly after the closing `}` of `function savePhoto(blob) {…}` (before `// ---------- loop ----------`) insert:

```js
// ---------- Testhub (#251) ----------
// Dev mode only: the loader in the body appends /testhub/client.js, which defines window.ggTesthub and then fires
// 'gg-testhub-ready'. The client may arrive before or after this module, so handle both orders (no polling).
// Every jump goes through placeOnRoad(), so a race in progress is flagged exactly like a J jump.
function testhubContext() {
  return {
    entries: JUMP_ENTRIES,
    underwater: UWS.counts ? { wreck: UWS.counts.wreck, wreckCar: UWS.counts.wreckCar } : null,
    hideout: HIDE ? { mouth: HIDEOUT.mouth, heading: HIDEOUT.heading, n1: CAVE.nodes.n1.c, hall: CAVE.nodes.hall.c } : null,
  };
}
function testhubGo(target) {
  if (target.kind === 'jump') { if (target.entry.ramp) jumpToRamp(target.label); else jumpTo(target.entry); return; }
  const s = target.spot;
  placeOnRoad(s.x, s.z, s.th, target.label);
  if (s.floor && HIDE) { P.y = HIDE.floor ?? HIDE.f0; car.position.y = P.y; restShadow(); }   // inside the hill: the cave floor, not the ground seen from the sky
}
function testhubRegister(hub) {
  hub.setInfo({ game: 'rhyflitzer', version: window.GAME_VERSION || '0.0.0' });
  for (const target of buildTargets(testhubContext())) hub.register(target.id, () => testhubGo(target), target.label);
}
if (window.ggTesthub) testhubRegister(window.ggTesthub);
else addEventListener('gg-testhub-ready', () => testhubRegister(window.ggTesthub), { once: true });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$PY -m pytest prototype/tests/test_testhub.py -v` (foreground)
Expected: PASS (4 tests). If `c1` is not within 2 m of `wreck + 8`, read `resetCar()` (line 1977): the car is placed at `P.safe`; do not change the test, check that `testhubGo` passes `s.x, s.z`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_testhub.py
git commit -m "feat(testhub): register J entries and hidden spots with the hub client (#251)"
```

---

### Task 4: Screenshot hook returning a PNG data URL

**Files:**
- Modify: `prototype/index.html` — `photoPending`/`capturePhoto` block (lines ~2525-2529) and `testhubRegister` (Task 3)
- Test: `prototype/tests/test_testhub.py` (append)

**Interfaces:**
- Consumes: the existing X flow: pressing X (or pause menu photo) sets `photoPending = true`; `loop()` calls `capturePhoto()` right after `renderer.render()` (two call sites, both `if (photoPending) capturePhoto();`, leave them). The canvas only holds readable pixels inside that task (no `preserveDrawingBuffer`), which is why the hook must also go through the flag.
- Produces: `function photoDataUrl(): Promise<string>`; registered via `hub.onScreenshot(photoDataUrl)`.

- [ ] **Step 1: Write the failing test**

Append to `prototype/tests/test_testhub.py`:

```python
def test_screenshot_hook_returns_a_png_data_url_and_rejects_a_second_request(server):
    with sync_playwright() as p:
        b, page, errors, _ = new_page(p, server, "?dev=1", block_world=True)
        start(page)
        page.wait_for_function("() => window.ggTesthub && window.ggTesthub.shot", timeout=30000)
        downloads = []
        page.on("download", lambda d: downloads.append(d))
        url = page.evaluate("""() => Promise.race([window.ggTesthub.shot(),
            new Promise((_, no) => setTimeout(() => no(new Error('no frame in 90 s')), 90000))])""")
        both = page.evaluate("""async () => {
            const first = window.ggTesthub.shot();
            const second = await window.ggTesthub.shot().then(() => 'resolved', e => e.message);
            await first; return second; }""")
        page.wait_for_timeout(1000)
        b.close()
    assert errors == []
    assert url.startswith("data:image/png;base64,"), url[:40]
    assert len(url) > 5000, len(url)                      # a blank frame compresses to ~1 kB (see test_photo.py)
    assert both == "screenshot already pending", both
    assert downloads == [], "the hook returns the picture instead of downloading it"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `$PY -m pytest prototype/tests/test_testhub.py -v -k screenshot`
Expected: FAIL — `wait_for_function(... window.ggTesthub.shot ...)` times out (`onScreenshot` is never called).

- [ ] **Step 3: Write the hook**

In `prototype/index.html`, replace the line

```js
function capturePhoto() { photoPending = false; canvas.toBlob(savePhoto, 'image/png'); }
```

with

```js
let photoSink = null;   // #251: set by photoDataUrl(); the next capture goes there instead of into a download
function capturePhoto() { const sink = photoSink || savePhoto; photoSink = null; photoPending = false; canvas.toBlob(sink, 'image/png'); }
function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('photo failed')); r.readAsDataURL(blob); }); }
// #251: the Testhub screenshot -- the frame X would save, as a PNG data URL (no HUD: it is the canvas only)
function photoDataUrl() {
  if (photoSink) return Promise.reject(new Error('screenshot already pending'));
  return new Promise((resolve, reject) => {
    photoSink = blob => { if (!blob) reject(new Error('photo failed')); else blobToDataUrl(blob).then(resolve, reject); };
    photoPending = true;
  });
}
```

And in `testhubRegister` (Task 3) add as the second statement, after `hub.setInfo(...)`:

```js
  hub.onScreenshot(photoDataUrl);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$PY -m pytest prototype/tests/test_testhub.py -v` then the existing photo tests, which share `capturePhoto`: `$PY -m pytest prototype/tests/test_photo.py -v` (both foreground).
Expected: PASS (5 tests in `test_testhub.py`; `test_photo.py` unchanged and green).

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_testhub.py
git commit -m "feat(testhub): screenshot hook returns a PNG data URL (#251)"
```

---

### Task 5: Hideout targets in the real world

**Files:**
- Test: `prototype/tests/test_testhub.py` (append)
- Modify (only if the test shows a placement defect): `prototype/testhub-targets.js` constants `GATE_BACK` / `TOWER_BACK`, or `testhubGo` in `prototype/index.html`

**Interfaces:**
- Consumes: Task 3 wiring; `__mm.hideout()` (index.html line 2109) returns `{ mouth, centre, floor, rooms: { hall: { c, r }, n1: { c } } }`; `__mm.car()` returns `{x, y, z, …}`; `__mm.heading()`.
- Produces: nothing new; this task proves `hideout.gate` and `hideout.tower` work in the Hochrhein world.

- [ ] **Step 1: Write the test**

Append to `prototype/tests/test_testhub.py`:

```python
HEADING = 95 * math.pi / 180      # the tunnel axis, as in test_hideout.py


@needs_world
def test_hideout_targets_put_the_car_at_the_gate_and_in_the_hall(server):
    with sync_playwright() as p:
        b, page, errors, _ = new_page(p, server, "?dev=1", block_world=False)
        start(page)
        page.wait_for_function("() => window.ggTesthub && window.ggTesthub.regs['hideout.tower']", timeout=30000)
        h = page.evaluate("() => window.__mm.hideout()")
        ids = reg_ids(page)

        go(page, "hideout.gate")
        gate, gate_th = car(page), page.evaluate("() => window.__mm.heading()")
        go(page, "hideout.tower")
        tower = car(page)
        b.close()
    assert errors == []
    assert {"hideout.gate", "hideout.tower", "uw.boat", "uw.car", "j.reservoir-huebel"} <= set(ids), ids
    mx, mz = h["mouth"]
    assert 8 < math.hypot(gate["x"] - mx, gate["z"] - mz) < 16, (gate, h["mouth"])           # ~12 m back from the mouth
    assert math.cos(gate_th - HEADING) > 0.99, gate_th                                         # looking down the tunnel axis
    hx, hz = h["rooms"]["hall"]["c"]
    assert 100 < math.hypot(tower["x"] - hx, tower["z"] - hz) < 120, (tower, h["rooms"]["hall"])   # 110 m before the hall centre
    assert abs(tower["y"] - h["floor"]) < 3, (tower["y"], h["floor"])                          # on the cave floor, not on the hill
```

- [ ] **Step 2: Run the test**

Run: `$PY -m pytest prototype/tests/test_testhub.py -v -k hideout` (foreground; the real world takes a while)
Expected: PASS straight away (the wiring from Task 3 already covers it) — or, with the real world files missing, SKIPPED. If it fails, fix the **placement** (not the assertions, unless an assertion contradicts the spec's "facing the object"):
- `hideout.gate` heading off: `HIDEOUT.heading` is in radians already (`hideout.js`); check `window.__mm.heading()`.
- `tower` `y` wrong (car on the hill): `HIDE.floor` may be unset at that moment; `__mm.hideout()` uses the same `HIDE.floor ?? HIDE.f0`, so compare with that exact value.
- Car pushed out of the hall by collision: lower `TOWER_BACK` in `prototype/testhub-targets.js` (and the matching expectation in `testhub-targets.test.mjs`, 110 -> new value) and rerun both test files.

- [ ] **Step 3: Run all new tests together**

Run: `node --test prototype/tests/*.test.mjs && $PY -m pytest prototype/tests/test_testhub.py -v` (foreground)
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add prototype/tests/test_testhub.py prototype/testhub-targets.js prototype/tests/testhub-targets.test.mjs prototype/index.html
git commit -m "test(testhub): hideout gate and tower targets in the real world (#251)"
```
(`git add` only the files you actually changed.)

---

### Task 6: Tag `test-todo.md` with `{go: …}`

**Files:**
- Modify: `test-todo.md` (the four newest blocks: lines 5-52 at the time of writing)

**Interfaces:**
- Consumes: ids from Tasks 1/3: `j.suedspange-sisslerfeld`, `j.reservoir-huebel`, `hideout.gate`, `hideout.tower`, `uw.boat`, `uw.car`.
- Produces: tags the hub parser reads (`{go: <id>}` anywhere in an item line; a block heading tag is inherited by its items). The Pontoon block gets no tag: its first item says „J → Sisseln, drive down the Innermattstrasse to the Rhine", which is no single target (a tag for a new `pontoon.*` spot comes with a later feature, spec section 3).

- [ ] **Step 1: Apply the tags with a checked script**

Run from the repo root (it asserts every anchor matches exactly once, then rewrites the file):

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("test-todo.md"); text = p.read_text(encoding="utf-8")
edits = [
  # (unique start of the line, tag appended at the end of that line)
  ("## Südspange ESP Sisslerfeld (#42, PR #191 — merged 2026-10-10)", "{go: j.suedspange-sisslerfeld}"),
  ("- [ ] Before the find: „Reservoir Hübel\" is in **J**", "{go: j.reservoir-huebel}"),
  ("- [ ] From the Hübel (Münchwilen, the cul-de-sac south of the A3)", "{go: hideout.gate}"),
  ("- [ ] Drive through the tunnel into the cavern", "{go: hideout.gate}"),
  ("- [ ] **J** → „reservoir\" puts the car on the Hübel", "{go: j.reservoir-huebel}"),
  ("- [ ] Inside: the tower reads as the Eiffel Tower", "{go: hideout.tower}"),
  ("- [ ] **F** inside is refused with „No sky down here\"", "{go: hideout.tower}"),
  ("- [ ] The capsized rowing boat and the rusty car lie at the bend", "{go: uw.boat}"),
]
lines = text.split("\n")
for start, tag in edits:
    hits = [i for i, l in enumerate(lines) if l.startswith(start)]
    assert len(hits) == 1, (start, hits)
    assert "{go:" not in lines[hits[0]], start
    lines[hits[0]] = lines[hits[0]].rstrip() + " " + tag
p.write_text("\n".join(lines), encoding="utf-8")
PY
git diff --stat test-todo.md && git diff test-todo.md | grep '^[+-]' | grep -v '^+++\|^---' | wc -l
```
Expected: `1 file changed`, 16 changed lines (8 removed + 8 added). If an `assert` fires, the text of that line was edited since this plan was written: match the line by its start as it is now and keep the same tag.

- [ ] **Step 2: Check the ids exist**

Run:

```bash
for id in j.suedspange-sisslerfeld j.reservoir-huebel; do node -e "
import('./prototype/landmarks.js').then(async m => { const { jumpTargets } = await import('./prototype/testhub-targets.js');
  const ids = jumpTargets(m.LANDMARK_INFO.map(i => ({ n: i.name }))).map(t => t.id); if (!ids.includes('$id')) { console.error('missing $id'); process.exit(1); } })"; done; echo ok
```
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add test-todo.md
git commit -m "docs(test-todo): tag playtest items with Testhub {go: ...} targets (#251)"
```

---

### Task 7: CHANGELOG, final checks, PR

**Files:**
- Modify: `CHANGELOG.md` (under `## [Unreleased]` / `### Added`, newest entry first)

**Interfaces:**
- Consumes: everything above.
- Produces: the PR.

- [ ] **Step 1: Add the changelog line**

Get the Swiss time: `TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`. Insert as the first bullet under `### Added` in `## [Unreleased]` (replace `<TIME>`):

```markdown
- `<TIME>` For testers only: opening the game with `?dev=1` (and `?dev=0` to switch it off again) connects it to the new **Testhub**, a playtest list in its own window with one-click jumps to the places a change is about — including the sunken wrecks and the hideout. Players see and load nothing of it.
```

- [ ] **Step 2: Run the checks**

Run (foreground, in this order):

```bash
node --test prototype/tests/*.test.mjs
$PY -m pytest prototype/tests/test_testhub.py prototype/tests/test_photo.py -v
$PY -m pytest prototype/tests/test_jump.py -v -k "smile or no_match"
```
Expected: all PASS (the last two commands check that the shared photo code and the J jump are unharmed; do not run the full ~2 h suite).

- [ ] **Step 3: Commit, push, open the PR**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): Testhub dev mode for testers (#251)"
git push -u origin HEAD
gh pr create --title "feat(testhub): Rhyflitzer jump targets, screenshot hook and dev loader" --body "$(cat <<'EOF'
## Summary
Rhyflitzer side of the Testhub (spec: docs/superpowers/specs/2026-10-11-testhub-design.md, section 3): a dev-only loader for /testhub/client.js, a j.<slug> target per J entry plus uw.boat, uw.car, hideout.gate, hideout.tower, a screenshot hook returning a PNG data URL, and {go: ...} tags in test-todo.md.

## Changes
- prototype/testhub-targets.js (pure) + node tests
- loader and wiring in prototype/index.html; capturePhoto gets a one-shot sink
- prototype/tests/test_testhub.py (Playwright, stub client)
- test-todo.md tags, CHANGELOG entry

## Testing
- node --test prototype/tests/*.test.mjs
- pytest prototype/tests/test_testhub.py, test_photo.py, two test_jump.py cases
- Needs the hub client from freaxnx01.github.io to be exercised end to end (contract in docs/superpowers/plans/2026-10-11-testhub-rhyflitzer.md)

Closes #251
Closes #248

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
(Use the PR description attribution line from the session reminder.)
Expected: PR URL printed. If `gh` answers 401 / "Bad credentials", stop and report; do not switch auth.

---

## Self-review notes

- Spec section 3 bullets: loader + `setInfo` (Tasks 2, 3); every J entry as `j.<id>` using the same jump (Tasks 1, 3); hidden spots `uw.boat`, `uw.car`, `hideout.gate`, `hideout.tower` placed like the console shortcuts, facing the object (Tasks 1, 3, 5); race flagged (Task 3 test); screenshot via the X code (Task 4); `test-todo.md` tags (Task 6). Testing bullet: node test (Task 1) and Playwright with stub (Tasks 2-5). Closes #248 (Task 7).
- Names used across tasks: `buildTargets`, `jumpTargets`, `spotTargets`, `slugify`, `TARGET_ID_RE`, `testhubContext`, `testhubGo`, `testhubRegister`, `photoDataUrl`, `photoSink`: consistent.
- Open points deliberately left to the implementer's verification: exact positions of `hideout.gate` (12 m back) and `hideout.tower` (110 m before the hall centre) are first guesses checked by Task 5.
