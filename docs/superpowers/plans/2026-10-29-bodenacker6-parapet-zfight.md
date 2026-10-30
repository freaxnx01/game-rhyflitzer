# Bodenackerstrasse 6: stop the parapet band z-fighting the top storey (#453) Implementation Plan

**Goal:** The top storey of Bodenackerstrasse 6 (OSM way 171822634) no longer flickers when the camera moves. The white parapet band above the roof stops overlapping the top 2 m of the façade.

**Root cause (measured, see the spec):** `extrudeFootprint` always draws its walls from `base - 2` (`prototype/index.html:1268`). The parapet band is `extrudeFootprint(bodyWorld, base + h, BODENACKER6.parapet, …)` (`prototype/index.html:1371`), so its walls also cover `base + h - 2 .. base + h`, on the same ring as the façade quads. The result is two coplanar faces with different textures, which z-fight. On the GPU browser, 10.79 % (west) and 4.04 % (street) of the top-storey pixels flip per 2 cm camera step. Without the skirt both are 0 %.

**Architecture:** `extrudeFootprint` gets a trailing `below = 2` parameter, the same meaning as `wallQuads`' `below`. The parapet passes `0`. A test hook `window.__mm.wallRolesAt` returns every role hit at the first hit's distance (± 1 cm). It is the deterministic proxy for the z-fight.

**Files touched (for dispatch collision checks):**

- `prototype/index.html`: `extrudeFootprint` (~line 1263-1279), the parapet call in `bodenackerBuilding` (~line 1371), the `wallRoleAt` hook (~line 3845).
- `prototype/tests/test_bodenacker6.py`: one new test.
- `CHANGELOG.md`: one entry.

It does **not** touch `prototype/world.js` or the address-label block in `index.html`, which are #557's area. Both issues edit `index.html`, but in regions far apart, so a textual merge is clean.

**Global constraints (`CLAUDE.md`):**

- The stack is buildless, with no new dependency.
- Playwright runs in the foreground only, one file: `python3 -m pytest prototype/tests/test_bodenacker6.py -x`. Never `run_in_background`.
- Node tests run as `node --test prototype/tests/*.test.mjs`. They are unaffected, so run them once as a regression check.
- Commit and push after every task.
- CHANGELOG: one hand-written entry under `[Unreleased]` → `### Fixed`, prefixed with the timestamp from `TZ=Europe/Zurich date '+%F %H:%M'` (same style as the existing entries).
- Branch: `fix/453-parapet-zfight` from `main`.

---

### Task 1: failing test (RED)

**Files:** `prototype/tests/test_bodenacker6.py`, `prototype/index.html` (hook only)

**Interfaces:** `window.__mm.wallRolesAt(x, z, tx, tz, up = 2.5, eps = 0.01) → string[]`. It casts the same horizontal ray as `wallRoleAt` and returns the sorted, unique roles of every role-tagged hit whose distance is within `eps` of the nearest one, or `[]` if there is no hit.

- [ ] **Step 1: add the hook (test infrastructure, no behaviour change).** In `prototype/index.html`, replace the single `window.__mm.wallRoleAt = …` line (~3845) with:

```js
// #453: every role-tagged hit of that ray, nearest first: wallRoleAt takes the first, wallRolesAt the set at the first hit's distance (± eps) -- two roles there are coplanar faces, i.e. z-fighting
const wallHits = (x, z, tx, tz, up = 2.5, up1 = null) => { const from = new THREE.Vector3(x, up1 === null ? terrainH(tx, tz) + up : groundH(x, z, 1e4) + up, z), to = new THREE.Vector3(tx, up1 === null ? from.y : terrainH(tx, tz) + up1, tz), dir = to.clone().sub(from).normalize(); const ray = new THREE.Raycaster(from, dir, 0, from.distanceTo(to) + 1); return ray.intersectObjects([...Object.values(MESH), ...(INT.housing ? [INT.housing] : []), ...(CAVE_MODE.group && CAVE_MODE.group.visible ? [CAVE_MODE.group] : [])], true).filter(h => h.object.userData.role); };
window.__mm.wallRoleAt = (x, z, tx, tz, up = 2.5, up1 = null) => { const hit = wallHits(x, z, tx, tz, up, up1)[0]; return hit ? hit.object.userData.role : null; };
window.__mm.wallRolesAt = (x, z, tx, tz, up = 2.5, eps = 0.01) => { const hits = wallHits(x, z, tx, tz, up); return hits.length ? [...new Set(hits.filter(h => h.distance - hits[0].distance <= eps).map(h => h.object.userData.role))].sort() : []; };
```

Keep the two comment lines above it (`#45`, `#201`) unchanged.

- [ ] **Step 2: write the failing test.** Append to `prototype/tests/test_bodenacker6.py`:

```python
PARAPET = 0.5   # BODENACKER6.parapet: the white band between the eaves and the roof slab


def ray_from(wall, out=12.0, into=1.0):
    """A horizontal ray from `out` m in front of a layout wall's midpoint to `into` m behind it (outward = right of a→b, bodenacker6.js)."""
    (ax, az), (bx, bz) = wall["a"], wall["b"]; length = math.hypot(bx - ax, bz - az)
    nx, nz = -(bz - az) / length, (bx - ax) / length; mx, mz = (ax + bx) / 2, (az + bz) / 2
    return mx + nx * out, mz + nz * out, mx - nx * into, mz - nz * into


@needs_world
def test_top_storey_is_one_face_not_the_parapet_band_too(server):
    """#453: the parapet band reached 2 m down over the top storey, coplanar with the façade: z-fighting while the camera moves."""
    with sync_playwright() as p:
        br, page = open_page(p, server)
        layout = page.evaluate("() => window.__mm.bodenacker6()")
        fl = layout["floors"]; eaves = fl["roof"] - PARAPET
        longest = lambda face: max((w for w in layout["walls"] if w["face"] == face),
                                   key=lambda w: math.hypot(w["b"][0] - w["a"][0], w["b"][1] - w["a"][1]))

        def roles_at(wall, y):
            x, z, tx, tz = ray_from(wall)
            up = y - page.evaluate(f"() => window.__mm.probe({tx}, {tz})")["terrain"]
            return page.evaluate(f"() => window.__mm.wallRolesAt({x}, {z}, {tx}, {tz}, {up})")

        top = eaves - fl["pitch"] / 2
        street, back, end = (roles_at(longest(f), top) for f in ("street", "back", "end"))
        band = roles_at(longest("street"), eaves + PARAPET / 2)
        br.close()
    assert street == ["bodenacker"], street
    assert back == ["bodenackerLoggia"], back
    assert end == ["bodenacker"], end
    assert band == ["plasterWhite"], band   # the band itself stays, above the eaves
```

- [ ] **Step 3: run it and confirm RED for the right reason.**

```bash
python3 -m pytest prototype/tests/test_bodenacker6.py -x -k top_storey
```

Expected: FAIL on `assert street == ["bodenacker"]` with `['bodenacker', 'plasterWhite']`. This was measured on main at a 12 m ray: both faces sit at exactly 12.0000 m. If it fails for any other reason (hook error, `[]`, a different role), fix the test or the hook, not the production code.

- [ ] **Step 4: commit and push, open a draft PR.**

```bash
git add prototype/index.html prototype/tests/test_bodenacker6.py
git commit -m "test(buildings): top storey of Bodenackerstrasse 6 is one face (#453)"
git push -u origin fix/453-parapet-zfight
gh pr create --draft --title "fix(buildings): stop the parapet band z-fighting the top storey of Bodenackerstrasse 6" --body "Closes #453. Task 1 (RED test) done; Task 2 (fix) pending."
```

### Task 2: the fix (GREEN)

**Files:** `prototype/index.html`, `CHANGELOG.md`

**Interfaces:** `extrudeFootprint(ring, base, h, c, role, roofC = null, tile = [4, 3], uPerFace = false, below = 2)`

- [ ] **Step 1: add `below` to `extrudeFootprint`** (~line 1263). Make three edits:

```js
// before
function extrudeFootprint(ring, base, h, c, role, roofC = null, tile = [4, 3], uPerFace = false) {
// after
// #453: below = how far under base the walls reach (2 m skirt into the terrain, like wallQuads); 0 where the extrusion sits on other walls
function extrudeFootprint(ring, base, h, c, role, roofC = null, tile = [4, 3], uPerFace = false, below = 2) {
```

```js
// before
    const nx = -(z1 - z0) / L2, nz = (x1 - x0) / L2, y0 = base - 2, y1 = base + h;
// after
    const nx = -(z1 - z0) / L2, nz = (x1 - x0) / L2, y0 = base - below, y1 = base + h;
```

```js
// before
    const u0 = uPerFace ? 0 : along / tile[0], u1 = (uPerFace ? L2 : along + L2) / tile[0], v0 = -2 / tile[1], v1 = h / tile[1]; along += L2;
// after
    const u0 = uPerFace ? 0 : along / tile[0], u1 = (uPerFace ? L2 : along + L2) / tile[0], v0 = -below / tile[1], v1 = h / tile[1]; along += L2;
```

- [ ] **Step 2: the parapet passes `below = 0`** (~line 1371 in `bodenackerBuilding`):

```js
// before
  extrudeFootprint(bodyWorld, base + h, BODENACKER6.parapet, white, 'plasterWhite', col('#8f8a84'));   // the band's top is the roof slab
// after
  extrudeFootprint(bodyWorld, base + h, BODENACKER6.parapet, white, 'plasterWhite', col('#8f8a84'), [4, 3], false, 0);   // the band's top is the roof slab; #453: no 2 m skirt, it sat coplanar on the top storey's façade (z-fighting)
```

- [ ] **Step 3: run GREEN.**

```bash
python3 -m pytest prototype/tests/test_bodenacker6.py -x
```

Expected: all tests in the file pass, both the new one and `test_facades_by_side_and_the_roof_housing_is_plain`. Then run `node --test prototype/tests/*.test.mjs` once as a regression check. It needs no change.

- [ ] **Step 4: CHANGELOG.** Under `## [Unreleased]` → `### Fixed`, add at the top (timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`):

```markdown
- `<timestamp>` **Bodenackerstrasse 6**: the top storey no longer flickers with dark stripes when the camera moves. The white band under the roof edge was drawn 2 m down over the top row of windows, in the same plane.
```

- [ ] **Step 5: commit, push, mark the PR description as done.**

```bash
git add prototype/index.html CHANGELOG.md
git commit -m "fix(buildings): stop the parapet band z-fighting the top storey of Bodenackerstrasse 6 (#453)"
git push
```

Update the draft PR body with the TDD evidence (RED output from Task 1 Step 3, GREEN output from Task 2 Step 3).
