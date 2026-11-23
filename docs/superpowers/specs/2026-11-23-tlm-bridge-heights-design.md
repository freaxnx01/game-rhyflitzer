# Bridge and underpass heights from swissTLM3D (#1151)

**Lands after #1152:** bridge ends attach to the smoothed road profiles.

## Why

Crossings (a rail or road deck over a road) take their heights from the 16 m terrain mesh today. A rail deck runs
straight between `terrainH` at its two OSM ends (`index.html:1517`, `fillBridgeHeights`), a generic road deck is seated
on the bank top read from that mesh (`seatGenericEnds`, `index.html:1505-1516`), and the road underneath is then cut
down until the deck's underside clears it by 4.5 m (`cutFloorTarget`, `world.js:253`). The mesh smears every railway
embankment onto the road under it (Stein #844: mesh 307.3 m, real road 304.4 m), so the deck comes out too low and the
road under it is dug down to make room.

Measured on main (2026-11-23, Hochrhein, swissTLM3D 2026-02):

- 234 game crossings: 191 in CH, 43 on the German side (no TLM). 174 of 191 have a TLM structure within 20 m.
- Of the 38 rail cuts (`__mm.crossings()`), 27 match a TLM rail bridge. In **all 27** the game deck is 1.6-6.0 m too
  low; in 23 the road under it is 0.6-3.7 m too low.
- Königsweg (4609, 5561) has a negative clearance today. Ankengasse (-3379, 736): road 1.1 m too high, deck 5-6 m too
  low.
- The 11 Südspange cuts (#42) have no TLM: the underpass is under construction.
- With a direction check (|cos| >= 0.9) and 8 m axis distance, 29 of 37 OSM rail decks match a TLM rail bridge over
  100 % of their length (TLM has one axis per track, max offset 1.9 m on straight decks, 6.8 m on the two curved ones
  near (2378, 2632) and (2855, 3236)); the 8 without a match are exactly the Südspange decks. 66 of 119 OSM road bridge
  pieces match; the rest are on the German side, hero chains, or have no TLM structure.

swissTLM3D (swisstopo, Open Government Data) carries a 3D axis for every road and rail segment with `KUNSTBAUTE`
(Bruecke, Unterfuehrung, ...) and `STUFE`. On structures its z is the measured deck; off structures it lies within
0.1-0.2 m of swissALTI3D.

## Goal

Every TLM-matched crossing in a Swiss world gets its deck height and the height of what passes under it from
swissTLM3D: in the committed worlds and in every world the editor pipeline builds. Where TLM has nothing (German side,
Südspange, unmatched OSM pieces) today's logic stays exactly as it is.

## Non-goals

- Road tunnels (still dropped), wavy roads (#1152).
- Smoothing the road network's height profiles: that is #1152, which lands first. This issue only attaches bridge ends
  to whatever surface the bank road has after #1152.
- The hero bridges (Holzbrücke `kind: 'wood'`, Fridolinsbrücke chain `kind: 'stone'` and its approaches): they keep the
  #78/#259 bank-to-bank logic. TLM covers only their Swiss half.
- New vehicles' clearance rules, new bridge models or textures.

## Anti-goals

- A 3.6 GB download per world build.
- A visible step where a deck meets its bank road or its track.
- A track floating over the ground, or a deck end buried in it, next to a raised deck.
- Exception lists of hand-picked crossings.

## Confirmed decisions (from the user)

- **A-C1** [confirmed] Which crossings take their heights from swissTLM3D? Answer: **"Rail and road"**: all rail bridges
  (38 rail cuts today, `__mm.crossings()`) and all road bridges / road underpasses (17 road cuts, #1044,
  `__mm.roadCrossings()`). Same matching and height logic for both.
- **A-C2** [confirmed] The hand-corrected Stein underpass (#844)? Answer: **"TLM everywhere, incl. Stein"**: real heights
  win; keep hand fixes that are not about height (e.g. #844's removed wall stub), drop the dip. No exception list.
- **A-C3** [confirmed] How does the pipeline get TLM for editor-built worlds? Answer: **"CH-wide structures extract"**:
  once per TLM release, cut only the bridge/underpass segments (KUNSTBAUTE not 'Keine'/'Treppe'/'k_W'/'in/auf
  Gebaeude') for all of Switzerland from the 3.6 GB zip, host it like other pipeline inputs; every world build
  (pipeline/region.py, the API service) reads it. No 3.6 GB download per build.

## Design

### 1. The CH-wide structures extract (`pipeline/tlm_structures.json.gz`)

A one-off script, `pipeline/tlm_structures.py`, in the style of `pipeline/ch_outline.py` (one-off, rerun per data
release, output committed next to it):

```
python pipeline/tlm_structures.py --release 2026-02 [--zip PATH]
```

- Without `--zip` it downloads
  `https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/swisstlm3d_<release>/swisstlm3d_<release>_2056_5728.shp.zip`
  (STAC collection `ch.swisstopo.swisstlm3d`, same URL pattern for every release 2020-03..2024-03, checked
  2026-11-23) into a `tempfile.TemporaryDirectory`, deleted afterwards.
- It streams `TLM_STRASSEN/swissTLM3D_TLM_STRASSE` and `TLM_OEV/swissTLM3D_TLM_EISENBAHN` (PolyLineZ + DBF) out of the
  zip with a pure-Python reader (`pipeline/tlm_read.py`, no GDAL, no new dependency). Measured on odroid-plus-pve:
  1:45 min, 0.97 GB peak RSS for both layers.
- **Structures**: every record whose `KUNSTBAUTE` is not in {Keine, Treppe, k_W, in/auf Gebaeude} (A-C3, literal).
  2026-02: 68 790 road + 8 544 rail records, 276 774 vertices. The kinds this keeps besides bridges and underpasses
  (Tunnel, Galerie, Furt, Staumauer/Wehr, Staudamm) stay in the file; the matcher below ignores them.
- **Partners**: every other record of either layer whose 2D axis crosses a structure's axis, clipped to the vertices
  within 40 m of a structure. They carry what passes under (or over) a structure: a road under a rail bridge is
  `KUNSTBAUTE = Keine` in TLM. 2026-02: 21 733 records, 193 380 vertices.
- Output: `{"format": "TLMS1", "release": "2026-02", "source": "swissTLM3D © swisstopo", "structures": [...],
  "partners": [...]}`, each feature `{"l": "road"|"rail", "k": KUNSTBAUTE, "s": STUFE (int), "o": OBJEKTART,
  "n": STRNAME or NAME, "p": [[[E, N, Z], ...], ...]}` (one list per shape part, E/N to 0.1 m, Z to 0.01 m, absolute
  metres). Measured size with all of this: **5.6 MB gzipped**.
- Committed as `pipeline/tlm_structures.json.gz`; `service/Dockerfile.dockerignore` adds `!pipeline/tlm_structures.json.gz`
  so the API image ships it (the image already copies `pipeline/`, `service/Dockerfile:14`).

### 2. Matching and annotating a world (`pipeline/world_tlm.py`)

`apply(world, doc, base) -> stats` writes TLM heights into a built world (`MMW1`) in place:

- `base` is the terrain's `hdr["base"]` (Hochrhein 284.0): game `y = Z - base`; game `x = E - origin.E`,
  `z = origin.N - N` (`geo.Frame.lv95_to_game`, `pipeline/geo.py:39`).
- Only features whose bbox meets the world's road extent plus 100 m are considered.
- **Bridge kinds** for matching: Bruecke, Gedeckte Bruecke, Bruecke mit Treppe, Bruecke mit Galerie, Steg.
- **Pieces**: every `railBridges[i]` (against rail structures) and every road with `bridge: true` (against road
  structures). Sample the piece every 2 m. A sample matches when the nearest bridge-kind axis of the same layer is
  within **8 m** and the directions agree (|cos| >= 0.9). A piece is **matched** when at least 50 % of its samples
  match; it then gets `"tlm": [[t, y], ...]`: t = metres along the piece, y = the TLM axis z at the projected point,
  minus `base`, one entry per matched sample. Unmatched pieces get no key.
- **Under points**: for each matched piece, every 2D crossing of its matched TLM axis with any other TLM line
  (structure or partner, either layer) whose z there is at least 2.5 m lower gives `[x, z, y, "road"|"rail"]`; the list
  goes into `"tlmUnder"` on the piece.
- Two places call it:
  - `osm.build_world` (and with it `region.build_world` and the API worker) after `deck_rail`, when an mmh is given and
    `pipeline/tlm_structures.json.gz` exists; it adds `"Bridge heights: swissTLM3D © swisstopo"` to `sources` when
    anything matched.
  - A CLI that patches a committed world in place, like `era_roads.py`:
    `python pipeline/world_tlm.py --world data/world_hochrhein.json --mmh data/terrain_hochrhein.mmh` (same for
    Ehrendingen). Running it twice gives the same file.

### 3. Deck heights in the game

- `world.js` gets a profile-carrying deck: when a piece has `tlm`, `bridgeSurfaceAt(b, t)` returns the profile
  (`profileY`) and `bridgeDeckAt` = surface − `DECK_OFFSET`, so the existing callers (walls, guards, cuts, drawing) keep
  working on the same two functions.
- **Rail decks**: TLM rail z is the top of rail. The game draws the track 0.03 m over the deck surface
  (`index.html:2985`), so the **deck surface is TLM z − 0.3 m** (`TLM_RAIL_TOP = 0.3`, top of rail to top of ballast).
  Road decks: surface = TLM z (the axis lies on the carriageway).
- **Ends**: the profile is pinned at both ends to the surface the deck joins and blended into the TLM profile over
  `min(8 m, len/4)` (`tlmProfile(samples, len, y0, y1)`, pure, in `world.js`):
  - generic road decks: the bank road's driven surface at the deck end (after #1152 the smoothed road profile, which
    lies within ~0.2 m of TLM off structures). `seatGenericEnds` skips TLM decks.
  - rail decks: the ground at the deck end, which section 4 brings to the measured embankment.
  - a deck end joined only to another deck (switch ends, `seatSwitchEnds`, chain joints) takes that deck's surface,
    as today.
  `b.h0`/`b.h1` are set to the pinned end heights so `railGap` and the other end readers stay consistent.

### 4. Rail deck ends on the measured embankment

The track lies on `terrainH` (`index.html:2985`); on the 16 m mesh the embankment next to a deck is up to several
metres too low, so a TLM deck would end in mid-air. Each end of a TLM-matched rail deck becomes a **fine-ground
centre**, the mechanism #259 built for the stone chain's banks (`FINE_BANKS`, `fineWeight`, `smoothedGround`,
`index.html:1540-1541, 1603-1606`), generalised to per-centre parameters:

- stone chain: unchanged (`inner 48, outer 72`, smoothing radius 16 m);
- rail deck ends: `TLM_FINE = { inner: 16, outer: 28, r: 4 }`: the 4 m swissALTI3D (`baseH`) smoothed over 4 m, blended
  back to the mesh between 16 and 28 m from the end.

Off structures TLM and swissALTI3D agree within 0.1-0.2 m, so the track arrives at the deck end within the blend's
reach. Cuts and walls take "the ground before the cut" from `patchGround` (mesh + grades + fine ground) instead of
`gradedH`/`meshH` wherever they size a cut or a wall against it (`makeCut`'s `groundAt`, `cutDepth`, the wall code at
`index.html:2942-2958`), so a fine centre and a cut in the same cells agree on one ground.

### 5. What passes under

At a crossing (`railRoadCrossings` / `roadBridgeCrossings`) under a TLM deck, the nearest `tlmUnder` point of kind
`road` within 8 m of the crossing gives the road height `yU`:

- the cut floor target becomes `min(yU, surface − UNDERPASS.deck − TLM_CLEAR_MIN) − UNDERPASS.lift` with
  `TLM_CLEAR_MIN = 3.0` m, still bounded by `ground − maxDepth` and the water bound (#1044);
- no `tlmUnder` point: today's `cutFloorTarget` on the TLM deck;
- the cut machinery itself (arms, caps, walls, #844's dropped run-end pieces, guards) is unchanged, so hand fixes that
  are not about height stay (A-C2). At Stein the floor now follows the real road: no dip.

### 6. Fallback

No TLM data (German side, Südspange, the 8 unmatched rail decks, 53 unmatched road pieces, the hero chains, a world
built without the extract): no `tlm` key, byte-for-byte today's behaviour.

## Acceptance criteria

1. `pipeline/tlm_structures.json.gz` (release 2026-02) is committed, under 8 MB, ships in the API image, and
   `pipeline/tlm_structures.py` rebuilds it from the zip.
2. `data/world_hochrhein.json` and `data/world_ehrendingen.json` carry `tlm`/`tlmUnder` on the matched pieces; at least
   29 Hochrhein rail decks and 60 road bridge pieces are matched; no Südspange deck and no hero-chain piece is.
3. Every matched rail cut and road cut in the Hochrhein fixture (task 1): game deck surface within **0.5 m** of TLM
   (rail: TLM − 0.3), game road under it within **0.5 m** of TLM, clearance (deck surface − 1.2 − road) >= 3.0 m.
4. Königsweg (4609, 5561) has a positive clearance; Ankengasse (-3379, 736) is within the AC-3 tolerance.
5. Stein (#844): no dip (road within 0.5 m of TLM 304.4 − 284 = 20.4), and `test_stein_south_corner_has_no_wall_stub`'s
   wall/slope assertions still hold.
6. Every TLM rail deck: `railGap < 0.3` m at both ends, and the ground at each deck end (with the fine patch) is
   within 0.5 m of the TLM deck surface there, so the end blend stays a gentle grade (max grade reported in the PR).
7. Every TLM road deck: the step between the deck surface and the bank road's surface at a deck end is < 0.1 m.
8. The 11 Südspange cuts and every German-side crossing: deck, floor and clearance unchanged from the task-1 fixture
   (within 0.01 m).
9. Load time on the Hochrhein world grows by at most 10 % and the number of patched cells is reported in the PR.
10. `data/README.md`, the world `sources`, CREDITS.md and the CHANGELOG (German) mention swissTLM3D.

## Assumptions

- **A1** [high] The extract is hosted as a committed file in `pipeline/`, built by a one-off script.
  Rejected: a GitHub release asset or a weekly download like the OSM extract (`service/rhyflitzer_api/extract.py`).
  `pipeline/ch_outline.py:1-3` + `pipeline/ch_outline.geojson` are the precedent for a CH-wide input rebuilt per data
  release; `service/Dockerfile.dockerignore` already whitelists `pipeline/*.geojson`; the repo commits data of this size
  (`data/world_hochrhein.json`, 7.6 MB). Measured 5.6 MB.
- **A2** [high] The world is annotated in the pipeline (`tlm`, `tlmUnder` keys) and the game reads the keys; the game
  never sees the CH file. Rejected: the game loading TLM itself. The world file is the game's only per-world input
  (`world.js:140-143`).
- **A3** [high] The committed worlds are patched in place by a CLI, not rebuilt. `pipeline/era_roads.py:505-516` is the
  in-place patch precedent; a full rebuild needs the regional pbf, which is not in the repo
  (`pipeline/tests/test_golden.py:10-12`).
- **A4** [high] Partners are kept in the extract (2D crossers, clipped to 40 m). Without them the road under a rail
  bridge is missing: in the Hochrhein bbox it is `KUNSTBAUTE = Keine` (probe `hr_road.json`, 5 803 Keine records).
- **A5** [high] Matching: 2 m samples, 8 m, |cos| >= 0.9, >= 50 % of samples. Probe: 29/37 rail decks match 100 %,
  the other 8 are exactly the Südspange decks; max offset 6.8 m on the two curved double-track decks.
- **A6** [med] Rail deck surface = TLM top of rail − 0.3 m (`TLM_RAIL_TOP`). The user left this offset to the
  enrichment. 0.3 m is top of rail to top of ballast for standard track; the game's track ribbon lies 0.03 m over the
  deck (`index.html:2985`) and the deck is 1.2 m thick (`world.js:160`).
  Rejected: 0 (track at railhead height, underside 0.3 m too high) and 0.7 (formation level, too low for the ribbon).
- **A7** [med] Deck ends are pinned to the surface they join and blended into the TLM profile over min(8 m, len/4).
  Rejected: TLM all the way to the end (leaves a step wherever the bank surface and TLM differ, anti-goal) and
  today's linear end-to-end deck (keeps the deck 1.6-6 m too low). Relies on #1152 for the bank road surface.
- **A8** [med] Rail deck ends get #259's fine-ground patches (`inner 16, outer 28, r 4`) so the track meets the deck on
  the measured embankment. Rejected: a ramp on the track (floating track, anti-goal) and a new fill/embankment
  geometry (a second terrain mechanism next to the patches). Cost guarded by AC-9.
- **A9** [confirmed] `TLM_CLEAR_MIN = 3.0` m: below that the floor is lowered as today. The game's deck is a fixed 1.2 m,
  so a real low underpass could otherwise put the drawn underside into the car. Real heights win above it (A-C2). Confirmed 2026-11-23: "3.0 m"
- **A10** [med] Hero chains (wood, stone) and their approaches keep #78/#259; TLM covers only their Swiss half
  (`index.html:1491-1494, 1501-1505, 1527-1543`).
- **A11** [high] Existing browser tests that pin today's heights (Stein cut depths in `tests/test_underpass.py`,
  road-cut depths in `tests/test_road_underpass.py`) are updated to the TLM expectations of this spec; their
  non-height assertions (walls, slopes, arms, drivability) stay. This is a specified behaviour change (A-C2), not
  making a test green.
- **A12** [high] The extract keeps Tunnel, Galerie, Furt and dam kinds as A-C3's filter says; the matcher ignores them.

## Consequences

- Rail decks rise 1.6-6.0 m in 27 places; trains and cars on them run higher, and the embankments next to them show
  their measured shape within ~28 m of each deck end.
- Roads under rail decks get shallower cuts (or none), so fewer trough walls appear there.
- About 500 extra 1 m patch cells (37 rail decks, 2 ends, overlapping pairs); load time and triangles rise.
- The world files grow by the `tlm` arrays (~2 m samples on ~100 pieces, a few tens of kB).
- Every editor-built Swiss world gets TLM heights without any extra download; the API image grows by ~5.6 MB.
- A new TLM release means rerunning `tlm_structures.py` and re-patching the committed worlds.
