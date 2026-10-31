# Glossary: project terms

The names this project uses for its own places, features, data and workflow: the words that turn up in issues, code and commits. General graphics and geodata terms are in the [graphics glossary](05-glossary.md).

## The game

**Rhyflitzer – Map Madness**: the game's title (start screen, browser tab, GamesHub card); Rhyflitzer is the title, Map Madness the subtitle. The repository is called `game-rhyflitzer`.

**Region**: a playable map with its own world and terrain file (`regions.js`). **Hochrhein** is the default; **Ehrendingen** is the second (`?region=ehrendingen`). The region editor builds further ones (see *Generated world*).

**Gemeinde**: a municipality, Swiss or German. The J list filters by Gemeinde, **G** shows their boundaries, and the big village names mark them.

**Checkpoint race**: the main mode: drive through the checkpoints (`cps` in the world file) in order, from start to finish.

**J dialog / J list**: **J** opens a searchable list of places to jump to: the landmarks, the race points and more. Chips filter it by Gemeinde or show only *Enterable* places. A jump always ends on the surface (see *Level*).

**Landmark**: in the game, an entry in the J list (`LANDMARK_INFO` in `landmarks.js`): a name, its Gemeinde and a position, which comes from an *anchor*, a world building id, or a fixed game point. Not the same as a **CH landmark** (below).

**CH landmark**: a 3D model of a Swiss building loaded from swissBUILDINGS3D by the `ch-landmarks` skill, listed in `landmarks.yaml` and pinned in `landmarks.lock.json`. Today only the Holzbrücke, as a scale cage for modelling it in Blender (`mode: hero`); the game itself does not load these files.

**Hero asset**: a hand-made model of an important landmark, as opposed to the generated buildings (see the graphics glossary).

**On foot**: **Z** gets out of the car (or the loco) and walks; the walker model is `foot.js`. **N** held is *nitro* (faster), Space jumps or climbs while hovering.

**Enterable**: a building or place you can walk into on foot (register in `enterables.js`, kinds `building`, `tower`, `hideout`). Its door glows from 15 m, at 2.5 m the bottom line shows **E · Enter**.

**6c**: **Bodenackerstrasse 6c** in Sisseln, the first enterable building: a stair hall with a lift to ten storeys and the roof. The block is *6a–6d*; **B** inside takes you straight back out to the street.

**Hideout**: the secret under the **Reservoir Hübel**. A tunnel leads to a lift lobby; the freight **lift** rides down to the **ring**, a tunnel round the shaft with eight **spokes**. Each spoke ends at a **portal** into a **room**: a 500 × 500 m meadow ringed by trees with one object in its centre (the Eiffel Tower, the Atomium with the Pommes figure, Artemis II with the Orion capsule, the Titanic; the other rooms are still empty).

**Level**: which world is active: the **surface**, the **ring**, or one of the **rooms** far below (`BELOW_Y` = −600 m, `levels.js`). Each level has its own ground, colliders and ceiling. A jump returns to the surface; **R** keeps the level.

**Props / knock**: street furniture you can knock over (`knock.js`): benches, bins, lamps, hydrants, glass and clothes containers, bike racks, tyre stacks. The HUD counts them („umgefahren: N“).

**Robidog**: the green Swiss dog-waste bin, one of the props. Knocking one over scatters **Hundekacki** (poo piles) on the road.

**Crash-Platz / crash yard**: the test ground on the Sisslerfeld where every kind of prop stands in a row behind a run-up lane.

**Steam loco**: the locomotive at Bahnhof Sisseln that runs on the real railway (`train.js`). **Turntable**: the bridge at its start spot that turns it round (**A**/**D** at rest).

**Testhub**: a developer tool shared by all games on this site. With `?dev=1` the game loads it and registers jump targets; a `{go: <id>}` tag in `test-todo.md` names the target that puts you on the spot to test.

**`window.__mm`**: the game's test hooks for Playwright, e.g. `car()`, `cam()`, `level()`, `train()`, `trainSim()`.

**Debug panel**: **Ctrl+D** (or F3): live values, a legend, *Set up props*.

## Places

Real places in the Hochrhein region, as the game names them.

**Hochrhein**: the Upper Rhine between Bad Säckingen (Germany) and Sisseln, Stein, Münchwilen and Eiken (Aargau, Switzerland). The Rhine is the border.

**Sisslerfeld**: the industrial plain between Sisseln, Eiken, Münchwilen and Stein.

**DSM / DSM-Firmenich**: the chemical company whose large site lies on the Sisslerfeld; buildings there get the industrial palette. The **DSM-Kamin** (chimney, about 140 m) and the **DSM-Wasserturm** (water tower, about 59 m) are landmarks. Not to be confused with a *DSM* (digital surface model) in geodata, which this project calls DOM or swissSURFACE3D.

**Hübel**: the hill in Münchwilen with the **Reservoir Hübel**; the hideout's entrance.

**Holzbrücke**: the covered wooden bridge between Stein and Bad Säckingen. Pedestrians only in real life, drivable in the game. The national border is painted across its deck twice (*Y* shows it everywhere): the new one in the middle of the Rhine (yellow) and the old Talweg from 1808 (white).

**Fridolinsbrücke**: the road bridge between Stein and Bad Säckingen. **Fridolinsinsel** and the **Fridolinsmünster** are in Bad Säckingen.

**Südspange ESP Sisslerfeld**: a planned road across the Sisslerfeld (Kanton Aargau), built into the game as a *game-only road*.

### The J list

The landmarks as listed in `landmarks.js`, west to east:

| Gemeinde | Landmarks |
|---|---|
| Bad Säckingen | Fridolinsmünster, Holzbrücke, Fridolinsbrücke, Schloss Schönau (Trompeterschloss), Gallusturm, Diebsturm, Bahnhof Bad Säckingen, Kursaal, Aqualon Therme, Bergsee, Rhein-Wracks (under water) |
| Stein | Kirche Stein, Bahnhof Stein-Säckingen |
| Münchwilen | Plattform Sisslerfeld (with its spiral stair), Reservoir Hübel |
| Schupfart | Flugplatz Schupfart |
| Eiken | DSM-Kamin, Bahnhof Sisseln, Bahnhof Eiken, LANDI-Turm, Südspange Sisslerfeld, Güggeli-Foodtruck |
| Sisseln | DSM-Wasserturm, Smile-Kreisel, Hallenbad Sissila, Bodenackerstrasse 6c, Bodenackerstrasse 10B, Sprungschanze, Gemeindehaus Sisseln, Schulhaus Sisseln, Neues Schulhaus Sisseln, Volg Sisseln |
| Ehrendingen (own region) | Im Böndlern, ARA Ehrendingen, Wanderweg, Kath. Kirche Ehrendingen, Reformierte Kirche Ehrendingen, Kapelle St. Anna, Mehrzweckhalle Lägernbreite, Gemeindehaus Unterdorf |

The Gemeinde is where the place lies by OpenStreetMap, which is why Bahnhof Sisseln is listed under Eiken.

## World data and pipeline

**Game frame**: game coordinates in metres, **x east, z south**, around a fixed origin (lat 47.5506, lon 7.9671, `pipeline/geo.py`). A heading `th` points along (cos th, sin th), so a positive turn is to the right.

**LV95 / EPSG:2056**: the Swiss national coordinates (e.g. 2638266 / 1265917), used by swisstopo and map.geo.admin.ch.

**Pipeline**: the Python tools in `pipeline/` that turn geodata into the game's files. `osm.py cut` cuts a regional `.osm.pbf` from a Geofabrik country extract (heavy, one-off); `osm.py build` turns it into the world file; `osm.py world` builds any Swiss rectangle (see *Generated world*).

**MMW1**: the world file format, `data/world_<region>.json`: roads, water, rail, buildings, props, forests, anchors ([docs](11-pipeline-osm.md#the-world-file-mmw1)).

**`.mmh`**: *Map Madness Heightmap*, the terrain file (`data/terrain_<region>.mmh`, [docs](08-pipeline-terrain.md)).

**Anchors**: `pipeline/anchors.json` resolves OSM ids to game positions: landmarks, start, checkpoints, finish, labels, areas. Also lists `keep_buildings` (always kept), `exclude_buildings` (dropped) and game-only `roads`.

**Building selection**: a building is kept if it lies within **30 m** of a main road (`--house-dist`) or covers **1,000 m²** or more (`--big-building-area`). An area with `keep_all_buildings` keeps every building inside it; since #507 that is all of Sisseln.

**Building heights**: swissSURFACE3D (roofs) minus swissALTI3D (ground), per building; the measured ridge also decides gable or flat roof.

**Game-only road**: a road OSM lacks (or tags as planned), added from `anchors.json` `roads`; it gets a negative id.

**Generated world**: a region built from any Swiss rectangle with the **region editor** (`editor.html`); it has a 12-character hex id and is loaded with `?world=<id>`.

## Workflow

**#123 / PR#123**: an issue is written `#123`, a pull request `PR#123`.

**`needs-enrichment`**: a new issue that still needs a spec and a plan. **Enrich** (`/enrich`) writes them to `docs/superpowers/specs/` and `docs/superpowers/plans/` and puts the plan into the issue body.

**Pipeline / `ai-implement`**: the label that sends an enriched issue to the agent pipeline, which implements it test-first (the *TDD contract* comment) and opens a PR. With `ai-review-human-merge` the pipeline reviews the PR but leaves the merge to a human.

**CI plan job**: CI runs only the tests affected by a change; a stale test only shows up when its file is touched. **Nightly**: the scheduled full run on `main`, which files an issue per newly red test.

**GPU browser**: the always-on Chromium with a real graphics card in the homelab that local test runs connect to; on GitHub runners and the agent box WebGL runs in software (SwiftShader) and is much slower.

**`test-todo.md`**: the manual playtests still owed, ticked off after playing in the browser.
