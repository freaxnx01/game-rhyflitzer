# More jump spots: Bergsee, Hallenbad, Plattform Sisslerfeld (design)

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #94 · split off #24

## Goal

The issue asks for three more destinations in the J list: **Bergsee**, **Hallenbad**, **Plattform Sisslerfeld**.

Success: J → "Bergsee" puts the car on the lake road facing the lake. J → "Plattform Sisslerfeld" puts the car on the road beside the tower, not inside it. J → "Hallenbad" keeps working. All three are found by typing their name.

## Starting point (verified 2026-10-03 on `main` @ `25a2dbc`, from the code and `data/world_hochrhein.json`, nothing run)

- **Hallenbad is already there.** `prototype/landmarks.js:25` has `{ name: 'Hallenbad Sissila', gemeinde: 'Sisseln', anchor: 'hallenbad' }`. The anchor is OSM `w170395848` (`pipeline/anchors.json:10`), world position (1968.0, -374.2). The nearest jumpable road is `Bodenackerstrasse`, 30.8 m from the centre. The building footprint is 42.7 × 47.1 m, so the car lands about 7 m from the wall. Typing "hallenbad" finds it. Nothing to add.
- **Plattform Sisslerfeld is already in the list** (`landmarks.js:18`, Münchwilen, anchor `plattform`), but the jump is bad. The anchor is at (53.8, 855.7). The road `Breitenloh` (residential) runs **0.4 m** from it, and `plattformTower` (`prototype/index.html:610`, placed at `:836`) stands on that spot and is solid (`test_smoke.py:227`). `jumpTo` snaps to the nearest road, so the car appears inside the tower's posts.
- **Bergsee exists in the world as OSM water.** `data/world_hochrhein.json` has two water chunks named `Bergsee`: `water[8]` (46,093 m², ring 0 centred (-2349, -2207), bbox x -2500…-2245, z -2350…-2134) and `water[7]` (9,259 m², centred (-2554, -2290), west of x = -2500). `water[7]` is the west part of the same lake, cut at x = -2500. Both are cut at the world's north edge (z = -2350). The road along the south shore is `Am Bergsee` (unclassified, jumpable). The lake centre (-2349, -2207) is inside `water[8]` ring 0. No anchor and no building mentions it, and no other file in the repo does.
- **Where it is.** About 2.3 km north of the Rhine and 1.2 km west of the Münster, on the German hillside above Bad Säckingen. The `boundaries` lines in the world file are Gemeinde borders as lines, not rings, so point-in-polygon is not possible. The Bad Säckingen–Wallbach border lies at x ≤ -4189 and the Bad Säckingen–Murg border at x ≥ 2020, so the lake at x ≈ -2400 sits between them. Its street is `Am Bergsee`.
- **Nearest-road jump for the lake** puts the car on `Am Bergsee` at (-2317.6, -2158.8), 57.5 m from the centre. That already works; a hand spot only improves the facing.
- **Dependency.** #79 (spec `2026-10-03-fridolinsbruecke-jump-spot-design.md`, plan `…-jump-spot.md`) is specified but not on `main`. It adds the per-entry `jump: [x, z]` field, passes it on as `j` in `landmarkEntries`, adds the pure helper `faceToward`, and changes `jumpTo` to snap `p.j` and face the landmark. This issue **uses** that mechanism and adds no second one. #80 (Sprungschanze ramp) edits the same table and the same file but another entry.

## Decisions

| Topic | Decision |
|---|---|
| Hallenbad | No code change. A node test pins that `LANDMARK_INFO` keeps the entry, so a later edit cannot drop it unnoticed. |
| Plattform | The existing entry gets `jump: [78.1, 861.4]`: on `Breitenloh`, 25 m east of the tower, 0.5 m from the road line. `jumpTo` (#79) faces the tower from there (the segment already points west, heading -2.91 rad). |
| Bergsee entry | `{ name: 'Bergsee', gemeinde: 'Bad Säckingen', at: [-2349, -2207], jump: [-2345, -2143] }`, listed after Aqualon Therme in Bad Säckingen. |
| New source `at` | `sourcePos` in `landmarks.js` also accepts `at: [x, z]` (hand game metres). This is the third source next to `anchor` and `building`. It is needed because the lake has no anchor and no building. |
| No anchor in `pipeline/` | A `pipeline/anchors.json` entry would need a world rebuild with the local DSM caches for one point, and the anchor models (`index.html:735-742`) key on anchor names. Same reasoning as #79 A1. |
| Jump spot for the lake | `(-2345, -2143)` lies 0.5 m from `Am Bergsee` (its heading is -0.48 rad, towards the lake: dot product with the direction to the centre is positive). The car faces the lake on arrival. |
| Strings | None. The toast stays the entry name. "Bergsee" is a proper name in both languages. |

## Design

### `prototype/landmarks.js`

- `sourcePos(item, anchors, buildingsById)`: `if (item.at) return { x: item.at[0], z: item.at[1] };` first, before the anchor and building branches. Pure, no DOM.
- `LANDMARK_INFO`: add the Bergsee entry after `Aqualon Therme`; add `jump: [78.1, 861.4]` to the Plattform entry with a comment `// #94: Breitenloh, 25 m east of the tower, which stands on the road`.
- `landmarkEntries` is unchanged: entries with `at` give `{ n, g, x, z }` (+ `j` from #79).

### `prototype/index.html`

No change. `jumpTo` (#79) snaps `p.j` and faces the landmark position.

## Testing (test-first)

- **Node** (`prototype/tests/landmarks.test.mjs`):
  - `landmarkEntries` reads an `at` item as `{ n, g, x, z }`, without needing anchors or buildings.
  - The real `LANDMARK_INFO` has Bergsee in `Bad Säckingen` with `at` and `jump`, Hallenbad in `Sisseln`, and Plattform in `Münchwilen` with a `jump` at least 15 m from its tower position (the anchor, read from `data/world_hochrhein.json` when the file exists).
  - World sanity (skipped if the file is missing): the Bergsee `at` lies inside a ring of a water chunk named `Bergsee`, and the `jump` of Bergsee and Plattform lies within 3 m of a road polyline.
- **Playwright** (`prototype/tests/test_jump.py`, OSM world; the file's `jump_via_dialog` helper):
  - "berg" → Enter: the car is within 80 m of the lake centre, on the road (not in the water), heading dot product towards the centre > 0.5.
  - "plattform" → Enter: the car is 15–40 m from the Plattform anchor, and driving 2 s forward (`__mm.sim`) does not end with the car inside the tower footprint (it faces the tower; the existing solid-tower test shows it stops).
  - "hallenbad" → Enter: within 60 m of the Hallenbad anchor (regression).
  - `__mm.jumpList()` includes the three names.

## Out of scope

- A lake or Bergsee model, shore props, or the part of the lake north of the world edge (the water polygon is cut at z = -2350).
- Moving the Plattform tower off the road (the tower position is the real site, `anchors.json:6`).
- Changing the Hallenbad entry or its Gemeinde.

## Assumptions

- **A1** [med] "Bergsee" is the Bergsee above Bad Säckingen: the two OSM water chunks named `Bergsee` at (-2349, -2207) with the road `Am Bergsee`. Rejected: leaving it out as unclear. Evidence: `data/world_hochrhein.json` `water[7]`, `water[8]`; no other water, anchor, building or road in the region has the name. The risk is that the author meant another lake outside this map.
- **A2** [med] Gemeinde = `Bad Säckingen`. Rejected: a new Gemeinde chip. Evidence: the border lines bracket it (Wallbach border x ≤ -4189, Murg border x ≥ 2020) and `Am Bergsee` is a Bad Säckingen address. Not a polygon test (the world has border lines only).
- **A3** [high] Hallenbad and Plattform already exist as entries, so only Bergsee is new. Evidence: `landmarks.js:18`, `:25`.
- **A4** [med] The Plattform gets a hand `jump` east of the tower, not west. Rejected: west (29.5, 849.8), equal in distance; east was picked because it is the side the road approaches from the village centre.
- **A5** [high] A new `at: [x, z]` source, not an anchor. Rejected: `pipeline/anchors.json` (needs a world rebuild, see Decisions). Evidence: `landmarks.js:20-25` (`sourcePos`) and the #79 spec A1.
- **A6** [high] This builds on #79's `jump`/`faceToward` and is implemented after #79 is on `main`. Rejected: duplicating the mechanism here. If #79 is still not merged at implementation time the plan stops at Task 1.

## Consequences

- #19 (region extension) adds J entries and Gemeinden to the same table. The merge is textual only. Game metres do not move with the larger box (origin kept, #19 A8), and the Bergsee stays at the north edge, so `at` and `jump` remain valid.
- #18 (autopilot) builds its destination list from the same `LANDMARK_INFO`. A destination in the lake (`at`) must be snapped to the road graph. The autopilot should prefer `j` over `x, z` when an entry has one, which also keeps it off the Plattform tower. That is for #18's own plan; this issue only supplies the data.
- #80 edits the Sprungschanze line in the same table; it and this issue do not touch the same entry.
- The chips are unchanged (`Bad Säckingen` and `Münchwilen` already exist).
- During a race, jumping to any of these still marks the run as jumped (`placeOnRoad`).
