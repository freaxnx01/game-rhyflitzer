# Black Forest and Jura on the horizon (#593)

## Why

From the Plattform Sisslerfeld deck (game x 304.8, z 427.1, deck 25.8 m above ground, eye about 47.6 m above
base 284 m a.s.l.) the real view north is the Hotzenwald slope rising right behind Bad Säckingen and Murg. In the
game the northern horizon is flat: the height grid `data/terrain_hochrhein.mmh` is swissALTI3D only (Swiss ground),
the German side is filled with the base height (`pipeline/terrain.py:188`), and the world ends at lat 47.572,
2.8 km north of the deck.

## Measured (probe 2026-11-01, Copernicus GLO-30 at 2", anonymous range reads)

- **The visible northern horizon is just outside the play area.** Horizon profile from the deck eye, with
  earth curvature and refraction (k = 0.13):

  | Azimuth | Max elevation | at distance | height above base |
  |---|---|---|---|
  | 330° | 5.0° | 3.8 km | 377 m |
  | 345° | 5.7° | 3.5 km | 404 m |
  | 0° | 5.0° | 3.2 km | 328 m |
  | 15° | 4.2° | 3.1 km | 275 m |
  | 30° | 3.2° | 3.6 km | 250 m |
  | 75° (east, Rhine valley) | 0.9° | 14.6 km | 283 m |
  | 285° (west, towards Rheinfelden) | 0.4° | 21.5 km | 217 m |
  | 135° (Jura) | 1.7° | 13.7 km | 464 m |

  To the south (150°-255°) the highest point is the Tafeljura inside the play area (1.4-2.9 km, 2.6-4.6°), which the
  game already draws.
- **The German strip inside the play area is not flat in reality**: at the cells the .mmh fills with base, the
  DEM is p50 86 m, p90 184 m, max 269 m above base. That is the lower Hotzenwald slope itself.
- Copernicus DEM vs swissALTI3D over the Swiss part of the play area: median +1.0 m, p25 -0.9 m (the DEM is a
  surface model: trees and roofs included). No vertical offset correction is needed.
- `index.html:2246`: camera far plane 4200 m. `index.html:2257`: the sky is a 3800 m sphere that follows the
  camera (`camTail`, `index.html:4187`). `index.html:2766-2768`: fog is linear 320-1400 m (Original, the default
  style, `index.html:2771`) or exp2 0.00095 (Smooth, 97 % fog at 2 km). Anything real at 3-20 km is beyond the far
  plane and fully fogged, so "just extend the terrain" cannot show the ridge.

## Data source

**Copernicus DEM GLO-30 Public** (DGED, 1" / about 30 m, Cloud Optimized GeoTIFF, EPSG:4326, EGM2008 heights).

- Anonymous download path (verified: HTTP 200, range reads through GDAL `/vsicurl/` work, overview level 0 = 2"):
  `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N47_00_E007_00_DEM/Copernicus_DSM_COG_10_N47_00_E007_00_DEM.tif`
  and the same with `E008_00` (AWS Open Data registry "copernicus-dem-30m").
- Licence: free, worldwide, commercial use included (Copernicus DEM licence, ESA / Copernicus Data Space). User
  obligation for adapted data (verbatim):
  "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018
  provided under COPERNICUS by the European Union and ESA; all rights reserved".
  Reference page: `https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM`.
- Rejected: **LGL DGM1** (Baden-Württemberg, dl-de/by-2-0) is a true terrain model and already supported by
  `terrain.py --dgm-dir`, but it covers neither Switzerland nor France (no Jura), and no anonymous direct download
  path could be found (the Open GeoData portal is a JS app; guessed tile URLs return 404), so an unattended
  pipeline run cannot fetch it. **EU-DEM** is retired in favour of the Copernicus DEM.

## Design

A non-drivable **backdrop**: one coarse height grid around the play area, drawn behind the world as a hazy
silhouette.

1. **Data.** New `pipeline/backdrop.py` writes `data/backdrop_hochrhein.mmh` in the existing MMH1 format (the game's
   `parseMMH` reads it unchanged): a 250 m grid in the game frame, the play-area extent of the .mmh padded by 18 km
   on every side (about 45 × 44 km, 183 × 178 samples, about 130 kB). Heights are the DEM, box-filtered to the
   250 m footprint, minus base 284. Samples deep inside the play area are NaN (the hole); samples inside the play
   area next to an outside sample take the play-area .mmh height there, so the backdrop meets the world's edge
   without a gap. Header: the usual MMH1 fields plus `kind: "backdrop"`, `hole` (play extent `[x0, z0, x1, z1]`)
   and `sources`.
2. **Mesh.** New pure module `backdrop.js`: an indexed mesh from the grid that skips every quad with a NaN corner,
   with quads sorted far-to-near from the hole centre (painter's order), plus a height tint. Built once, no
   per-vertex terrain lookups (the heights are in the file), about 62 k triangles.
3. **Draw.** A `ShaderMaterial` with `fog: false`, `depthTest: false`, `depthWrite: false`, `renderOrder -1`
   (sky set to `-2`): drawn right after the sky and before everything else, so any world geometry covers it and
   it can never sit over a road, a field or grass (#290, #506). It is scaled about the camera by 0.08 every frame
   (`position = camera × (1 - s)`, `scale = s`): a uniform scale about the eye leaves every angle unchanged, and puts
   the 45 km grid inside the 4200 m far plane. Earth curvature and a distance haze towards the sky's horizon colour
   are done in its shader from the unscaled position. Hidden underwater, in the cave, and below ground (it is a
   scene child, so the existing `surfaceRoot` move hides it).
4. **Load.** `regions.js` hochrhein gets `backdrop: './data/backdrop_hochrhein.mmh'`; the fetch starts after the
   world is built and is never awaited, so startup does not wait for it. Generated worlds and Ehrendingen have none.
5. **Credits.** data/README.md, CREDITS.md, the About credits (link + string, en/de) and the start-screen terrain
   status line (`· Horizon: Copernicus DEM` once loaded).

## Decisions

- **D1 The German bank inside the play area stays flat in this issue.** Real ground there needs a terrain model
  (DTM). The only anonymous DEM is a surface model: draped roads would climb onto forest canopy and Bad Säckingen's
  roofs. LGL DGM1 has no unattended download path, and new heights there regenerate world data that #290/#506
  tuned. The ridge crest that forms the silhouette (3.1-3.8 km north of the deck) lies outside the play area, so the
  backdrop alone meets the acceptance. Follow-up: "German bank real heights from LGL DGM1" (manual tile download,
  `terrain.py --dgm-dir`, world rebuild).
- **D2 Copernicus DEM GLO-30 for the whole ring** (Black Forest, Jura, Rhine valley in one source and one licence).
- **D3 The backdrop has its own haze, not the scene fog**: `haze = 0.45 + 0.43 × (1 - exp(-max(d - 2000, 0) / 8000))`
  towards the sky's horizon colour (`skyMat.uniforms.hor`), so 3 km ridges show at about 50 % haze and 20 km hills
  at about 83 %. Scene fog, fog distances and camera far plane stay unchanged.
- **D4 Painter's order instead of a depth pass**: no extra render pass, no `clearDepth`, the mirror pass and photo
  capture keep working.

## Acceptance

- From the deck eye, the backdrop's horizon (pure function on the shipped file) between azimuth 345° and 15° has a
  maximum elevation of 3.5-6.5° at 2.8-6 km.
- `data/backdrop_hochrhein.mmh` is at most 200 kB; the mesh has at most 70 000 triangles; building it does not block
  startup (the fetch is never awaited).
- In-game the backdrop is visible on the surface and hidden underwater and in the cave; it never answers a raycast.
- `tests/test_fields.py` (roads above grass and fields, #290/#506) stays green unchanged.
- Credits carry the Copernicus notice in data/README.md, CREDITS.md and the About credits, en and de.

## Out of scope

- Heights for the German bank inside the play area (D1, follow-up).
- A backdrop for Ehrendingen or generated worlds.
- Any change to scene fog, styles, or the camera far plane.
