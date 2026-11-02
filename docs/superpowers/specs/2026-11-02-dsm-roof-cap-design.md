# Cap DSM roof heights that pick up tree canopy (#630)

## Problem

swissSURFACE3D is a surface model: it measures tree crowns as well as roofs. `building_heights.apply` takes the ridge
`rh` as the 95th percentile of the samples inside the shrunk footprint minus the eaves. A shed under bank trees gets a
canopy ridge: OSM way 993158962 (`building=shed`, 16.6 x 8.8 m, eaves 2.5 m) ships with `rh 20.4`, a 23 m spike on the
Rhine bank at Sisseln that a tester asked about ("Was soll das für ein Gebäude sein?").

## Evidence (data probe on `data/world_hochrhein.json` at main bca2535, tags read from `pipeline/cache/osm/hochrhein.osm.pbf`)

- 2,844 buildings carry `hsrc: "dsm"`; 1,720 of them are gables. The gable ratio `rh / short side` has median 0.32, p90 0.65, p95 0.88, p98 1.42, p99 1.82. A real roof has a rise of at most about the short side (a 63 degree pitch over the half width is rise = short side).
- 80 buildings have `rh` above their short side: 73 gable, 7 flat. OSM tags of the 80: 40 `yes`, 11 house, 8 shed, 8 garage, 3 bunker, 2 retail, 1 each commercial, warehouse, chapel, church, service, civic, school, greenhouse. Most are sheds, garages and houses of 4 to 9 m width with eaves 2.5 m (the minimum) and rh 5 to 27 m: canopy.
- Legitimate tall: `building=church` 390841597 (Evang. Stadtkirche, 12.5 m wide, rh 14.8), `building=chapel` 210827224 (St. Wendelins-Kapelle, 4.8 m wide, rh 23.7, steeple), the two flat ones with a place of worship or `man_made=tower` (St. Maria zum Schnee 414856303, Diebsturm 92036948, `height=18`) and the flat hall 188582257 (32.8 m, flat roof, 29 x 60 m).
- Cap candidates (gable, not exempt): `rh > 0.5 s` 330 buildings, `0.6 s` 197, `0.75 s` 117, `1.0 s` 71, `1.2 s` 53. Between 0.5 and 1.0 the buildings are ordinary steep Swiss roofs (p90 is 0.65).

## Rule

For a gable roof whose `rh` exceeds its short side `s` (rect[2], rect[3]): set `rh = round(0.4 * s, 1)`, the same rise the prototype draws for a gable without a measurement (`world.js` `roofTop`). The eaves `h` stay as measured. Exempt: buildings whose OSM tags say church, chapel, cathedral, tower, place of worship, or `man_made` tower, chimney, silo, water tower. Flat roofs are not touched (rh on a flat roof is rooftop relief, not drawn as a ridge).

Effect: 71 gable buildings change (73 over the line minus the two exempt: church 390841597, chapel 210827224). The shed 993158962 goes from rh 20.4 to 3.5. Nothing else in the file changes.

## Assumptions

- **A1** [med] Threshold 1.0 x short side, not 0.5 or 0.75. Rejected: 0.75 (117 changes, reaches into 56-62 degree roofs of real steep gables); 0.5 (330 changes, p90 of real roofs is 0.65). Evidence: ratio distribution above.
- **A2** [med] Capped value is the prototype's own default `0.4 * s`, not the threshold. Rejected: capping at `s` (the shed would still carry an 8.8 m ridge). `prototype/world.js:567`.
- **A3** [med] The chapel 210827224 (rh 23.7 on 4.8 m) is kept, because OSM says chapel. It may still be a bank-tree artefact; one data point cannot decide it.
- **A4** [high] Flat roofs untouched; the 7 flat buildings above the line are churches, a tower and a hall.
- **A5** [high] Eaves are not corrected: canopy lifts the 95th percentile, not the 10th.
- **A6** [med] The committed world is patched with a retrofit script when `cache/osm/hochrhein.osm.pbf` is absent (a CI runner cannot cut or download it: `docs/11-pipeline-osm.md`), mirroring `backfill_building_streets.py` (#578); with the extract on disk the documented full rebuild is run instead. Both call the same `cap_ridge`, so the result is identical; the by-id diff proves it.
- **A7** [high] `world_ehrendingen.json` is not rebuilt (5 of its 240 DSM buildings would change). The rule applies the next time it is built.

## Consequences

- The next `osm.py build --dsm-heights` of any world applies the cap (Ehrendingen: 5 buildings).
- `roofTop` (collision top) of the 71 buildings drops by 3 to 24 m: the invisible canopy ridge goes away.
- Golden tests that pin a DSM ridge above the short side would need an update; none is known.
