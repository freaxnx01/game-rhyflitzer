# Big village names from afar (#16) — Implementation Plan

**Goal:** When you drive towards a village from far away, its name floats big in the sky above it. It faces the camera, is readable from kilometres away and fades out far away. It also fades out as you drive into the village, and inside the village it is hidden.

**Architecture:** Pure helpers and a hand-kept `VILLAGES` table live in `prototype/world.js` and are unit-tested with `node:test`. `prototype/index.html` turns `villageLabels(...)` into camera-facing `THREE.Sprite`s every frame from `hud()`. The sprites are created lazily, one per village, draw over everything and ignore fog. Test hooks `__mm.villages()` / `__mm.villageSprites()` back a Playwright test. Spec: `docs/superpowers/specs/2026-10-02-village-names-design.md`.

**Tech:** vanilla JS (ES modules), three.js, `node:test`, Playwright (Python).

## Global Constraints

- TDD: write the failing test first, watch it fail, then implement.
- Never modify an existing test to make it green. Stop and report after 3 failed attempts.
- Surgical edits only. Touch only these:
  - `prototype/world.js` (append)
  - `prototype/tests/world.test.mjs` (import line + appended tests)
  - `prototype/index.html`: the `world.js` import line, one new block after the house-number block, one call in `hud()` and two `__mm` hooks
  - the new `prototype/tests/test_village_names.py`
  - `CHANGELOG.md`
  - `test-todo.md`
- No new key, no toggle. G is reserved by #48.
- No pipeline change and no world rebuild. Never hand-edit `data/world_hochrhein.json`.
- Run Playwright tests in the **foreground**, never `run_in_background`. Commit and push the branch before starting the Playwright run.
- Commands:
  - unit tests: `node --test prototype/tests/*.test.mjs` (on Node 24 the folder alone does not work)
  - browser tests: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`, or plain `pytest prototype/tests/...` where Playwright is installed globally (CI)
- Commits: Conventional Commits, reference `#16`.

## Task 1 — Village table and pure helpers (TDD)

**Files:** `prototype/world.js`, `prototype/tests/world.test.mjs`.

**Interface:**

```js
export const VILLAGES            // [{ t, x, z, r }] game metres; r = radius inside which the name is hidden
export const VILLAGE_FADE        // { in: 200, full: 2600, out: 3400 }
export function villageFade(d, r, f = VILLAGE_FADE)   // opacity 0..1
export function villageHeight(d)                      // world height in metres, clamp(0.06 d, 30, 180)
export function villageLabels(villages, x, z)         // [{ t, x, z, d, opacity, h }], opacity > 0 only, nearest first
```

1. **Write the failing tests.** In `prototype/tests/world.test.mjs`, extend the import on line 3 with `VILLAGES, VILLAGE_FADE, villageFade, villageHeight, villageLabels`, then append:

   ```js
   test('villageFade: hidden inside, ramps in, full, ramps out, gone', () => {
     const near = (a, b) => Math.abs(a - b) < 1e-9;
     assert.equal(villageFade(0, 450), 0);
     assert.equal(villageFade(450, 450), 0);
     assert.ok(near(villageFade(550, 450), 0.5));
     assert.equal(villageFade(650, 450), 1);
     assert.equal(villageFade(2000, 450), 1);
     assert.equal(villageFade(2600, 450), 1);
     assert.ok(near(villageFade(3000, 450), 0.5));
     assert.equal(villageFade(3400, 450), 0);
     assert.equal(villageFade(9000, 450), 0);
     assert.deepEqual(VILLAGE_FADE, { in: 200, full: 2600, out: 3400 });
   });

   test('villageHeight: 0.06 x distance, clamped to 30..180 m', () => {
     assert.equal(villageHeight(100), 30);
     assert.equal(villageHeight(1000), 60);
     assert.equal(villageHeight(1500), 90);
     assert.equal(villageHeight(5000), 180);
   });

   test('villageLabels: only visible names, nearest first', () => {
     const V = [{ t: 'FAR', x: 3000, z: 0, r: 400 }, { t: 'HERE', x: 100, z: 0, r: 400 }, { t: 'MID', x: 0, z: 1500, r: 400 }, { t: 'GONE', x: 0, z: -5000, r: 400 }];
     const got = villageLabels(V, 0, 0);
     assert.deepEqual(got.map(l => l.t), ['MID', 'FAR']);
     assert.deepEqual(got[0], { t: 'MID', x: 0, z: 1500, d: 1500, opacity: 1, h: 90 });
     assert.ok(Math.abs(got[1].opacity - 0.5) < 1e-9);
     assert.deepEqual(villageLabels([], 0, 0), []);
   });

   test('VILLAGES: eight uppercase names inside the world, the issue\'s four included', () => {
     assert.equal(VILLAGES.length, 8);
     assert.equal(new Set(VILLAGES.map(v => v.t)).size, 8);
     for (const v of VILLAGES) {
       assert.equal(v.t, v.t.toUpperCase());
       assert.ok(v.r >= 300 && v.r <= 1000, v.t);
       assert.ok(v.x > -4689 && v.x < 4750 && v.z > -2350 && v.z < 2034, v.t);   // the world's road extent
     }
     for (const t of ['BAD SÄCKINGEN', 'STEIN', 'SISSELN', 'SISSLERFELD', 'MÜNCHWILEN']) assert.ok(VILLAGES.some(v => v.t === t), t);
   });
   ```

2. **Run:** `node --test prototype/tests/*.test.mjs`. Expect FAIL (the imports don't exist).

3. **Implement.** Append to `prototype/world.js`:

   ```js
   // #16: big village names (Midtown Madness style). Centres are the OSM place=town/village nodes inside the world, converted with
   // pipeline/geo.py Frame(*DEFAULT_ORIGIN).to_game on 2026-10-02; Sisslerfeld has no place node and uses its map label (pipeline/anchors.json).
   // r = rough village radius in metres: within it the village's own name is hidden.
   export const VILLAGES = [
     { t: 'BAD SÄCKINGEN', x: -1372.9, z: -263.1, r: 800 },   // node 240042433 (town)
     { t: 'STEIN', x: -981.8, z: 615.7, r: 450 },             // node 240097537
     { t: 'SISSELN', x: 1677.6, z: -329.8, r: 450 },          // node 240055476
     { t: 'SISSLERFELD', x: 420, z: 300, r: 600 },            // map label, no place node
     { t: 'MÜNCHWILEN', x: -299.3, z: 1408.4, r: 350 },       // node 240115055
     { t: 'MUMPF', x: -3484.8, z: 596.6, r: 450 },            // node 192826016
     { t: 'MURG', x: 4361.6, z: -689.8, r: 550 },             // node 240124251
     { t: 'WALLBACH', x: -3984.9, z: -1744.8, r: 450 },       // node 3608448837 (Wallbach, Bad Säckingen)
   ];
   export const VILLAGE_FADE = { in: 200, full: 2600, out: 3400 };
   // Opacity by the car's distance d to the centre: hidden inside r, fades in over f.in, full until f.full, gone at f.out.
   export function villageFade(d, r, f = VILLAGE_FADE) {
     if (d <= r || d >= f.out) return 0;
     if (d < r + f.in) return (d - r) / f.in;
     if (d > f.full) return (f.out - d) / (f.out - f.full);
     return 1;
   }
   // World height of the name: a constant ~3.4° of view beyond 500 m, at least 30 m, at most 180 m.
   export function villageHeight(d) { return Math.max(30, Math.min(180, 0.06 * d)); }
   export function villageLabels(villages, x, z) {
     const out = [];
     for (const v of villages) {
       const d = Math.hypot(v.x - x, v.z - z), opacity = villageFade(d, v.r);
       if (opacity > 0) out.push({ t: v.t, x: v.x, z: v.z, d, opacity, h: villageHeight(d) });
     }
     return out.sort((a, b) => a.d - b.d);
   }
   ```

   (This code and these tests were run green against each other during enrichment.)

4. **Run:** `node --test prototype/tests/*.test.mjs`. All green.

5. **Commit:** `feat(world): village table and fade/size helpers for big village names (#16)`.

## Task 2 — Sprites in the game, hooks, browser test (TDD)

**Files:** `prototype/tests/test_village_names.py` (new), `prototype/index.html`.

**Interface (test hooks):**

```js
window.__mm.villages()        // → [{ t, d, opacity, h }] of the names currently shown (nearest first)
window.__mm.villageSprites()  // → [{ t, opacity, depthTest, fog, w, h, y, ground }] of the visible sprites
```

1. **Write the failing test.** Create `prototype/tests/test_village_names.py`:

   ```python
   """#16: big village names over the villages from afar, hidden inside the village. Slow (Playwright): run in the foreground."""
   from pathlib import Path

   import pytest
   from playwright.sync_api import sync_playwright

   WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
   ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
   needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
   SISSELN = (1677.6, -329.8)   # OSM place node 240055476, as in VILLAGES
   MUMPF = (-3484.8, 596.6)     # OSM place node 192826016


   def open_page(p, server, block_world=False):
       b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
       page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
       if block_world:
           page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
       page.goto(f"{server}/prototype/index.html")
       page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
       return b, page


   def names(page):
       return [v["t"] for v in page.evaluate("() => window.__mm.villages()")]


   @needs_world
   def test_village_name_big_from_afar_hidden_inside(server):
       with sync_playwright() as p:
           br, page = open_page(p, server)
           page.evaluate(f"() => window.__mm.place({SISSELN[0] + 1500}, {SISSELN[1]})")       # 1.5 km east of Sisseln
           page.wait_for_function("() => window.__mm.villages().some(v => v.t === 'SISSELN')", timeout=60000)
           far = next(v for v in page.evaluate("() => window.__mm.villages()") if v["t"] == "SISSELN")
           sprite = next(s for s in page.evaluate("() => window.__mm.villageSprites()") if s["t"] == "SISSELN")
           page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]})")              # in the village centre
           page.wait_for_function("() => !window.__mm.villages().some(v => v.t === 'SISSELN')", timeout=60000)
           inside_sprites = [s["t"] for s in page.evaluate("() => window.__mm.villageSprites()")]
           br.close()
       assert far["opacity"] == 1 and far["h"] == 90, far
       assert abs(far["d"] - 1500) < 1, far
       assert sprite["depthTest"] is False and sprite["fog"] is False, sprite
       assert sprite["y"] - sprite["ground"] > 60, sprite
       assert sprite["w"] > sprite["h"] > 0, sprite
       assert "SISSELN" not in inside_sprites


   @needs_world
   def test_far_villages_and_own_village_hidden(server):
       with sync_playwright() as p:
           br, page = open_page(p, server)
           page.evaluate(f"() => window.__mm.place({MUMPF[0]}, {MUMPF[1]})")
           page.wait_for_function("() => window.__mm.villages().some(v => v.t === 'WALLBACH')", timeout=60000)   # 2.4 km away
           shown = names(page)
           br.close()
       assert "MUMPF" not in shown          # inside
       assert "SISSELN" not in shown        # 5.2 km away


   def test_hand_layout_has_no_village_names(server):
       with sync_playwright() as p:
           br, page = open_page(p, server, block_world=True)
           page.wait_for_function("() => window.__mm.labelTick() > 2", timeout=60000)
           shown = page.evaluate("() => window.__mm.villages()")
           sprites = page.evaluate("() => window.__mm.villageSprites()")
           br.close()
       assert shown == [] and sprites == []
   ```

2. **Run:** `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_village_names.py -q` in the foreground. Expect FAIL (`window.__mm.villages is not a function`).

3. **Implement in `prototype/index.html`.**

   a. Extend the `world.js` import (line ~192) with `VILLAGES, villageLabels`.

   b. Directly after the house-number block (after `function updateLabels…`, line ~734), add:

   ```js
   // #16: big village names over the villages (Midtown Madness style): camera-facing, drawn over everything and unfogged, hidden inside the
   // village; one sprite per village, created the first time its name shows (the web font has loaded by then)
   const VILLAGE_SIGNS = { shown: [], sprites: new Map(), ground: new Map(L ? VILLAGES.map(v => [v.t, terrainH(v.x, v.z)]) : []) };
   function villageTex(t) { return makeTex(1024, 160, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '800 120px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = 'rgba(20,23,29,.85)'; g.strokeText(t, w / 2, h / 2 + 4); g.fillStyle = '#f5efe0'; g.fillText(t, w / 2, h / 2 + 4); }, { alpha: true }); }
   function villageSprite(t) { let s = VILLAGE_SIGNS.sprites.get(t); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: villageTex(t), transparent: true, depthTest: false, depthWrite: false, fog: false })); VILLAGE_SIGNS.sprites.set(t, s); scene.add(s); } return s; }
   function updateVillageNames(x, z) {
     VILLAGE_SIGNS.shown = L ? villageLabels(VILLAGES, x, z) : [];
     for (const s of VILLAGE_SIGNS.sprites.values()) s.visible = false;
     VILLAGE_SIGNS.shown.forEach((l, rank) => { const s = villageSprite(l.t); s.visible = true; s.material.opacity = l.opacity; s.renderOrder = 20 - rank; s.scale.set(l.h * 1024 / 160, l.h, 1); s.position.set(l.x, VILLAGE_SIGNS.ground.get(l.t) + 70 + l.h / 2, l.z); });
   }
   ```

   If `terrainH` or `scene` is not yet defined at that point, move the block below their definitions, still before `hud()`. The house-number block right above already uses both.

   c. In `hud(dt)` (line ~962), right after `if (performance.now() - LABELS.t > 250) { LABELS.t = performance.now(); updateLabels(P.x, P.z); }`, add `updateVillageNames(P.x, P.z);`.

   d. Next to the other label hooks (after `window.__mm.labelCache = …`, line ~861), add:

   ```js
   window.__mm.villages = () => VILLAGE_SIGNS.shown.map(l => ({ t: l.t, d: +l.d.toFixed(1), opacity: +l.opacity.toFixed(3), h: +l.h.toFixed(1) }));
   window.__mm.villageSprites = () => [...VILLAGE_SIGNS.sprites].filter(([, s]) => s.visible).map(([t, s]) => ({ t, opacity: s.material.opacity, depthTest: s.material.depthTest, fog: s.material.fog, w: s.scale.x, h: s.scale.y, y: s.position.y, ground: VILLAGE_SIGNS.ground.get(t) }));
   ```

4. **Commit and push the branch**, then run in the foreground:
   - `node --test prototype/tests/*.test.mjs`: green
   - `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`: green. The full suite: `test_smoke.py` asserts an empty console, and the house-number and minimap tests must stay green.

5. **Commit:** `feat(prototype): big village names float over the villages from afar (#16)`.

## Task 3 — Changelog and playtest entry

**Files:** `CHANGELOG.md`, `test-todo.md`.

1. In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add as the first bullet:

   ```markdown
   - Village names now float big over the villages, Midtown Madness style: drive towards Bad Säckingen, Stein, Sisseln, Sisslerfeld, Münchwilen, Mumpf, Murg or Wallbach and you see the name hanging in the sky from kilometres away. It fades as you drive into the village.
   ```

2. Append to `test-todo.md`:

   ```markdown
   ## Big village names (#16)

   - [ ] From the start, drive west towards Stein and Bad Säckingen: the names hang over the villages, readable from afar, not too big, not too small.
   - [ ] Driving into Sisseln, Stein or Bad Säckingen: the village's own name fades out smoothly and is gone inside the village (radius tuning: `VILLAGES[].r` in `prototype/world.js`).
   - [ ] Far names fade out instead of popping; two names lined up behind each other stay readable (the nearer one on top).
   - [ ] Both graphic styles (T): names are not fogged.
   ```

3. **Commit:** `docs(changelog): big village names (#16)`.

## Done when

- [ ] `node --test prototype/tests/*.test.mjs` is green, including the 4 new village tests.
- [ ] The Playwright suite is green, including `test_village_names.py`, with an empty console in `test_smoke.py`.
- [ ] CHANGELOG `[Unreleased]` has the player-facing line, and `test-todo.md` has the playtest entry.
