# Südspange as a jump target (#125)

## Goal

**J** lists "Südspange Sisslerfeld" so a player can jump to the new road's start at the K295 junction. It must work today, before the road exists in the world (#42), and keep working after #42 lands.

## What the world has today (probed 2026-10-09 in `data/world_hochrhein.json`)

- The K295 Laufenburgerstrasse is road index 5 (`primary`), **10.7 m** from the junction point (1528, 409) fixed by #42's acceptance criteria.
- Nothing named "Südspange" exists; the construction way `w1417144102` is dropped by `pipeline/world_roads.py:24-33` (`keep()` has no `construction`). #42 brings it in.
- The Sisslerstrasse end (32.8, 402.1) lies on three `residential` roads; the track crossing (1240, 574) is 17.9 m from a `service` road.
- `anchors.landmarks` has no Südspange key, and `pipeline/anchors.json` is not touched here (a new anchor needs a world re-bake, which #42 already does).

## Design

One new row in `LANDMARK_INFO` (`prototype/landmarks.js`): `{ name: 'Südspange Sisslerfeld', gemeinde: 'Eiken', at: [1528, 409] }`, listed after `LANDI-Turm`.

- **Position:** the K295 junction, the road's start. It is a fixed world coordinate, not a world object, so it uses the `at: [x, z]` source from #94 (`sourcePos` returns `{x: at[0], z: at[1]}`).
- **While the road does not exist:** `jumpTo` snaps `(x, z)` to the nearest jumpable road, which is the K295 (10.7 m away). The player lands at the future junction. Nothing in the entry needs the new road.
- **After #42:** the same coordinates are the Südspange's first node, so the snap picks the K295 or the Südspange's first metres, both at the junction. No change needed; there is **no dependency on #42** in either direction.
- **No `jump`/`faceToward`:** the car keeps the road's heading (`prototype/index.html:1243`); the junction has no "right" facing.
- **Gemeinde:** Eiken (the junction lies between DSM-Kamin at (1065, 345) and Bahnhof Sisseln at (1940, 539), both Eiken). No chip change.

### Relation to #94

#94 adds Bergsee, fixes the Plattform and introduces the `at` source. This issue adds one row and, if #94 is not on `main` yet, the identical one-line `at` branch of `sourcePos`; the merges are textual and touch different rows. #94 is not duplicated: no Bergsee, no Plattform, no Hallenbad.

## Out of scope

The road itself, its signs and its HUD name (#42); the autopilot's destination list (#18 reads `LANDMARK_INFO` and gets the entry for free); other jump spots (#94).

## Assumptions

- **A1** [high] The target is the K295 junction (1528, 409), the road's start. Rejected: the track crossing or the Sisslerstrasse end. #42's acceptance criteria fix the junction coordinate; the start is where a player expects to begin driving it.
- **A2** [high] No dependency on #42: the entry snaps to the nearest existing road. Rejected: waiting for #42. Evidence: world road 5 (`primary`, K295) lies 10.7 m from the point today.
- **A3** [high] An `at: [x, z]` source, not an anchor. Rejected: `pipeline/anchors.json` (needs a world re-bake). Evidence: `prototype/landmarks.js:20-25` (`sourcePos` has anchor and building only); #94 A5.
- **A4** [med] Gemeinde = Eiken. Rejected: Münchwilen (Plattform Sisslerfeld's chip) and Sisseln. Evidence: `LANDMARK_INFO` puts DSM-Kamin and Bahnhof Sisseln in Eiken; the junction is between them (x 1065 to 1940).
- **A5** [med] Name "Südspange Sisslerfeld", the project's own name, shown in both languages. Proper names are not translated (`prototype/strings.js:2`).

## Consequences

- The J list grows by one row (one more in the Eiken chip); count assertions in `landmarks.test.mjs` and `test_jump.py` move by one.
- A player jumping there today lands on the K295 and sees no Südspange; #42 makes the destination real.
- The row stays valid if #19 enlarges the box (origin kept).
