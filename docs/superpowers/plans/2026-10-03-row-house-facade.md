# Facade texture for the Bodenackerstrasse row houses (#45) — Implementation Plan

**Goal:** The sixteen Bodenackerstrasse row-house blocks in Sisseln show a painted white facade with a yellow panel per house unit, yellow-framed windows and grey roller shutters, in both graphic styles; every other building is unchanged. Nothing from Google Street View is committed.

**Architecture:** A new canvas texture `TEX.rowHouse` (one house unit × one storey per tile) under a new geometry role `rowHouse` with its own merged mesh and material. Pure helpers in `prototype/world.js` pick the blocks by OSM way id and derive the tile size from the data. `osmBuilding()` in `prototype/index.html` routes the picked blocks to the new role in both its paths (flat and gable). Spec: `docs/superpowers/specs/2026-10-03-row-house-facade-design.md`.

**Tech:** vanilla JS (ES modules), three.js, `node:test`, Playwright (Python, SwiftShader).

## Global Constraints

- TDD: write the failing test first, watch it fail, then implement. Never modify an existing test to make it green. Stop and report after 3 failed attempts.
- Surgical edits: touch only `prototype/world.js`, `prototype/tests/world.test.mjs`, `prototype/index.html`, the new `prototype/tests/test_row_houses.py`, the new screenshot folder and `CHANGELOG.md`. No pipeline or `data/` change; no world rebuild.
- **No `rr()`/`rnd()` call in the new texture, and the existing `PLASTER`/door draws in `osmBuilding()` keep running for row houses** — otherwise every later building changes colour (seeded RNG, `index.html:222`).
- Do not commit any Street View image or anything derived from one. The texture is painted from the description in the issue.
- Playwright runs in the **foreground**, never `run_in_background`. Commit and push the branch before starting the slow checks.
- Commits: Conventional Commits, reference `#45`. Branch: `feature/45-row-house-facade`.

## Task 1 — selection and tile helpers in `world.js` (TDD)

**Files:** `prototype/world.js`, `prototype/tests/world.test.mjs`.

**Interface:**

```js
export const ROW_HOUSE_IDS   // Set<number> of 16 OSM way ids
export function isRowHouse(b)            // b.id ∈ ROW_HOUSE_IDS
export function rowUnits(addr)           // '3a–3f' → 6, '16a–16c' → 3, missing/unreadable → 6
export function rowHouseTile(b)          // [max(w, d) / rowUnits(b.addr), h / max(1, round(h / 3))], h = max(b.h, 3)
```

1. **Write the failing test.** Append to `prototype/tests/world.test.mjs`:

   ```js
   import { ROW_HOUSE_IDS, isRowHouse, rowUnits, rowHouseTile } from '../world.js';

   test('row houses (#45): picked by OSM way id, units from the addr range, one unit x one storey per tile', () => {
     assert.equal(ROW_HOUSE_IDS.size, 16);
     assert.equal(isRowHouse({ id: 512632899 }), true);          // 3a–3f
     assert.equal(isRowHouse({ id: 171822799 }), true);          // 16a–16c, the three-unit block
     assert.equal(isRowHouse({ id: 171822634 }), false);         // Bodenackerstrasse 6a–6d: a–d range, but the big block
     assert.equal(isRowHouse({ id: 25049518 }), false);
     assert.equal(rowUnits('3a–3f'), 6);
     assert.equal(rowUnits('16a–16c'), 3);
     assert.equal(rowUnits(undefined), 6);
     assert.equal(rowUnits('6'), 6);
     const t = rowHouseTile({ rect: [0, 0, 36.4, 11.96], h: 6.2, addr: '4a–4f' });   // today's measured 4a–4f: two storeys
     assert.ok(Math.abs(t[0] - 36.4 / 6) < 1e-9 && Math.abs(t[1] - 3.1) < 1e-9, t);
     assert.deepEqual(rowHouseTile({ rect: [0, 0, 36, 12], h: 9, addr: '4a–4f' }), [6, 3]);        // after #34: three storeys
     assert.deepEqual(rowHouseTile({ rect: [0, 0, 11.5, 18], h: 6.9, addr: '16a–16c' }), [6, 3.45]); // long side may be d
   });
   ```

2. **Run:** `node --test prototype/tests/world.test.mjs` — expect FAIL (`ROW_HOUSE_IDS` is not exported).

3. **Implement** in `prototype/world.js`, after `roofTop`:

   ```js
   // #45: the Bodenackerstrasse row houses in Sisseln, by OSM way id — the six-unit blocks 3–21 from #43's table plus the
   // three-unit block 16a–16c. Picked by id, not by addr: 6a–6d and 1a–1d share the a–x pattern and are the big blocks.
   export const ROW_HOUSE_IDS = new Set([512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913, 171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933, 171822799]);
   export function isRowHouse(b) { return ROW_HOUSE_IDS.has(b.id); }
   // house units from the OSM addr range ('3a–3f' → 6); 6 when the range is missing or unreadable
   export function rowUnits(addr) { const m = /^\d+([a-z])[–-]\d+([a-z])$/.exec(addr || ''); return m ? m[2].charCodeAt(0) - m[1].charCodeAt(0) + 1 : 6; }
   // texture tile for a row house: one unit wide, one whole storey tall (3 m nominal), so the yellow panels fall on the unit joints
   export function rowHouseTile(b) { const w = Math.max(b.rect[2], b.rect[3]), h = Math.max(b.h, 3); return [w / rowUnits(b.addr), h / Math.max(1, Math.round(h / 3))]; }
   ```

4. **Run:** `node --test prototype/tests/` — all green.

5. **Commit:** `feat(world): row-house selection and tile helpers for the Bodenackerstrasse (#45)`.

## Task 2 — the texture and the role

**Files:** `prototype/index.html`.

1. **Texture.** After `TEX.asphaltOnly` (line ~263) and before `textTex`, add:

   ```js
   // #45: Bodenackerstrasse row houses — one house unit x one storey per tile (6 x 3 m): white plaster, a yellow vertical panel on
   // the unit's left edge, one window with yellow frame and lintel, a grey roller-shutter box and dark glass. Painted from the
   // description, not from Street View. No rr() here, so the seeded RNG sequence stays the same
   TEX.rowHouse = makeTex(256, 128, (g, w, h) => {
     g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
     let s = 45; const lr = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;   // local LCG: speckle without touching the world seed
     for (let i = 0; i < 260; i++) { const v = Math.floor(lr() * 14); g.fillStyle = `rgba(${200 - v},${196 - v},${186 - v},.22)`; g.fillRect(lr() * w, lr() * h, 2 + lr() * 4, 2 + lr() * 4); }
     g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, w, 3);                                   // storey joint
     g.fillStyle = '#e3b31f'; g.fillRect(0, 0, 26, h);                                          // yellow panel between the units
     g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(26, 0, 3, h);
     g.fillStyle = '#e3b31f'; g.fillRect(96, 22, 118, 90);                                      // window frame and lintel
     g.fillStyle = '#8c9095'; g.fillRect(102, 28, 106, 22);                                     // roller-shutter box
     g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 32; y < 48; y += 4) g.fillRect(102, y, 106, 1);   // slats
     g.fillStyle = '#3b4553'; g.fillRect(102, 50, 106, 56);                                     // glass
     g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(106, 54, 40, 48);                        // reflection
     g.fillStyle = '#e3b31f'; g.fillRect(153, 50, 4, 56);                                       // mullion
     g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(96, 112, 118, 4);                              // sill shadow
   });
   ```

   Canvas `y = 0` is the top of the wall tile (three.js flips canvas textures), so the lintel is above the glass.

2. **Materials.** In `STYLES.original.mat` (line ~876) add `rowHouse: TEX.rowHouse` to the role→texture map. In `STYLES.smooth.mat` (line ~878) add `rowHouse: '#f4f1ea'` to the flat-colour map **and** `'rowHouse'` to the array of roles drawn with `vertexColors: false` (next to `'wall'`).

3. **Verify:** open `prototype/index.html` via `python3 -m http.server`; the console is empty (nothing uses the role yet, so nothing changes on screen).

4. **Commit:** `feat(ui): painted row-house facade texture and role (#45)`.

## Task 3 — `osmBuilding()` routes the blocks to the role; test hooks

**Files:** `prototype/index.html`.

1. **Import.** Add `isRowHouse, rowHouseTile` to the `import { … } from './world.js'` list (line ~202).

2. **`extrudeFootprint` gets a `uPerFace` flag.** Change the signature (line ~488) to `function extrudeFootprint(ring, base, h, c, role, roofC, tile = [4, 3], uPerFace = false)` and the `u` line (line ~497) to:

   ```js
   const u0 = uPerFace ? 0 : along / tile[0], u1 = uPerFace ? L2 / tile[0] : (along + L2) / tile[0], v0 = -2 / tile[1], v1 = h / tile[1]; along += L2;
   ```

   Default `false` keeps today's cumulative `u` for every other building.

3. **`osmBuilding`.** Replace the function (lines ~507-520) with:

   ```js
   function osmBuilding(b) {
     const [cx, cz, w, d, rot] = b.rect; let base = Infinity; for (const [x, z] of b.ring) base = Math.min(base, terrainH(x, z));
     // measured buildings (hsrc 'dsm', #17): eaves h and ridge rh from swissSURFACE3D; a measured flat roof is drawn flat
     const dsm = b.hsrc === 'dsm';
     // #45: the Bodenackerstrasse row houses get their own facade role and a tile per unit and storey, in both paths. The PLASTER
     // and door draws below still run for them, so the seeded RNG sequence for every later building stays the same
     const row = isRowHouse(b); if (row) window.__mm.counts.rowHouses = (window.__mm.counts.rowHouses || 0) + 1;
     if (b.roof === 'gable' && !(dsm && b.rh < 0.6)) {
       const floors = Math.max(1, Math.round(b.h / 3)); const wc = col(PLASTER[Math.floor(rr(0, PLASTER.length))]), rc = col(ROOFS[Math.floor(rr(0, ROOFS.length))]);
       const h = dsm ? b.h : floors * 3 + 0.4; const door = rnd() < 0.5 ? 'wall' : 'wallDoor';
       box(w, h + 3, d, cx, base - 3, cz, rot, row ? col('#ffffff') : wc, row ? 'rowHouse' : door, row ? rowHouseTile(b) : [4, 3], 3.1);
       gable(w, d, base + h, dsm ? b.rh : Math.min(w, d) * 0.4, cx, cz, rot, rc, wc); addOBB(cx, cz, w, d, rot, base + h); return;
     }
     const ind = b.palette === 'industrial', h = Math.max(b.h, 3);
     const wc = col(ind ? INDUSTRIAL.walls[Math.floor(rr(0, 3))] : PLASTER[Math.floor(rr(0, PLASTER.length))]);
     if (row) extrudeFootprint(b.ring, base, h, col('#ffffff'), 'rowHouse', col('#8f8a84'), rowHouseTile(b), true);
     else extrudeFootprint(b.ring, base, h, wc, ind ? 'hallBand' : (h > 8 ? 'hall' : 'wall'), col(ind ? INDUSTRIAL.roof : '#8f8a84'), !ind && h > 8 ? [8, h] : [4, 3]);
     addOBB(cx, cz, w, d, rot, base + h);
   }
   ```

   The gable-end triangles inside `gable()` keep the `wall` role on purpose (spec A6). The gable branch is what the pitched blocks will use once #43 lands; today every block takes the flat branch.

4. **Hooks.** Next to `window.__mm.waterVisible` (line ~945) add:

   ```js
   window.__mm.roles = () => Object.keys(MESH);
   // #45: role of the first merged mesh a horizontal ray from (x, z) towards (tx, tz) hits, `up` m above the terrain at the target
   window.__mm.wallRoleAt = (x, z, tx, tz, up = 2.5) => { const y = terrainH(tx, tz) + up, dir = new THREE.Vector3(tx - x, 0, tz - z).normalize(); const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), dir, 0, Math.hypot(tx - x, tz - z) + 1); const hit = ray.intersectObjects(Object.values(MESH), false)[0]; return hit ? hit.object.userData.role : null; };
   ```

   And let `__mm.place` (line ~927) take an optional heading: `window.__mm.place = (x, z, th) => { P.x = x; P.z = z; if (th !== undefined) P.th = th; P.vx = P.vz = P.vy = 0; …` (rest unchanged).

5. **Verify:** serve and open the OSM world; the console is empty; drive to Sisseln (J → Sisseln) and look east along the Bodenackerstrasse: white blocks with yellow panels. Press **T**: in Smooth they are plain off-white. Other houses look as before.

6. **Commit and push the branch** (`git push -u origin feature/45-row-house-facade`) **before** the Playwright tasks.

   `feat(buildings): facade texture on the Bodenackerstrasse row houses (#45)`

## Task 4 — Playwright: role on the blocks, not on the neighbours (TDD)

**Files:** `prototype/tests/test_row_houses.py` (new).

1. **Write the test** (fails on the branch state *before* Task 3 — if Task 3 is already in, run it once against `main` to see it fail, then on the branch):

   ```python
   """#45: facade texture on the Bodenackerstrasse row houses. Slow (Playwright): run in the foreground."""
   import json
   import math
   from pathlib import Path

   import pytest
   from playwright.sync_api import sync_playwright

   WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
   MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
   ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
   needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

   ROW_IDS = {512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913,
              171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933, 171822799}
   OTHER_ID = 171822634   # Bodenackerstrasse 6a–6d: next door, a–d address range, eight storeys — not a row house


   def open_page(p, server, block_world=False):
       b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
       page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
       if block_world:
           page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
       page.goto(f"{server}/prototype/index.html")
       page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
       return b, page


   def outside_long_face(b, out=12.0):
       """A point `out` m outside the +z face of b.rect (box frame: local (lx, lz) → world via rot) and the footprint centre."""
       cx, cz, w, d, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
       lx, lz = 0.0, d / 2 + out
       return cx + lx * c - lz * s, cz + lx * s + lz * c, cx, cz


   @needs_world
   def test_row_houses_carry_the_facade_role_and_the_neighbour_does_not(server):
       w = json.loads(WORLD.read_text(encoding="utf-8"))
       by_id = {b["id"]: b for b in w["buildings"]}
       present = sorted(i for i in ROW_IDS if i in by_id)
       assert len(present) == 16, present
       with sync_playwright() as p:
           br, page = open_page(p, server)
           counts = page.evaluate("() => window.__mm.counts")
           roles = page.evaluate("() => window.__mm.roles()")
           hits = {}
           for i in present + [OTHER_ID]:
               x, z, tx, tz = outside_long_face(by_id[i])
               hits[i] = page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z}, {tx}, {tz})")
           br.close()
       assert counts["rowHouses"] == 16, counts
       assert "rowHouse" in roles, roles
       assert all(hits[i] == "rowHouse" for i in present), hits
       assert hits[OTHER_ID] not in (None, "rowHouse"), hits[OTHER_ID]


   def test_hand_layout_has_no_row_houses(server):
       with sync_playwright() as p:
           br, page = open_page(p, server, block_world=True)
           counts = page.evaluate("() => window.__mm.counts")
           roles = page.evaluate("() => window.__mm.roles()")
           br.close()
       assert counts.get("rowHouses", 0) == 0
       assert "rowHouse" not in roles
   ```

2. **Run (foreground, generous timeout):** `python3 -m pytest prototype/tests/test_row_houses.py -x -q` — green on the branch. If `wallRoleAt` returns `grass`/`roadOsm` for a block, the ray is grazing the terrain: raise `up` in the hook call to 3.5 (the walls are at least 6 m tall) rather than loosening the assertion.

3. **Run the neighbours:** `python3 -m pytest prototype/tests/test_smoke.py prototype/tests/test_street_labels.py prototype/tests/test_debug.py -q` — still green (empty console in both layouts).

4. **Commit:** `test(buildings): row-house facade role lands on the sixteen blocks only (#45)`.

## Task 5 — visual check for a human (screenshots)

**Files:** `docs/ai-notes/screenshots/2026-10-03-row-houses/original.png`, `smooth.png` (new).

The texture is a graphics judgement call; a person decides whether it reads as the Bodenackerstrasse. Produce two screenshots and commit them for the PR reviewer.

1. Run this snippet in the **foreground** (same server fixture pattern; start `python3 -m http.server 8000` in the repo root first, or reuse `conftest.py`'s server in a one-off pytest):

   ```python
   import json, math, time
   from pathlib import Path
   from playwright.sync_api import sync_playwright

   OUT = Path("docs/ai-notes/screenshots/2026-10-03-row-houses"); OUT.mkdir(parents=True, exist_ok=True)
   w = json.loads(Path("data/world_hochrhein.json").read_text(encoding="utf-8"))
   b = next(x for x in w["buildings"] if x["id"] == 171822953)        # 4a–4f, the block in the player's reference
   cx, cz, bw, bd, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
   lz = bd / 2 + 26                                                   # car 26 m off the long face, looking at it
   x, z = cx - lz * s, cz + lz * c
   th = math.atan2(cz - z, cx - x)
   with sync_playwright() as p:
       br = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
       page = br.new_page(viewport={"width": 960, "height": 540})
       page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
       page.goto("http://127.0.0.1:8000/prototype/index.html")
       page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
       page.click("#startbtn")
       page.evaluate(f"() => window.__mm.place({x}, {z}, {th})")
       page.wait_for_timeout(8000)                                    # headless renders well under 1 fps; let the chase camera settle
       page.screenshot(path=str(OUT / "original.png"))
       page.keyboard.press("t")
       page.wait_for_timeout(8000)
       page.screenshot(path=str(OUT / "smooth.png"))
       br.close()
   ```

   If `#startbtn` is not the start control, use whatever `test_smoke.py` waits for. If the camera ends up inside a tree or a lamp, move the car 5 m along the street (`x += 5 * c; z += 5 * s`) and retake.

2. Look at both PNGs: white walls, a yellow panel at every unit joint, yellow-framed windows with grey shutter boxes, two storeys at today's heights, the neighbouring houses unchanged. Fix the texture coordinates (Task 2) if the panels are not on the joints or the window is upside down, and retake.

3. **Commit:** `docs(buildings): screenshots of the row-house facade for review (#45)`.

## Task 6 — changelog and PR

**Files:** `CHANGELOG.md`.

1. Under `## [Unreleased]` → `### Added`, add one player-facing line:

   ```markdown
   - The row houses on the Bodenackerstrasse in Sisseln now look like the real ones: white walls with a yellow panel between every two houses, yellow-framed windows and grey roller shutters, instead of the generic plaster.
   ```

2. **Commit:** `docs(changelog): row-house facades on the Bodenackerstrasse (#45)`.

3. Push and open the PR against `main`: title `feat(buildings): facade texture for the Bodenackerstrasse row houses (#45)`. Body: Summary, Changes, Testing (`node --test`, `pytest prototype/tests/test_row_houses.py`, smoke/labels/debug suites, the two screenshots embedded with relative links), Checklist. State explicitly: "No Street View imagery committed; texture painted procedurally." Note the expected `osmBuilding()` conflict with #43 if that PR is open.

## Verification summary

- `node --test prototype/tests/` green.
- `python3 -m pytest prototype/tests/test_row_houses.py prototype/tests/test_smoke.py prototype/tests/test_street_labels.py prototype/tests/test_debug.py -q` green, run in the foreground.
- Screenshots committed and visible in the PR.
- `git grep -i "streetview\|street view\|google" prototype/ docs/ai-notes/screenshots/` finds nothing new.
