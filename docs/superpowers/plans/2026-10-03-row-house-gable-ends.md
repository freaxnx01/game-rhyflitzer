# Row-house gable ends in the white facade colour (#87) — Implementation Plan

**Goal:** The two gable-end triangles of every pitched Bodenackerstrasse row house (blocks 10, 12, 14, 18, 19, 20, 21) are drawn white in the row-house facade material, matching the wall below; every other gable end, the roofs, the RNG sequence and the collision boxes are unchanged.

**Architecture:** `gable()` in `prototype/index.html` takes an optional trailing end descriptor `{ role, uv }` (default: today's `'wall'` role and inline UVs). `osmBuilding()` passes white and the row-house descriptor `ROW_GABLE_END` (role `rowHouse`, UVs pinned to the plain-plaster patch of `TEX.rowHouse`) for a row house. Spec: `docs/superpowers/specs/2026-10-03-row-house-gable-ends-design.md`.

**Tech:** vanilla JS (ES modules), three.js, Playwright (Python, SwiftShader) via `prototype/tests/conftest.py`'s `server` fixture.

## Global Constraints

- TDD: write the failing Playwright test first, run it, see it red against today's code, then implement. Never modify an existing test to make it green. Stop and report after 3 failed attempts.
- Surgical edits: touch only `prototype/index.html`, `prototype/tests/test_row_houses.py`, the new screenshot folder and `CHANGELOG.md`. No `world.js`, pipeline or `data/` change; no world rebuild.
- **No new `rr()`/`rnd()` call and no removed one** — the `PLASTER`/`ROOFS`/door draws in `osmBuilding()` keep running for row houses (seeded RNG, `index.html:222`).
- Playwright runs in the **foreground**, never `run_in_background`; give slow calls a generous `timeout`. Commit and push the branch before starting the slow checks.
- Commits: Conventional Commits, reference `#87`. Branch: `fix/87-row-house-gable-ends`.
- Line numbers below are from `main` at `b1ccd63`; re-locate by the quoted code if they drifted.

## Task 1 — failing Playwright test: gable ends carry the `rowHouse` role (TDD)

**Files:** `prototype/tests/test_row_houses.py`.

**Interface used:** `window.__mm.wallRoleAt(x, z, tx, tz, up)` (`index.html:1038`) — role of the first merged mesh hit by a horizontal ray from `(x, z)` towards `(tx, tz)`, `up` m above the terrain at the target.

1. Add a helper beside `outside_long_face()`:

   ```python
   def outside_gable_end(b, out=12.0):
       """A point `out` m outside the +x face of b.rect (the gable end: the ridge runs along w) and the footprint centre."""
       cx, cz, w, d, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
       lx, lz = w / 2 + out, 0.0
       return cx + lx * c - lz * s, cz + lx * s + lz * c, cx, cz
   ```

2. Add the test (after `test_row_houses_carry_the_facade_role_and_the_neighbour_does_not`):

   ```python
   GABLE_CONTROL_ID = 171822877   # Lerchenweg 11: gable path (h 3.0, rh 5.7), not a row house — its gable end stays plain 'wall'


   @needs_world
   def test_pitched_row_houses_have_rowhouse_gable_ends_and_other_gables_do_not(server):
       w = json.loads(WORLD.read_text(encoding="utf-8"))
       by_id = {b["id"]: b for b in w["buildings"]}
       pitched = sorted(i for i in ROW_IDS if i in by_id and by_id[i]["roof"] == "gable" and by_id[i]["rh"] >= 0.6)
       assert len(pitched) >= 1, "no row house takes the gable path in this world build"
       with sync_playwright() as p:
           br, page = open_page(p, server)
           hits = {}
           for i in pitched + [GABLE_CONTROL_ID]:
               b = by_id[i]; x, z, tx, tz = outside_gable_end(b)
               up = b["h"] + 0.4 * b["rh"]           # inside the end triangle: above the box top, below the ridge
               hits[i] = page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z}, {tx}, {tz}, {up})")
           br.close()
       assert all(hits[i] == "rowHouse" for i in pitched), hits
       assert hits[GABLE_CONTROL_ID] == "wall", hits[GABLE_CONTROL_ID]
   ```

   Today's world has seven pitched blocks (10, 12, 14, 18, 19, 20, 21, `rh` 3.2–3.3); the set is derived from the data so #34's re-measuring cannot break the test.

3. Run it in the foreground: `python3 -m pytest prototype/tests/test_row_houses.py -q -k gable_ends` (timeout ≥ 600 s). **Expected: red** — every pitched block returns `'wall'` (the `gable()` literal, `index.html:483`), the control returns `'wall'`.

   If a probe returns `'tree'`, `'roof'` or another building's role instead of `'wall'`, the ray is intercepted on the way in: lower `out` to 6.0 for that run (the triangle is ~15 m wide, the ray needs only to start outside the 0.45 m roof overhang). If it returns `None`, `up` landed above the ridge or below the eaves — check `b["h"]`/`b["rh"]` for that block and keep `up` strictly inside `(h, h + rh)`. Do not touch the existing tests.

4. **Commit:** `test(buildings): row-house gable ends must carry the rowHouse role (#87)`.

## Task 2 — `gable()` end descriptor and `ROW_GABLE_END`

**Files:** `prototype/index.html`.

1. Define the row-house descriptor right after `TEX.rowHouse` (`index.html:320`, after the closing `});`):

   ```js
   // #87: gable ends of a row house -- plain plaster only. The tile is 256 x 128: yellow panel at x 0-29, window frame at x 96-214 / y 22-116,
   // storey joint at y 0-3 (canvas y flips to v). u 0.14-0.35, v 0.05-0.90 is speckled white with nothing painted on it. Three (u, v) pairs:
   // eave-left, eave-right, ridge, in gable()'s tri() order
   const ROW_GABLE_END = { role: 'rowHouse', uv: [0.14, 0.05, 0.35, 0.05, 0.245, 0.90] };
   ```

2. Define the default descriptor and extend `gable()` (`index.html:475-483`). Replace the signature line and the end-triangle lines:

   ```js
   const GABLE_END_WALL = { role: 'wall', uv: null };   // #87: default gable end -- plaster texture, UVs computed per triangle
   function gable(w, d, h0, rh, x, z, rot, roofC, wallC, over = 0.45, end = GABLE_END_WALL) {
   ```

   and, in the gable-end part (the `tri` lambda and the final `rawGeo` call):

   ```js
     const gp = [], gn = [], gu = []; const hw2 = w / 2, hd2 = d / 2; const endUV = end.uv || [0, 0, d / 4, 0, d / 8, rh / 3];
     const tri = (a, b, c, n) => { gp.push(...a, ...b, ...c); gn.push(...n, ...n, ...n); gu.push(...endUV); };
     tri([hw2, h0, hd2], [hw2, h0, -hd2], [hw2, h0 + rh, 0], [1, 0, 0]); tri([-hw2, h0, -hd2], [-hw2, h0, hd2], [-hw2, h0 + rh, 0], [-1, 0, 0]); rawGeo(gp, gn, gu, rot, x, z, wallC, end.role);
   ```

   The roof-slab lines (`q(...)`, `rawGeo(pos, nrm, uv, rot, x, z, roofC, 'roof')`) stay as they are. `GABLE_END_WALL` must be declared before the first `gable()` call runs (module scope, above `function gable`, is fine — `const` in the same script block, evaluated before `build()` is invoked).

3. In `osmBuilding()`'s gable path (`index.html:576`) pass the row-house colour and descriptor:

   ```js
       gable(w, d, base + h, dsm ? b.rh : Math.min(w, d) * 0.4, cx, cz, rot, rc, row ? col('#ffffff') : wc, 0.45, row ? ROW_GABLE_END : GABLE_END_WALL); addOBB(cx, cz, w, d, rot, base + h); return;
   ```

   Keep the `wc`/`rc`/`door` draws on `:573-574` exactly as they are (RNG sequence).

4. Re-run Task 1's test in the foreground. **Expected: green** — seven `'rowHouse'`, control `'wall'`.

5. **Commit:** `fix(buildings): row-house gable ends in the white facade colour (#87)`.

## Task 3 — regression suite

1. `node --test prototype/tests/` — unchanged, must stay green (no `world.js` change).
2. Foreground: `python3 -m pytest prototype/tests/test_row_houses.py prototype/tests/test_smoke.py prototype/tests/test_street_labels.py prototype/tests/test_debug.py -q` (timeout ≥ 600 s). The long-face test, the roles list and the plates are untouched by this change; any red here is a real regression — stop and report after 3 attempts.
3. Push the branch now (`git push -u origin fix/87-row-house-gable-ends`) before the screenshot step.

## Task 4 — screenshot for a human

**Files:** `docs/ai-notes/screenshots/2026-10-03-row-house-gable-ends/original.png` (new).

Whether a plain, slightly stretched speckled white triangle reads right is a graphics call; a person decides from one picture.

1. Start `python3 -m http.server 8000` in the repo root (or reuse the `server` fixture in a one-off pytest), then run in the **foreground**:

   ```python
   import json, math
   from pathlib import Path
   from playwright.sync_api import sync_playwright

   OUT = Path("docs/ai-notes/screenshots/2026-10-03-row-house-gable-ends"); OUT.mkdir(parents=True, exist_ok=True)
   w = json.loads(Path("data/world_hochrhein.json").read_text(encoding="utf-8"))
   b = next(x for x in w["buildings"] if x["id"] == 171822933)        # 19a–19f, pitched
   cx, cz, bw, bd, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
   lx, lz = bw / 2 + 22, 8                                            # car 22 m off the gable end, a little to one side so the roof shows too
   x, z = cx + lx * c - lz * s, cz + lx * s + lz * c
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
       br.close()
   ```

   If `#startbtn` is not the start control, use whatever `test_smoke.py` clicks. If a tree or lamp blocks the view, move the car 5 m sideways (`lz += 5`) and retake.

2. Look at the PNG: the gable triangle is white like the wall below, no yellow panel and no window in it, the roof tiles unchanged, the neighbouring blocks' walls unchanged. If the triangle shows a yellow stripe or a window, the `uv` patch in `ROW_GABLE_END` is off — compare against the `TEX.rowHouse` painter (`index.html:306-320`), fix, retake.

3. **Commit:** `docs(buildings): screenshot of the row-house gable ends for review (#87)`.

## Task 5 — changelog and PR

**Files:** `CHANGELOG.md`.

1. Under `## [Unreleased]` → `### Fixed` (create the section if it does not exist yet, after `### Added`/`### Changed`), one player-facing line:

   ```markdown
   - The row houses on the Bodenackerstrasse with a pitched roof no longer wear a beige or pink triangle under the roof: their gable ends are white like the rest of the house.
   ```

2. **Commit:** `docs(changelog): white gable ends on the Bodenackerstrasse row houses (#87)`.

3. Push and open the PR against `main`: title `fix(buildings): row-house gable ends in the white facade colour (#87)`. Body: Summary, Changes, Testing (`node --test`, the pytest command from Task 3, the screenshot embedded with a relative link), Checklist, `Closes #87`. Note the expected one-line conflict on `osmBuilding()` with #71 if that PR is open.

## Verification summary

- `node --test prototype/tests/` green.
- `python3 -m pytest prototype/tests/test_row_houses.py prototype/tests/test_smoke.py prototype/tests/test_street_labels.py prototype/tests/test_debug.py -q` green, foreground; the new gable-end test was red before Task 2 and is green after.
- Screenshot committed and visible in the PR.
- `git diff main -- prototype/index.html` touches only `gable()`'s signature and end-triangle lines, the two new constants and `osmBuilding():576` — no RNG call added or removed.
