# Trough walls for rail underpasses, then the world rebuild (#119)

Follow-up to #76 / #117. Spec of #76: `docs/superpowers/specs/2026-10-03-rail-bridges-underpasses-design.md`.

## Goal

Rail decks over roads (#76) ship in the game: the world file is rebuilt with its 18 `railBridges`, every underpass leaves
the ground under its deck ends where it is, and side roads that join near an underpass stay connected.

## Why #117 could not ship the rebuild

On the rebuilt world 9 of 16 crossings failed `railGap`: their cuts had to be 5–6 m deep, and the graded side bank
(`hw + margin + bank × depth` wide) undermined the deck ends. Measured on 2026-10-07:

- The relative cut (`depth` below `meshH`, then 8 % ramps over `depth / 0.08`) runs 45–80 m along the road. On a
  terrain hump (the rail embankment is in the DTM, e.g. the unnamed road by Bahndammstrasse: 16.7 → 24.6 → 22.0 m) it
  follows the hump and stays long.
- Side roads join 16–40 m from the crossing at four places (Kapfstrasse/Bahnhofstrasse, the unnamed road/
  Bahndammstrasse–Rütistrasse, Hauptstrasse Stein/Rohrmatt, Laufenburgerstrasse north/Dammstrasse–Neumattstrasse),
  inside the ramps.
- At Kapfstrasse and Hauptstrasse Stein the deck in the data is only ~1–1.5 m above the road.

## Decisions

| Topic | Decision |
|---|---|
| Wall extent | A **trough**: retaining walls on both sides along the whole cut, no graded banks. Nothing outside the road corridor is lowered, so deck ends keep their ground at any skew. |
| Wall top | Stone wall from the cut floor to **1 m above the ground** behind it (parapet), solid from both sides. Under the deck band the wall rises to the deck underside instead and has no parapet, so the deck runs over it. |
| Cut floor | An **absolute** height profile, not a depth below the terrain: `floor(s) = f0 + grade × max(0, |s| − flat)`, with `f0 = deckMin − deck − clear` (the #76 headroom rule) and `f0 ≥ meshH(crossing) − maxDepth`. The cut ends where the floor line meets the ground, so on a hump it is short. |
| Junctions in a cut | **Capped.** For each junction on the cut road inside the cut's reach, `f0 ≥ meshH(junction) − grade × max(0, |sJ| − flat)`: the ramp ends at or before the junction, and the side road stays at its own ground. That underpass gets less headroom. Side roads that descend with the cut are #120. |
| Capped headroom | Must stay **≥ 2.0 m** (a car passes). Estimated: Hauptstrasse Stein ~2.1 m, the others ~3–3.5 m. |
| Ramp grade | Unchanged, 8 % (`UNDERPASS.grade`), also for capped cuts. |
| Terrain resolution | Patch cells under a cut go from 2 m to **1 m** (`CUT_N` 8 → 16), so the step behind the wall face stays within 1 m and never reaches the road (`margin` 1 m). |

## Design

### Cut model (`prototype/world.js`, pure)

`UNDERPASS` loses `bank`. A cut is `{ pts, t, hw, flat, f0, reach, capped }`, plus the existing bookkeeping fields:

- `reach`: `[back, ahead]`, per side the first distance outward from the crossing where `floor(s) ≥ meshH`
  along the road (the cut ends there; later dips of the terrain are not cut). Found by sampling at 1 m in
  `index.html`, where `meshH` lives; at most `flat + maxDepth / grade`.
- `capped`: `null`, or `{ x, z, s }` of the junction that raised `f0`.

New and changed pure helpers:

- `cutFloor(c, s, u)`: `c.f0 + u.grade × max(0, |s| − c.flat)`.
- `cutFloorAt(c, x, z, u)`: the floor at `(x, z)` when `d ≤ hw + margin` and `−reach[0] ≤ n.t − c.t ≤ reach[1]`, else `null`.
- `junctionCap(f0, flat, junctions, u)`: takes `[{ s, ground }]` and returns `{ f0, capped }`. For each junction,
  `f0' = ground − u.grade × max(0, |s| − flat)`; it returns the highest of `f0` and all `f0'`, and the junction that
  set it.
- `cutBounds(c, u)`: pad `hw + margin + 1` (the 1 m wall-step cell), along `[−reach[0], reach[1]]`.
- `wallStations(c, step, u)`: `[{ s, x, z, side, rot }]` every `step` m along `[−reach[0], reach[1]]` at `±(hw + margin)`, for both
  sides.
- `cutDepthAt` and `bank` are removed.

The terrain in a patched cell is `min(meshH, lowest floor of all cuts there)`. Overlapping cuts (parallel tracks over
one road) take the lowest floor.

### Game (`prototype/index.html`)

- `makeCut`: computes `f0` from `deckMin` and the road's drawn ribbon (#117, unchanged) and the uncapped `reach`;
  then the junction cap from `L.junctions` on that road (`nearestOnPolyline(c.pts, jx, jz).d < hw + 2`) inside that
  reach, ground = `meshH` at the junction; then `reach` again with the capped `f0`.
- `cutDepth(x, z)` stays for debug as `meshH − terrainH`, so `window.__mm.cutDepth` keeps working.
- Walls: for each road with cuts, the stations of all its cuts every 2 m. A station is kept where
  `meshH − floor > 0.1` at the wall foot. Consecutive stations form ≤ 4 m pieces:
  - `box(len, height, 0.5, …, 'stone')` with the face at `hw + margin`, from the floor to `max(meshH) + 1`;
  - under the deck band (`|s| ≤ flat − apron`), to `max(meshH, deck underside)` and no parapet;
  - one OBB per piece via `pushOBB({ …, h: top, low: true })`.
- `collide`: an OBB with `low` is skipped while `P.y ≥ o.h − 0.2`, so a car on the deck crosses above the wall.
  Heli and camera use OBB `h` as today.
- `window.__mm.crossings()` adds `capped` (junction or `null`) and keeps `depth` (= `meshH(crossing) − f0`,
  clamped ≥ 0), `clearance` and `railGap` as defined in #76.

### Tests

- `world.test.mjs`: `cutFloor`, `cutFloorAt` (corridor edge, reach end, outside), `junctionCap` (no junction,
  a junction beyond reach, a junction near the crossing raising `f0`, two junctions), `cutBounds` holds every
  point with a floor, `wallStations` count and offsets.
- `test_underpass.py`:
  - `test_every_underpass_has_headroom`: per crossing, uncapped → `clearance ≥ 4.45` (or `depth ≥ 5.99`); capped →
    `clearance ≥ 2.0`; every crossing `railGap < 0.3`. It prints the capped list.
  - Laufenburgerstrasse (injected on main's world, as in #117) stays green.
  - New: driving along the cut road through a trough, the car stays on the floor (`y` within 0.3 of the drawn road)
    and is pushed back by a wall when steered into it; `pushAt` beside a wall moves the car out, while `pushAt` with
    the car at deck height over the same wall does not.
- Regression (targeted, the change is inert without `railBridges` except for the shared cut code):
  `test_smoke.py` grass/fields over road, wheels not sinking, trees on the railway, OSM layout.

### Rebuild (from #76's plan, Task 5)

Cache check, golden tests, build with `--dsm-heights` (caches live in the main checkout's `pipeline/cache`), the
guard (world differs from `main` only in `rail`, `railBridges`, `params.built`), `test_underpass.py` on the real world
with the crossing list pasted into the PR, then commit the world file.

### Docs

- CHANGELOG `[Unreleased]` → `Added`: the player-facing entry held back from #117, extended by: "The road runs
  between stone walls down there. Where a side street turns off right next to the bridge, the underpass is lower —
  mind your roof." 
- `TODO.md` „Railway down into the Sissle valley" line as written in #119.

## Out of scope

- Side roads descending into cuts (#120).
- Correcting deck heights in the data (Kapfstrasse, Hauptstrasse Stein are only ~1–1.5 m above the road).
- Height-limit signs at capped underpasses.
