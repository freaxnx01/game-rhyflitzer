# Grass over profiled roads in yield ramps (#1247) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wherever a #1152-profiled road passes through a yield ramp (`0 < profileW < 1`, beside a 1 m patch), the grass no longer stands over the drawn road. The #1152 smoothed profile stays as it is.

**Architecture:** In a ramp, `roadHeightFn` (index.html) blends the profile with the *fitted* ground `terrainH`. On a crest that puts the road under the ground by `w·(G − y)` (measured: 0.25 m at x 1556.7 / z 715.4). This plan blends with the ground *before the fit* instead (`unfittedH`: the 1 m patch or `meshH`, the same `m` that `buildFit` fits from). Then road − ground = `w·sag ≥ 0`. Where `w = 1` nothing changes, and `buildFit` / `FIT_CELLS` stay untouched. Spec: `docs/superpowers/specs/2026-11-27-grass-over-profiled-road-design.md`.

**Tech Stack:** Vanilla JS (index.html, world.js), Playwright + pytest browser tests, `node --test`.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Keep the #1152 smoothed profile. Never lift a road onto the unfitted terrain crest. Do not change `buildFit`, `fitRoad`, `roadFitAt`, `FIT`, `FIT_CELLS` or `ribbonLift`.
- The #1152 tests stay **unchanged**: do not edit `CHECKS`, `test_roads_on_profile_smooth_uncovered_and_no_cracks` or `test_noprofile_is_the_old_drape` in `tests/test_road_profiles.py`.
- Browser tests run in the **foreground**, one file at a time, and only the files named here (the full suite takes ~2 h). On the agent box: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest <file> -q -s`. In CI, use the runner's usual browser.
- Commit and push the branch before a long verification run.
- CHANGELOG: write the entry by hand. Never run `git cliff -o`.

## File Structure

- `tests/test_road_profiles.py`: a new test function `test_road_stays_over_the_ground_in_yield_ramps` plus its own JS constant `RAMP`. Existing code untouched.
- `tests/test_smoke.py`: `test_grass_and_fields_stay_below_the_road`, which asserts that the #1247 spots are probed.
- `index.html`: `GRASS_SPOTS` in `window.__mm.grassOverRoad` (6 spots added), a new `unfittedH` next to `terrainH`, and one changed line in `roadHeightFn`.
- `CHANGELOG.md`: one `### Fixed` entry under `[Unreleased]`.

---

### Task 1: Failing test, terrain over the road in yield ramps

**Files:**
- Modify: `tests/test_road_profiles.py` (append after `test_noprofile_is_the_old_drape`, do not touch anything above)

- [ ] **Step 1: Write the failing test**

Append this block after `test_noprofile_is_the_old_drape`:

```python
# #1247: #1152 AC 9 across the carriageway, but only where the profile yields (0 < profileW < 1): the band beside a 1 m
# patch that CHECKS leaves out. Same exclusions as CHECKS (the no-data cliff, off the terrain grid); no raycasts.
RAMP = """async () => {
  const W = await import('./world.js'), mm = window.__mm, out = { covered: 0, sampled: 0, worst: 0, at: null };
  for (const r of mm.profiled()) {
    const len = W.polylineLength(r.pts), hw = r.w / 2;
    for (let t = 0; t <= len; t += 4) {
      const k = Math.round((r.zpFrom + t) / 4), near = r.zp.slice(Math.max(0, k - 1), k + 2);
      if (near.some((v, i, a) => i && Math.abs(v - a[i - 1]) > 1)) continue;
      const [x, z] = W.pointAtLength(r.pts, t), a = W.pointAtLength(r.pts, Math.min(len, t + 0.5)), dx = a[0] - x, dz = a[1] - z, l = Math.hypot(dx, dz) || 1;
      for (let s = -hw + 0.3; s <= hw - 0.3; s += 1) {
        const px = x - dz / l * s, pz = z + dx / l * s, w = mm.profileW(px, pz);
        if (!(w > 0 && w < 1)) continue;
        const rs = mm.roadSurf(px, pz), fx = (px - mm.gridX0) / 16, fz = (pz - mm.gridZ0) / 16;
        if (rs === -Infinity || fx < 0 || fz < 0 || fx > mm.gridNx || fz > mm.gridNz) continue;
        out.sampled++; const d = mm.terrainAt(px, pz) - rs;
        if (d > 1e-3) { out.covered++; if (d > out.worst) { out.worst = d; out.at = [px, pz]; } }
      }
    }
  }
  return out;
}"""


def test_road_stays_over_the_ground_in_yield_ramps(server):
    with sync_playwright() as p:
        b, page, errors, _ = load(p, server)
        r = page.evaluate(RAMP); b.close()
    assert errors == [], errors
    print("\n#1247 ramp", r)
    assert r["sampled"] > 300, r            # 349 profile stations lie in a ramp (probe 2026-11-27), several samples each
    assert r["covered"] == 0, r
```

- [ ] **Step 2: Run it and watch it fail**

Run: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_road_profiles.py -q -s -k yield_ramps`
Expected: FAIL on `covered == 0`, with `covered > 0` and `worst` around 0.2 m or more. The 2026-11-27 probe found 0.25 m at x 1556.7 / z 715.4.

- [ ] **Step 3: Commit**

```bash
git add tests/test_road_profiles.py
git commit -m "test(world): terrain must not cover profiled roads in yield ramps (#1247)"
```

---

### Task 2: Failing test, the #1247 spots in the fixed `grassOverRoad` list

**Files:**
- Modify: `tests/test_smoke.py` (`test_grass_and_fields_stay_below_the_road`, around lines 283-306)
- Modify: `index.html` (`GRASS_SPOTS` in `window.__mm.grassOverRoad`, search `const GRASS_SPOTS`)

- [ ] **Step 1: Write the failing assertion**

Above `test_grass_and_fields_stay_below_the_road`, add:

```python
# #1247: grass over the Laufenburgerstrasse (Sisseln -> Eiken) in a yield ramp -- the issue's four spots and the probe's two worst
SPOTS_1247 = [(1558.5, 715.5), (1558.5, 709.5), (1549.4, 469.2), (1514.3, 375.7), (1556.7, 715.4), (1546.9, 467.8)]
```

Inside the `if mode == "osm":` block, after the existing `all(s["d"] < 0.01 ...)` line, add:

```python
        probed = {tuple(s["at"]) for s in res["spots"]}
        assert all(s in probed for s in SPOTS_1247), (SPOTS_1247, res["spots"])   # #1247: on drawn road and grass, so checked
```

- [ ] **Step 2: Run and watch it fail**

Run: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_smoke.py -q -s -k "grass_and_fields_stay_below_the_road and osm"`
Expected: FAIL on the new assertion, because the spots are not in the list yet.

- [ ] **Step 3: Add the spots**

In `index.html`, extend the `GRASS_SPOTS` array. Append after `[286, 418.5]` and update the comment:

```js
  const GRASS_SPOTS = L && only === null ? [   // #290: the measured spots (issue + Geuerenstrasse feedback 2026-10-29/30); #1247: yield ramps
    ...existing entries unchanged...,
    [271, 417.74], [274, 417.89], [277, 418.05], [280, 418.2], [283, 418.35], [286, 418.5],
    [1558.5, 715.5], [1558.5, 709.5], [1549.4, 469.2], [1514.3, 375.7], [1556.7, 715.4], [1546.9, 467.8]] : [], spots = [];
```

- [ ] **Step 4: Run again and watch it fail for the right reason**

Same command. Expected: FAIL on `all(s["d"] < 0.01 ...)`, with the #1247 spots reading `d` of about 0.03–0.25 m. The spots are probed now, and the bug is still there.

- [ ] **Step 5: Commit**

```bash
git add tests/test_smoke.py index.html
git commit -m "test(world): pin the #1247 grass-over-road spots in grassOverRoad"
```

---

### Task 3: Blend the ramp's road with the ground before the fit

**Files:**
- Modify: `index.html` (new `unfittedH` right after `terrainH`, around line 1717; `roadHeightFn`, around line 2896)

- [ ] **Step 1: Confirm the failing tests**

Tasks 1 and 2 are red. Do not change them.

- [ ] **Step 2: Add `unfittedH` directly after `function terrainH`**

```js
// #1247: the ground before the #1152 fit -- a 1 m patch (CUT_CELLS) or the mesh: the m buildFit fits from. A yield ramp's
// road blends to this, not to terrainH: blended with the fitted ground G = m + w·Δ it lies w·(G − y) under it on a crest
function unfittedH(x, z) {
  const G = TGRID, fx = (x - G.x0) / G.dx, fz = (z - G.z0) / G.dz;
  if (CUT_CELLS.size && fx >= 0 && fz >= 0 && fx <= G.nx && fz <= G.nz) {
    const i = Math.min(Math.floor(fx), G.nx - 1), j = Math.min(Math.floor(fz), G.nz - 1), p = CUT_CELLS.get(i + ',' + j);
    if (p) return patchH(p, CUT_N, fx - i, fz - j);
  }
  return meshH(x, z);
}
```

Leave `terrainH` itself unchanged. It is on the per-frame hot path.

- [ ] **Step 3: Change the blend in `roadHeightFn`**

In `function roadHeightFn(r)`, replace the tail

```js
return w >= 1 ? y : w * y + (1 - w) * terrainH(p[0], p[1]); }; }
```

with

```js
return w >= 1 ? y : w * y + (1 - w) * unfittedH(p[0], p[1]); }; }
```

Add to the comment line above `roadHeightFn`: `// #1247: the yield blend goes to the ground before the fit (unfittedH): road − fitted ground = w·sag ≥ 0`.

- [ ] **Step 4: Run Task 1's test and watch it pass**

Run: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_road_profiles.py -q -s -k yield_ramps`
Expected: PASS, `covered == 0`.

If a small residual remains (`worst` of a few mm, from linear interpolation between the 4 m ribbon stations and the 4 m fit lattice), stop and report it with `at`. Do not loosen the test, and do not lift the road onto `terrainH`.

- [ ] **Step 5: Run Task 2's test and watch it pass**

Run: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_smoke.py -q -s -k "grass_and_fields_stay_below_the_road and osm"`
Expected: PASS. All spots, including the six from #1247, read `d < 0.01`.

- [ ] **Step 6: Commit and push**

```bash
git add index.html
git commit -m "fix(world): profiled road in a yield ramp blends to the unfitted ground (#1247)"
git push
```

---

### Task 4: Regression, #1152 unchanged and neighbouring checks green

**Files:** none (verification only)

- [ ] **Step 1: #1152 tests, unchanged**

Run: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_road_profiles.py -q -s -k "smooth_uncovered or noprofile or yield_ramps"`
Expected: 3 passed. `git diff origin/main -- tests/test_road_profiles.py` shows only the appended `RAMP` and `test_road_stays_over_the_ground_in_yield_ramps`.

- [ ] **Step 2: The car still drives on the drawn road (osm)**

Run: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_smoke.py -q -s -k "wheels_do_not_sink and osm"`
Expected: PASS.

- [ ] **Step 3: Yield sources (grade cut, rail underpasses)**

Run each in the foreground, one at a time:
`... python3 -m pytest tests/test_suedspange.py -q -s` and `... python3 -m pytest tests/test_road_underpass.py -q -s`
Expected: PASS. Both areas are surrounded by yield ramps.

- [ ] **Step 4: Node unit tests**

Run: `node --test tests/world.test.mjs`
Expected: PASS (world.js is unchanged, so this is a sanity check).

---

### Task 5: CHANGELOG

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Fixed`; create the heading under `[Unreleased]` if it is missing, placed after `### Added`)

- [ ] **Step 1: Add the entry (newest first)**

Get the time with `TZ=Europe/Zurich date '+%F %H:%M'`, then add:

```markdown
- `YYYY-MM-DD HH:MM` Auf der **Laufenburgerstrasse** zwischen **Sisseln** und **Eiken** schaut kein **Gras** mehr durch die Fahrbahn; dasselbe gilt überall, wo eine geglättete Strasse nahe an einer Bahnbrücke oder Unterführung vorbeiführt.
```

- [ ] **Step 2: Commit and push**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): grass no longer pokes through the road near yield zones (#1247)"
git push
```
