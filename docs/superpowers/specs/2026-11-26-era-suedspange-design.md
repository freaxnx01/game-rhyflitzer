# Südspange hidden in 1952 (#1150)

## Intent

The 1952 layer (#530, Ctrl+Y) shows the Swiss villages as they stood in 1952. The Südspange ESP Sisslerfeld (#42) is a
road of the 2020s, still under construction, yet it stays visible in 1952: it is neither a motorway nor a minor road
inside the industrial site, so none of `pipeline/era_roads.py`'s rules (`_swiss_reason`, `era_roads.py:67`)
catches it. The maintainer decided on 2026-11-23 that it **disappears** in 1952.

## Decisions (maintainer, 2026-11-26)

- **Pieces:** the Südspange `-42001` (tertiary, 3 pieces, 1147 m), `-42003` (unclassified, 2 pieces, 273 m) and its
  cycle path `-42002` (cycleway, 1137 m) are hidden in 1952. `-42004` Geuerenstrasse stays (an old street).
  `-42005` Zufahrt Freiverlad is already hidden by the industrial rule and stays so.
- **Cutting:** the grade cut (`world.grades[0]`, up to 6.5 m deep, the rail decks over it) **stays** in 1952. Only
  the road and its cycle path disappear. The terrain is built once at load, so a 1952 terrain would be a far bigger
  change, and an empty cutting without the road is barely noticeable.

## What changes

- **Pipeline (`era_roads.py`):** an explicit list of late roads, by id (`LATE_IDS = (-42001, -42002, -42003)`). A road
  with one of those ids is hidden with the reason `"late"`, regardless of class or side. Precedence:
  bridge > late > motorway > industrial > empty. `apply` reports the `late` count.
- **Pipeline, landmarks:** the four signs of the building site, `suedspangeBaustelleOst/West` and
  `suedspangeFahrverbotOst/West` (`world.anchors.landmarks`, from `pipeline/anchors.json:16-19`), get
  `modern: true` when a late road is hidden, as `fridolinsbruecke` does with its road (`era_roads.py:494-497`).
  `era_fields.py`'s `ROAD_LANDMARKS` (`era_fields.py:39`) lists them too, so the site step leaves their flag alone
  instead of setting or clearing it by the site polygon.
- **Data:** `data/world_hochrhein.json` is re-patched with `era_roads.py` and then `era_fields.py`, in that order.
  The only road and landmark changes are on the ids and names above. `era.fields` may change where the Südspange
  ran inside the site's keep-out (the old road no longer holds a strip apart). That is intended: 1952 farmland.
- **Game (`index.html`):** the Baustelle and Fahrverbot signs are built into `ERA.group` when their landmark is
  `modern`, so they hide with the layer (today they always go into `signs`, `index.html:2392-2396`, `:3227`).
  `__mm.roadSigns()` reports `shown` per sign.
- **Already handled, no change:**
  - the hidden roads and their markings and junction discs go into the time layer via `r.modern`;
  - a J spot on a hidden road ("Südspange Sisslerfeld", `landmarks.js:41`) is dropped in 1952 (`eraJumpEntries`,
    `index.html:8201`);
  - a car standing on a hidden road is moved to the nearest old road when the layer switches (`toggleEra`,
    `index.html:8665-8672`).

## Measured (2026-11-26, data probe)

- Hiding the three ids cuts **no** road off from the main network (0 roads lose their connection).
- No PostAuto line runs on it (Bus 133 touches it at one junction point only).

## Non-goals

- No 1952 terrain: the cutting and the rail decks stay.
- No change to today's Südspange, its grade, decks, signs or the jump target outside the 1952 layer.
- No historic check of each Südspange metre against the Siegfried map: the whole Südspange and cycle path go.

## Anti-goals

- Any other road changing its `modern` or `keep1952` flag.
- A sign of the building site standing in 1952 next to a road that is no longer there.
