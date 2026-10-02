# Big village names from afar — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-02 · Issue #16

## Goal

From the playtest on 2026-10-01/02: when you drive towards a village from far away, its name floats large above it, like the district names in Midtown Madness.

Success: driving across the map, the names of the villages ahead hang big in the sky above them. They are readable from kilometres away. They fade out as you get very far away. They fade out as you drive into the village. Inside the village you don't see its own name.

## Starting point (verified 2026-10-02 on `main` @ `236cc61`)

- **Place data in the world file.** The only place names in `data/world_hochrhein.json` are `anchors.labels`, from `pipeline/anchors.json:25-33`: `BAD SÄCKINGEN (-1330, -300)`, `STEIN (-900, 560)`, `SISSELN (1950, -420)`, `SISSLERFELD (420, 300)`, two `RHEIN` labels and `HOLZBRÜCKE`. The positions are hand-placed for the minimap text anchor, not village centres. Sisseln's label sits about 290 m north-east of the village's OSM place node.
- **Minimap.** It draws `anchors.labels` as text in `700 15px "Barlow Condensed"`, colour `rgba(245,239,224,.9)`, all uppercase (`prototype/index.html:941`).
- **J menu.** `PLACES` (`prototype/index.html:846`) reuses those labels minus `RHEIN`. #41 (spec `docs/superpowers/specs/2026-10-02-jump-landmarks-design.md`, not implemented yet) turns it into a landmark list. Its Gemeinden are, west to east, Bad Säckingen, Stein, Münchwilen, Eiken and Sisseln. Positions come from the world, and names are hand-kept in the prototype.
- **Münchwilen and Eiken** are not in `anchors.labels`. Eiken's OSM place node (node 191017634, game ≈ (1697, 2140)) lies south of the world. Roads end at z ≈ 2034.
- **OSM place nodes.** The regional extract `pipeline/cache/osm/hochrhein.osm.pbf` is local and git-ignored. Read with `osmium tags-filter n/place=…` and converted with `pipeline/geo.py` `Frame(*DEFAULT_ORIGIN).to_game`, it gives these town and village nodes inside the world's road extent (x −4689…4750, z −2350…2034):

  | Name | OSM node | place | game x, z |
  |---|---|---|---|
  | Bad Säckingen | 240042433 | town | −1372.9, −263.1 |
  | Stein | 240097537 | village | −981.8, 615.7 |
  | Sisseln | 240055476 | village | 1677.6, −329.8 |
  | Münchwilen | 240115055 | village | −299.3, 1408.4 |
  | Mumpf | 192826016 | village | −3484.8, 596.6 |
  | Murg | 240124251 | village | 4361.6, −689.8 |
  | Wallbach (DE) | 3608448837 | village | −3984.9, −1744.8 |

  The other nodes inside the extent are hamlets or neighbourhoods: Rothaus, Obersäckingen, Rüti, Diegeringen. Sisslerfeld has no place node, because it is an industrial area.
- **Existing label pattern.** House numbers (#12) are camera-facing `THREE.Sprite`s from a pool. The pure helpers `addrLabels` and `pickLabels` are in `prototype/world.js:115-125` and unit-tested in `prototype/tests/world.test.mjs:135-150`. `updateLabels` runs every 250 ms from `hud()` (`prototype/index.html:727-734`, `:962`). `textTex(txt, w, h, bg, fg, font, border)` (`:238`) draws a text canvas texture.
- **Camera and fog.** `PerspectiveCamera(62, 1, 0.5, 4200)` (`:735`). The `original` style uses linear fog 320–1400 m and `smooth` uses `FogExp2(…, 0.00095)` (`:803-805`). A sprite drawn with fog would be invisible beyond about 1.4 km.
- **Keys.** One global `keydown` listener (`:816`). G is reserved by #48. This feature needs no key.
- **Test hooks.** `window.__mm.place(x, z)` (`:853`) puts the car anywhere. The race stays `ready`, so the car does not move. `__mm.labels()` / `labelSprites()` (`:858-859`) show the hook pattern. Playwright tests serve the repo root (`prototype/tests/conftest.py`), and `open_page(…, block_world=True)` gives the hand-traced layout (`prototype/tests/test_street_labels.py:15-27`).

## Decisions

| Topic | Decision |
|---|---|
| Places | 8 names: BAD SÄCKINGEN, STEIN, SISSELN, SISSLERFELD, MÜNCHWILEN, MUMPF, MURG, WALLBACH. That is every OSM `place=town/village` node inside the world, plus Sisslerfeld, which the issue names. |
| Where the data lives | A hand-kept `VILLAGES` table in `prototype/world.js`: `{ t, x, z, r }` in game metres. Each entry has a comment naming its OSM node id, and the table has one comment naming the conversion. No pipeline change and no world rebuild. |
| Position | The OSM place node, which marks the village centre. Sisslerfeld uses its map label `(420, 300)` from `pipeline/anchors.json`. |
| Inside radius `r` | Per village, from the spread of world buildings around each node: Bad Säckingen 800, Stein 450, Sisseln 450, Sisslerfeld 600, Münchwilen 350, Mumpf 450, Murg 550, Wallbach 450 m. Within `r` of the car the name is hidden. |
| Fade | Opacity by the car's distance `d` to the centre: 0 for `d ≤ r`, ramping to 1 over the next 200 m, 1 until 2600 m, ramping to 0 at 3400 m, and 0 beyond that (the camera far plane is 4200). Constants are in `VILLAGE_FADE = { in: 200, full: 2600, out: 3400 }`. |
| Size | World height `h = clamp(0.06 · d, 30, 180)` m. Beyond 500 m it covers a constant ~3.4° of the view, so a far name stays readable. Nearer than 500 m it stays 30 m tall, so it grows on screen as you approach. Width is `h ·` the texture aspect. |
| Height | The sprite's centre is at `terrainH(x, z) + 70 + h / 2`, so its bottom edge stays 70 m above the village ground, well above the rooftops. |
| Facing | `THREE.Sprite`, which always faces the camera. |
| Look | Uppercase like the minimap. `800 120px "Barlow Condensed"`, fill `#f5efe0`, with a dark `rgba(20,23,29,.85)` outline (14 px `strokeText`) so it reads against both sky and hills. Transparent background on a 1024 × 160 canvas. |
| Draw | `SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false })`, `renderOrder = 20 - rank`, where rank is the place in the nearest-first list, so the nearest name is drawn last and stays on top. The name shows through hills and is never fogged. |
| Texture creation | Lazy: each village's texture is built the first time the name becomes visible. By then the web font has loaded, unlike at boot. One material per village, kept for the session (8 at most). |
| Update | Every frame from `hud()`, because there are at most 8 entries and the fade must be smooth. It uses the car position (`P.x`, `P.z`), like the house numbers. |
| Hand-traced layout | No village names. The hand layout has another frame (`W()`) and no world. |
| Toggle | None. The names are part of the world, like the house numbers. No key is used, so G stays reserved for #48. |
| Pure helpers | In `prototype/world.js`: `VILLAGES`, `VILLAGE_FADE`, `villageFade(d, r, f)`, `villageHeight(d)`, `villageLabels(villages, x, z)` → `[{ t, x, z, d, opacity, h }]`, nearest first, with only `opacity > 0`. |
| Test hooks | `__mm.villages()` → `[{ t, d, opacity, h }]` of the names currently shown. `__mm.villageSprites()` → `[{ t, opacity, depthTest, fog, w, h, y, ground }]` of the visible sprites. |
| Docs | A player-facing line in `CHANGELOG.md [Unreleased]` and a playtest entry in `test-todo.md`. No F1 change, because there is no key. |

## Assumptions (headless — no human was asked)

- **A1** [med] The places are every OSM `place=town/village` node inside the world, plus Sisslerfeld. That adds Mumpf, Murg and Wallbach (DE) to the issue's list. Rejected: only the four existing map labels, because the issue names Münchwilen too, which is not a map label (`pipeline/anchors.json:25-33`), and its "…" invites more. Also rejected: Eiken, whose place node lies south of the world (game z ≈ 2140, roads end at 2034), and hamlets and neighbourhoods (Rothaus, Obersäckingen, Rüti, Diegeringen), which are parts of a village rather than villages a player approaches.
- **A2** [med] Positions are hand-kept game coordinates from the OSM place nodes in `prototype/world.js`. They are not read from the world file. Rejected: adding `place` nodes to the pipeline (`pipeline/anchors.py:78-81` only resolves hand labels). That needs a local world rebuild a CI implementer cannot do (see `docs/superpowers/specs/2026-10-02-jump-landmarks-design.md`, "Starting point"), for 8 points that do not move. Also rejected: reusing `anchors.labels`, whose positions are minimap text anchors, with Sisseln about 290 m off the village centre.
- **A3** [high] Sisslerfeld's position is its existing map label `(420, 300)`, because there is no OSM place node and the issue lists it.
- **A4** [med] "Hidden inside the village" means the car is within a per-village radius `r` of the centre, with the name fading in over 200 m outside it. Rejected: the #48 Gemeinde boundaries, which are not merged, are cadastral lines rather than the built-up village, and would hide "SISSELN" across the whole Sisslerfeld industrial area, which belongs to Münchwilen and Eiken.
- **A5** [med] Size and fade numbers (h = 0.06 · d clamped 30–180 m, full opacity up to 2600 m, gone at 3400 m) are first guesses tuned for the 4200 m far plane (`prototype/index.html:735`). The playtest entry asks for them to be checked. They are named constants, so tuning is a one-line change.
- **A6** [med] The names draw on top of everything (`depthTest: false`) and ignore fog. Midtown Madness-style names are an overlay meant to be read from afar. With depth testing a hill or the forest would cut them off, and fog (`:803-805`) would erase them beyond 1.4 km in the `original` style. Rejected: depth-tested names.
- **A7** [high] Camera-facing via `THREE.Sprite`, the same mechanism as the house numbers (`prototype/index.html:730`). The issue says "always facing the camera".
- **A8** [high] No toggle and no key. The issue doesn't ask for one, and G is reserved by #48.
- **A9** [high] Only with the OSM world. The hand-traced layout shows no names. The hand layout uses a different frame (`W()`, `prototype/index.html:244`), and the live site always has the world.
- **A10** [high] Names stay German proper nouns in uppercase, like the minimap (`prototype/index.html:941`). i18n (#9) doesn't touch them.

## Consequences

- At the race start (1883, −292), Sisseln (208 m away) is hidden. SISSLERFELD (1.7 km) shows fully, STEIN (3.0 km) at about half opacity, and BAD SÄCKINGEN (3.3 km) is nearly faded out.
- Up to 8 extra sprites and draw calls. Each texture is a 1024 × 160 canvas (about 0.65 MB on the GPU, less than 5.2 MB for all 8), created only on first sight.
- Because `depthTest` is off, a name can show through a hill or in front of a nearby building. That is intended for an overlay. Close up, the village's own name is hidden anyway.
- Neighbouring names can overlap on screen when two villages line up behind each other, for example STEIN behind BAD SÄCKINGEN when you come from the east. Nearer names are drawn last (sorted by distance, `renderOrder` by rank), so the nearer name stays on top.
- The minimap and the J menu are unchanged. Their own place lists stay where they are.
- A future region extension (#19, #44, #47) needs new `VILLAGES` rows by hand, for example Eiken once the south grows.

## Testing

- **Unit (node:test)** in `prototype/tests/world.test.mjs`. `villageFade` is 0 at and inside `r`, linear over the 200 m ramp, 1 in the middle band, linear down to 0 at 3400 m, and 0 beyond. `villageHeight` clamps at 30 and 180 and is 0.06 · d in between. `villageLabels` drops hidden villages, sorts nearest first and returns `{ t, x, z, d, opacity, h }`. `VILLAGES` has 8 unique uppercase names, includes the four the issue lists, has `r` between 300 and 1000, and every point lies inside the world road extent.
- **Browser (Playwright)** in `prototype/tests/test_village_names.py`, real world, skipped without it. At the Sisseln centre, SISSELN is not shown. 1500 m east of the Sisseln centre, SISSELN shows with opacity 1 and `h` 90, its visible sprite has `depthTest` and `fog` false, and the sprite sits more than 60 m above ground. Near Mumpf, MUMPF is hidden and SISSELN (more than 5 km away) is not shown. With the hand layout (world blocked), `villages()` is empty and there are no visible sprites.
- **Manual playtest** in `test-todo.md`: drive from the start towards Stein and Bad Säckingen, and check readability, size, fade-out when entering, and overlap.
