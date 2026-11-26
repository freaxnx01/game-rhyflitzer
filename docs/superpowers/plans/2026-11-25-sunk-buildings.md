# Flat-roof buildings on slopes (#1200) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A flat-roof building on a slope rises out of the ground as measured, and a building part that lies under the ground where the car (or walker) is can no longer block it as an invisible wall.

**Architecture:** Two pure helpers in `world.js` (`flatRoofLevels`, `buriedSolid`), used by `osmBuilding`'s flat-roof path and by `collide()` / `footBlocks()` in `index.html`.

**Tech Stack:** buildless ES modules, `node --test`, Playwright (pytest).

**Spec:** issue #1200 (body) plus the maintainer's decision of 2026-11-25: "Both" — (1) roof at ground under the centroid + h, walls from the lowest ground point; (2) a building whose top is under the ground at the car's spot cannot block. Gable houses keep their drawing.

## Background

- `pipeline/building_heights.py` measures `h` (eaves) over the ground at the footprint **centroid** (`poly.centroid`, swissALTI3D). The game today draws the flat roof at `min ground over the ring + h`, so on a slope the roof ends up below the higher ground (school `210046850`: ground 34.5–42.5 m, roof 39.1 m).
- `osmBuilding` (index.html ~2084): flat-roof path calls `extrudeFootprint(b.ring, base, h, …)` and `pushOBB({ …, h: base + h, ring: b.ring })`.
- `collide(r)` (~6344) and `footBlocks(o, x, z, y, under)` (~5717) decide which solids block.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Only the flat-roof branch of `osmBuilding` changes its drawing (not the gable branch, not `landmarkReplaces`, not `bodenackerBuilding`). The wall texture role keeps being chosen from the record's own height (`Math.max(b.h, 3)`), not from the new taller wall, so no building changes texture; the seeded `rr()`/`rnd()` call order stays exactly as it is.
- Ground at the centroid uses the same function the game already uses for the ring minimum (`terrainH`).
- `buriedSolid` applies only to solids from OSM buildings (flag them `bldg: true` in the `pushOBB` calls of `osmBuilding` (flat path), the gable path's `addOBB` result, and `landmarkReplaces`) — never to bridges, tunnel/cave, underpass walls, trees, props.
- Margin: a solid is buried when `ground >= o.h - 0.2` (ground = `terrainH` at the car/walker position).
- Browser tests: only the affected files, foreground, under `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0`, pipeline venv python `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest`. Node: `node --test tests/*.test.mjs`.
- CHANGELOG entry (German, for players, newest first, real umlauts, capitalised Du/Dir, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`). All commits reference #1200.

## Review Focus

1. Car on a roof or in the air above a building (jump, heli drop): `buriedSolid` uses the **terrain** under the car, not the car's height, so a building standing on flat ground still blocks a car that comes down next to it.
2. Centroid outside the ring (U- or L-shaped footprint): the roof is never lower than today (`top >= min + h`).
3. Buildings on flat ground: identical roof height to today (± 0.05 m).
4. Walker (`footBlocks`) gets the same rule as the car.
5. 1952 layer: modern buildings' `off` handling is untouched.

---

### Task 1: Roof from the centroid ground, buried solids don't block

**Files:** `world.js`, `index.html` (`osmBuilding` flat path, gable path's OBB, `landmarkReplaces`, `collide`, `footBlocks`), `tests/world.test.mjs` (or the node test file that covers `world.js` helpers), new `tests/test_sunk_buildings.py`, `CHANGELOG.md`

**Interfaces (world.js, exported, pure):**
- `flatRoofLevels(ring, h, groundAt) -> { base, top }` — `base` = min of `groundAt(x, z)` over the ring; `c` = area centroid of the ring (shoelace; fall back to the vertex mean for a degenerate ring); `top = Math.max(base + h, groundAt(c.x, c.z) + h)`.
- `buriedSolid(o, ground) -> boolean` — `!!o.bldg && ground >= o.h - 0.2`.
- `index.html` exposes `window.__mm.buildingTop(id)` → the `h` (top) of that OSM building's solid, or `null`.

- [ ] Node tests: `flatRoofLevels` on a 10 × 10 square with flat ground 5 → `{ base: 5, top: 5 + h }`; on a slope `groundAt = (x) => x` over x 0..10 → base 0, top 5 + h; U-shaped ring whose centroid lies in the notch on low ground → top equals base + h, never less. `buriedSolid`: `{bldg:true,h:10}` with ground 9.9 → true, 9.7 → false; `{h:10}` (no flag) with ground 20 → false.
- [ ] Browser tests (`tests/test_sunk_buildings.py`, world loaded with `?region=sisseln`, same READY/start pattern as `tests/test_era_toggle.py`):
  - `test_school_roof_follows_the_measured_ground`: `__mm.buildingTop(210046850)` ≥ 44.0 (centroid ground ≈ 40 + 4.6; today 39.1).
  - `test_no_invisible_wall_north_of_the_school`: `__mm.sim(1890, 1922.9, -Math.PI / 2, 8, 2)` travels ≥ 10 m (today 0 m).
  - `test_school_still_blocks_where_it_stands`: `__mm.sim(1870, 1915, Math.atan2(22, 18), 10, 3)` travels < 10 m (today 4.5 m; the car runs into the visible wing).
- [ ] Watch them fail, implement, run the node suite and `tests/test_sunk_buildings.py`, plus `tests/test_era_toggle.py` and `tests/test_buildings*.py` / any browser file that pins building heights (grep `tests/` for `rect`, `roofFlat`, `extrudeFootprint`, `buildingTop`, `colliderPush`).
- [ ] CHANGELOG, e.g. ``- `<ts>` Gebäude mit **Flachdach** am **Hang** stecken nicht mehr halb im Boden: Die **Schule Sisseln** steht jetzt ganz da, und wo ein Gebäude doch unter dem Boden liegt, gibt es keine **unsichtbare Wand** mehr.``
- [ ] Commit `fix(world): flat roofs on slopes from the measured ground, buried parts no longer block (#1200)`.
