# Sisseln 1952 — historic time layer (#530)

## Intent

The Gemeinde Sisseln is to be asked whether it will publish the game on its website (milestone
`gemeinde-sisseln`). This feature is the strongest argument for that: switch on the past and
the **Sisslerfeld** turns back into the open farmland of the 1952 aerial photo ("Das Sisslerfeld
1952 vor der Industrialisierung: Eine einzige grosse Landwirtschaftsbrache", Werner Friedli,
ETH-Bibliothek, LBS_H1-014378), and the **old village of Sisseln** stands as it did then — in
black and white, like that photo.

Both carry the demo equally: the empty Sisslerfeld *and* a recognisable old village.

## Goals

1. A **historic time layer "1952"** that can be switched on and off at runtime, without a reload.
2. A **black-and-white look** (greyscale + subtle film grain + light vignette) that can be switched
   on and off **independently** of the time layer.
3. On the **Swiss side**, the layer shows only buildings that already stood in 1952, for every
   village in the Hochrhein world (Sisseln, Stein, Münchwilen, Eiken, Mumpf, Obermumpf, Wallbach,
   the edge of Kaisten).
4. In **Sisseln**, houses demolished since 1952 are added back, traced from historic imagery.
5. **Obviously new roads** (A3 motorway and its ramps, the newer road bridge Stein–Bad Säckingen,
   roads inside the Sisslerfeld industrial area) disappear in the layer.
6. The former **industrial area of Sisslerfeld** shows fields instead of factories.

## Non-goals

- **German side** (Bad Säckingen etc.) stays exactly as today — no open building-age data exists
  there. It is greyed like everything else when black-and-white is on.
- No full historic road network redrawn from the Siegfried map; only removal of obviously new roads.
- No historic terrain: today's heights stay (no historic elevation data exists).
- No historic rail changes, no historic vehicles, no historic forests.
- The Ehrendingen world gets no historic layer.

## Anti-goals (would count as failure even if it technically works)

- A village that looks gutted or random — e.g. half-rows of houses because the filter dropped
  buildings that clearly stood in 1952. Sisseln must read as a coherent old village.
- The car ending up stranded on nothing / falling through the world when the layer switches.
- HUD or minimap becoming hard to read because of the grey look.
- Shipping traced houses that the maintainer hasn't checked against the old imagery.

## Decisions made with the maintainer

| Topic | Decision |
|---|---|
| Cutoff year | **1952** (matches the photo; the 1946 swisstopo mosaic is the complete tracing reference) |
| Area | As many villages as doable: register filter for all Swiss villages in the world; hand-tracing only in Sisseln |
| German side | Leave as today |
| Roads | Hide obvious new roads |
| Road gone under the car | Move the car to the nearest road that exists in 1952, with a short notice |
| Switching | **Two keyboard shortcuts** (one per toggle), also listed in the help |
| Grey scope | **3D view only**; HUD and minimap stay in colour |
| Photo look | Subtle **grain + vignette**, neutral grey (no sepia) |
| Demolished houses | **Claude traces, maintainer checks** a side-by-side screenshot vs. the old imagery before shipping |
| Delivery | One spec, **several PRs** built in this session, each demoable on its own |
| Plattform Sisslerfeld | **Stays standing** and climbable in 1952 — the deck becomes a lookout over the 1952 fields. Its viewpoint (subject: DSM chimney, hidden in 1952) is not offered while the layer is on |

### Calls made by Claude (maintainer to check)

- **Rhine crossing:** the Holzbrücke is already drivable in the game; with the newer road bridge hidden,
  cars cross on the Holzbrücke (historically the road crossing until the new bridge opened). The German side
  stays modern and drivable; the road-gone fallback may pick a road on either bank, whichever is nearest.
- **Collision follows visibility:** hidden buildings/props lose their colliders; historic-only buildings
  gain them only while the layer is on.
- **Other modern content in the industrial area:** car parks (`world_parking.py`) and props
  (`world_props.py`) inside the industrial area are hidden with the buildings. Other landmarks, hideouts and
  enterables outside the industrial area are untouched. Any viewpoint, mission or start point whose subject
  or position is hidden is simply not offered while the layer is on.
- **Road selection:** by OSM class (`motorway`, `motorway_link`) plus an explicit ID list (new road bridge,
  industrial-area roads). ~~Village roads stay even if all their houses vanish.~~ Changed by the maintainer
  2026-11-15 after the PR 2 screenshot (empty street grid read as a building plot): see "Residential streets" under Roads.
- **Industrial-area boundary:** the existing industrial areas from the anchors (`anchors.industrial_ids`).

## Data sources

- **GWR (Gebäude- und Wohnungsregister, BFS)** — open data, `https://public.madd.bfs.admin.ch/ag.zip`
  (`gebaeude_batiment_edificio.csv`, tab-separated). Per building: `EGID`, LV95 coordinates
  `GKODE`/`GKODN`, construction year `GBAUJ`, construction period `GBAUP`
  (8011 = before 1919, 8012 = 1919–1945, 8013 = 1946–1960, …), status `GSTAT` (1004 = existing).
  Recon 2026-11-15: of 727 existing buildings in Sisseln, 292 have a year; 40 are period 8011,
  16 period 8012, 24 period 8013. About 57 are old enough for 1952.
- **swisstopo** SWISSIMAGE HIST 1946 (aerial mosaic, 1 m, WMS/WMTS), Siegfried map 1940,
  historic single aerial photos — **tracing reference only**, never textures.
- **OpenHistoricalMap** — checked: no buildings around Sisseln. Not used.

Attribution: add the GWR (`Gebäudedaten: GWR © BFS`) and swisstopo historic imagery to the
world file's `sources`, `CREDITS.md` and the About tab, following the existing pattern for the
fields data.

## How it works (decided parts)

### Building filter

Match each world building to GWR entries whose coordinate lies inside (or within a small distance
of) its footprint. A building is **old** if a matched entry has `GBAUJ ≤ 1952`, or no year but
`GBAUP` 8011/8012. **Period 8013 without a year is ambiguous** (1946–1960). See the rules below.

Rules for buildings the register can't decide (no match, or ambiguous):

- Inside the **Sisslerfeld industrial area** → modern (hidden).
- Elsewhere → **builder's call**, guided by the anti-goal: the village must not look gutted. A sensible
  default is "keep if every neighbour within ~30 m is old; hide otherwise", but verify visually.
- Small outbuildings (sheds, garages) without a match → hidden.

### Traced houses (Sisseln only)

A small committed data file with footprints traced from SWISSIMAGE HIST 1946 / Siegfried map for
houses that stood in 1946–1952 and are gone today. Default height 2 storeys, gable roof, village
palette. The pipeline merges them into the world file as historic-only buildings.
**Gate:** before the PR leaves draft, a side-by-side screenshot (game 1952 vs. 1946 mosaic, same
framing) goes to the maintainer for approval.

### Roads

The pipeline flags new roads as modern: every `motorway`/`motorway_link`, the newer
Stein–Bad Säckingen road bridge, and the roads inside the industrial area. **Residential streets** (decided by the
maintainer 2026-11-15): a residential street on the Swiss side disappears in 1952 when no building that stood in 1952
lies along it; main and through roads, and roads leading to old houses, stay. The **wooden bridge**
(Holzbrücke) is old and stays. The road-gone fallback moves the car to the nearest old road (same
spawn logic the game already uses for jumps/teleports) and shows a short bilingual notice.

### Sisslerfeld fields

In the historic layer, the industrial area is filled with field strips in the style of the
existing fields (`world_fields.py`), in place of the hidden buildings and roads. Plausible strip
layout is enough; it doesn't have to match the 1952 parcels exactly.

### Runtime

- One world file carries both states (e.g. a per-building / per-road "modern" flag plus
  historic-only buildings and fields). Switching toggles visibility; no reload, no second world file.
- Black-and-white is a full-screen post-processing pass on the 3D render only (greyscale,
  subtle grain, light vignette). The HUD/minimap are DOM/2D overlays and stay in colour.
- Both toggles are off at start. Remembering them across reloads is the builder's call.
- Shortcuts are **builder's call**, with these constraints: free across **all** `*.js` files and
  `index.html` (grep everything, including `pause.js` and `helpfilter.js`), not browser-reserved
  (`Ctrl+N/T/W/Tab`), and listed in the help with `de`/`en` labels. Suggestion: <kbd>Ctrl</kbd>+<kbd>Y</kbd>
  (year) and <kbd>Ctrl</kbd>+<kbd>G</kbd> (grey).
- All new UI text in `de` and `en` via the existing `strings.js` mechanism.
- In the Ehrendingen world the time-layer shortcut does nothing beyond a short notice; black-and-white
  still works there.

## Delivery: PRs in order

1. **Black-and-white look + toggle.** Independent of all data work, demoable at once.
2. **1952 buildings from the register + time-layer toggle.** Pipeline: GWR matching and flag;
   runtime: hide modern buildings.
3. **Hidden new roads + road-gone fallback.**
4. **Sisslerfeld fields** (industrial area becomes field strips, parking/props hidden).
5. **Traced Sisseln houses**, held as draft until the maintainer approves the side-by-side screenshot.

Each PR adds its own `CHANGELOG.md` entry under `[Unreleased]` for players.

## Testing

TDD for pipeline (pytest) and pure JS logic (node tests). Browser checks: only the Playwright
tests that the change touches (no full suite), run in the foreground.

## Left to the builder

- Exact data shape in the world file and how meshes are split so the toggle is cheap.
- GWR match distance and the neighbour rule for undecided buildings (verify visually in Sisseln).
- Shader details of grain/vignette (subtle; must not hurt frame rate noticeably).
- Exact keys within the constraints above; whether toggles persist in `localStorage`.
- Field strip layout in the industrial area.
- How to fetch the historic imagery for tracing (WMS/WMTS of `ch.swisstopo.swissimage-product_1946` or similar).
