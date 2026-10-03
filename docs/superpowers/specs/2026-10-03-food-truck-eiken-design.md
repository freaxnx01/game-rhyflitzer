# Güggeli food truck in Eiken — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #103 · builds on #41, #46, #81 (anchor-keyed landmark models), #40 (car parks)

## Goal

A small low-poly food truck with a hand-painted **Güggeli** sign stands on a car park in Eiken, is solid, and the **J** list offers it under Eiken as **Güggeli-Foodtruck** so the car can jump to it. The spot is a plausible first guess that the user corrects later (user decision 2026-10-03), so the position is **one constant** in `pipeline/anchors.json`.

Success looks like:

- `data/world_hochrhein.json` (after a rebuild) has `anchors.landmarks.foodTruck = { x: 1758.5, z: 1986.5, kind: "foodTruck", rot: 0, h: null }`.
- In the OSM world a cream-and-red van with a serving hatch, an awning and a yellow **Güggeli** roof board stands on the Bahnhof Eiken car park; the console stays empty.
- Driving into it stops the car.
- **J** → `gugg` (or `food`, `truck`) lists **Güggeli-Foodtruck · Eiken**; Enter puts the car on the Bahnhofstrasse next to it.
- No real logo, lettering of a company, or a person's name anywhere in the model or the list (docs/07-brands-and-permissions.md).

## The facts (read 2026-10-03 from `data/world_hochrhein.json` on `main` @ `1723a10`; no browser run)

- **Eiken in the world file.** The world has no `place` nodes, so Eiken is the polygon closed by the Gemeinde boundary lines `boundaries` ids `123002062` (Eiken | Münchwilen), `123001743` (Eiken | Sisseln), `123269906` (Eiken | Murg), `123001440` (Eiken | Kaisten), `123001603` (Eiken | Oeschgen) and the world's south edge at `z = 2034.3`. Inside it: the industrial strip along the Sisslerstrasse / Hardstrasse in the north (the LANDI tower, Bahnhof Sisseln), the A3 junction with the **P & R Eiken** (`parking` id `51398881`, 62 bays, at (1519, 1051)), and the **village** in the south: Hauptstrasse (primary) at (1522, 1933), Bahnhofstrasse (residential) at (1692, 1939), **Bahnhof Eiken** (building `199241726`, ring mean (1709.8, 1936.5), already a J entry since #46).
- **Car parks in the village** (`parking`, #40; centroid, bays, nearest named road): `210461003` (1758.5, 1986.5) 12 bays, 22 m from the Bahnhofstrasse, no building within 45 m — the station car park; `36821079` (1812, 1964) 19 bays, Neumattstrasse; `52332559` (1953, 1960) 20 bays, Schulweg; `1077994615` (1592, 1915) 12 bays and `1077994617` (1639, 1878) 13 bays by the Hauptstrasse / Poststrasse, hemmed in by houses (Hauptstrasse 45 / 47 / 6 within 45 m), 25–46 m from a named road. Nothing in the world marks a village square (`Dorfplatz`) as such.
- **Chosen spot:** the centroid of lot `210461003`, game **(1758.5, 1986.5)**, inside its ring (point-in-polygon), inside the Eiken polygon, 70 m south-east of the station building, 22 m from the Bahnhofstrasse (heading 95.5°, roughly north–south). A food truck at the station car park is the plausible first guess; the user moves it later.
- **World edge:** the spot lies 48 m north of the world's south edge (`z = 2034.3`). Looking south from the truck shows the edge of the world; the screenshot is taken looking south-east at the hatch side from the north.

## Starting point in the code

- `pipeline/anchors.json` `landmarks`: an entry resolves from `osm`, `game` or `lonlat`; `kind`, `h`, `heading_deg` (→ `rot` radians) pass through (`pipeline/anchors.py:39-62`). `smileKreisel` is a `game` anchor already (`anchors.json:9`). A `game` anchor touches no building, so `exclude_buildings` stays as it is.
- `prototype/index.html:836-847`: the `if (L) { … }` block places landmark models by anchor key (`dsmChimney` `:589`, `waterTower` `:597`, `siloTower` `:604`, placement `:838`). `box(w, h, d, x, y, z, rot, c, role, tile, dark)` (`:474`) builds a rotated box whose `w` runs along heading `rot`; `push(role, geo)` (`:472`) merges into `MESH[role]` (`:891`); `addOBB(x, z, w, d, rot, h)` (`:518`) makes it solid for `collide` (`:1071`). `textTex(txt, w, h, bg, fg, font, border)` (`:322`) paints text on a canvas; `stationSign` (`:725`) shows a two-sided board placed with `signs.add(...)` (not part of `MESH`, so rays and `applyStyle` ignore it). Roles `hall` (plain painted panels, the Hallenbad) and `stone` exist.
- `prototype/landmarks.js:6-31` `LANDMARK_INFO` (24 entries); the Eiken block is `DSM-Kamin`, `Bahnhof Sisseln`, `Bahnhof Eiken`, `LANDI-Turm` (`:19-22`). `sourcePos` (`:40-47`) knows `anchor` and `building` only — #94's `at` is **not** on `main`. An entry whose anchor is missing from the loaded world is skipped.
- `jumpTo` (`index.html:1014`) snaps an entry without `j` to the nearest jumpable road and faces along it; the Bahnhofstrasse is 22 m away.
- Tests: `pipeline/tests/test_anchors.py` (`:75` the #81 repo-anchor test), `test_golden.py` (`:191`, needs the extract, skips otherwise); `prototype/tests/landmarks.test.mjs` (`:70` pins 24 entries, `:83` the Eiken names, `:117` the #81 anchor test); `prototype/tests/test_jump.py` keys row counts on the served world (`WORLD81`, `EIKEN_ROWS`, `ALL_ROWS`, `:28-31`; `:287` the #81 jump test); `prototype/tests/test_landi_tower.py` is the solidity pattern (`counts`, `wallRoleAt`, `sim`). Debug hooks: `__mm.place(x, z, th)` (`:1025`), `__mm.wallRoleAt` (`:1052`), `__mm.sim`, `__mm.counts`.
- The world file is rebuilt only locally (`pipeline/cache/*`, always `--dsm-heights cache`); CI has no caches (#81 Task 4 pattern).

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Spot | Bahnhof Eiken car park, OSM `amenity=parking` way `210461003`, centroid **(1758.5, 1986.5)**, heading **0°** (truck length east–west). | The one village car park with no house within 45 m and a named road 22 m away; a food truck at the station is plausible. The user said the spot is a first guess (A1). |
| Position constant | `pipeline/anchors.json` `landmarks.foodTruck = { "game": [1758.5, 1986.5], "kind": "foodTruck", "heading_deg": 0, "src": "…" }`. **Moving the truck = edit `game` (and `heading_deg`) and rebuild the world.** | The user's fallback when #94's `at` is not on `main` (it is not). One constant, same mechanism as `smileKreisel`. |
| J list | `{ name: 'Güggeli-Foodtruck', gemeinde: 'Eiken', anchor: 'foodTruck' }` after `LANDI-Turm` (end of the Eiken block, the #46 rule). 25 entries. No `jump`: the default snap lands on the Bahnhofstrasse. | `gugg`, `food` and `truck` find it (`foldText` drops the umlaut). The name carries no person's name (docs/07; a private person's name in a public repo and UI). |
| Model | New `foodTruck(x, z, rot)` in `prototype/index.html` after `siloTower`: a 5.6 × 2.3 × 2.3 m cream box body (role `hall`) on 0.6 m ground clearance, a 1.5 m red cab in front (local +x), four dark wheels (`stone`), a dark serving hatch on the local −z side (north at heading 0) with a red awning slab over it, a two-sided yellow roof board **Güggeli** in dark-red italic Barlow Condensed (`textTex`, placed via `signs`, like `stationSign`), and a small menu board **Güggeli · Pommes** beside the hatch. `addOBB(x, z, 7.1, 2.4, rot, b + 3)`. `window.__mm.counts.foodTruck = 1`. No `rr()` / `rnd()`. | Built in code like the car and the chimney (user). A hand-painted generic sign, no logo, no company name (docs/07). `signs` keeps the text out of `MESH`, so `wallRoleAt` sees the painted body (`hall`). |
| Before the rebuild | Anchor missing from the served world: no model, no J row, no error. Browser tests key on `"foodTruck" in anchors.landmarks` (`WORLD103`). | Graceful degradation, the #46 / #81 pattern. |
| Rebuild | Guarded local task (caches present, `--dsm-heights cache`, under the 2 GB cap, foreground). The rebuilt world may differ from `main`'s only by `anchors.landmarks.foodTruck` and `params.built`. | Same guard as #81 Task 4. A `game` anchor changes no building. |
| Screenshot | One PNG for a human in `docs/ai-notes/screenshots/2026-10-03-food-truck/hatch-side.png`: the car placed 16 m north of the truck looking at it, after the chase camera settles. | The look of the truck and whether the spot reads as "Eiken" are judgement calls (user: a screenshot step for a human). Same pattern as #45's plan Task 5. |
| Out of scope | Pickup / delivery logic (#107), the autopilot destination (#18), a minimap dot, a night light, a person's name on the truck, any real logo. | #107's depots are hand anchors with invented names, the same mechanism as this anchor; a "Güggeli" order type can hook into `foodTruck` later. Noted, not built. |

## Testing

- **Pipeline unit** (`pipeline/tests/test_anchors.py`): `anchors.json` has `landmarks.foodTruck` with `game == [1758.5, 1986.5]`, `kind == "foodTruck"`, `heading_deg == 0`; a `game` landmark resolves with its `kind` and `rot == 0`.
- **Golden** (`pipeline/tests/test_golden.py`, skips without the extract): `anchors.landmarks.foodTruck` at (1758.5, 1986.5), `kind == "foodTruck"`, `rot == 0`; the point lies inside the ring of `parking` id `210461003`, inside no building ring, and at least 5 m from every road centre line.
- **Node** (`prototype/tests/landmarks.test.mjs`): 25 entries; the Eiken names end with `LANDI-Turm`, `Güggeli-Foodtruck`; a stub anchor resolves it; `gugg`, `food` and `GÜGGELI` find it.
- **Browser** (`prototype/tests/test_jump.py`): `WORLD103` switch; `EIKEN_ROWS` and `ALL_ROWS` follow it; `gugg` + Enter lands within 80 m of the anchor (skipped until the world is rebuilt).
- **Browser** (`prototype/tests/test_food_truck.py`, new, skipped until the world is rebuilt): `__mm.counts.foodTruck == 1`; `wallRoleAt` from 12 m north of the centre hits `hall` (the painted hatch side); `__mm.sim` driving east at the truck from 25 m west at 12 m/s for 3 s is stopped before the centre.
- **Screenshot** for a human (committed PNG) and a playtest entry in `test-todo.md`.
