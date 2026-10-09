# Südspange Sisslerfeld as a jump target — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-09 · Issue #125 · builds on #41, #46, #81 · related #42, #94

## Goal

The **J** list (#41) offers the **Südspange Sisslerfeld** under the Eiken chip, found by typing `sudspange` or
`südspange`, and Enter puts the car on a road at the junction where the road is planned to start — today the
K295, once #42 draws the Südspange, the Südspange itself.

## The facts (verified 2026-10-09 against `data/world_hochrhein.json`; `main` @ `8d42d5a`)

- **The target point is game (1528, 409)**, the junction of the planned Südspange with the K295, fixed by #42's
  acceptance criteria.
- **A road is already there.** The nearest jumpable road segment (the `jumpable` filter of
  `prototype/index.html`: no bridge, no motorway) to that point is road index 5, `cls primary`,
  `n Laufenburgerstrasse` — the K295 — at **0.10 m**, closest point (1528.1, 409.0). So `nearestJumpable` snaps
  the car onto the K295 right at the junction and the entry needs no world change and no dependency on #42.
- **Gemeinde: Eiken.** `LANDMARK_INFO` already puts DSM-Kamin (x 1065) and Bahnhof Sisseln (x 1854) in Eiken; the
  junction at x 1528 lies between them.
- **`sourcePos` today knows two sources** (`prototype/landmarks.js:43-50`): an `anchors.landmarks` key and a world
  building id. Neither can carry a point that is in no world file, and `pipeline/anchors.json` would need a world
  re-bake. #94 has not landed, so there is no `at` source yet.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Target point | The K295 junction, game **(1528, 409)** — the road's start. | Fixed by #42's acceptance criteria, and where a player expects to begin driving the new road. Rejected: the track crossing and the Sisslerstrasse end. |
| Source kind | A new third `sourcePos` source, `at: [x, z]`, returned before the anchor and building branches. | The point is not in the world file and must not need one. Rejected: a `pipeline/anchors.json` anchor — it needs a world re-bake, and `data/` is out of scope. |
| Dependency on #42 | None. The row snaps to the nearest existing road. | The K295 lies 0.1 m from the point today, so J works now; #42 only makes the destination worth looking at. |
| Name | `Südspange Sisslerfeld`, unchanged in `de` and `en`. | The project's own name; proper names are not translated (`prototype/strings.js:2`), like every other J entry. |
| Gemeinde | `Eiken`. | Boundary-consistent with DSM-Kamin and Bahnhof Sisseln, which flank the junction. Rejected: Münchwilen (the Plattform's chip) and Sisseln. |
| Place in the table | After `LANDI-Turm`, i.e. last in the Eiken block. | The #46 rule: new entries go at the end of their Gemeinde block, so the chip order stays stable. |
| No model | Nothing is drawn at the point. | #42 owns the road; this issue is a list row and a jump target only. |

## Consequences

- The J list grows by one row, one more under the Eiken chip. `LANDMARK_INFO.length`, `ALL_ROWS` and the Eiken
  row lists move by one.
- Because `at` needs no anchor, the row appears whenever a world file is served, regardless of which anchors or
  buildings that world carries. Without a world file the hand layout replaces the landmark list with the race
  points, so there is no row and no error — the same graceful degradation as the other landmarks.
- A player jumping there today lands on the K295 and sees no Südspange.
- The row stays valid if #19 enlarges the box, since the origin is kept.

## Testing

- **Node** (`prototype/tests/landmarks.test.mjs`): the row (Eiken, `at: [1528, 409]`, no `jump`); it resolves to
  its fixed point from `landmarkEntries(LANDMARK_INFO, {}, [])`, i.e. with no anchors and no buildings; it is
  found by `sudspange`, `südspange` and `SISSLERFELD`; the entry-count and Eiken-list assertions follow.
- **Browser** (`prototype/tests/test_jump.py`): `sudspange` + Enter lands within 40 m of (1528, 409) and within
  4 m of a jumpable road (`_jumpable_road_dist`, the same check #79's Fridolinsbrücke test uses). No assertion
  about a Südspange road — that is #42.

## Out of scope

- Drawing the Südspange (#42).
- The other jump spots of #94 (Bergsee, Plattform, Hallenbad).
- Any `pipeline/`, `data/` or `prototype/index.html` change.
