# Keep houses along residential streets in generated worlds (#352)

Spec for #352. Mode: headless, quick. The maintainer decided on 2026-10-17 that the building-distance test
also counts residential streets; that is settled and not reopened here.

## Problem

`pipeline/world_buildings.py:12` defines `MAIN` (trunk, primary, secondary, tertiary, plus links) and
`build()` keeps a house only if it is within `house_dist` (30 m) of such a road (`:103`, `:127-131`), or is in a
keep-all area, listed by id, or at least `big_area` (1,000 m2). Generated worlds call
`osm.build_world(..., 30.0, 1000.0, None)` (`pipeline/region.py:130`): no anchors, so no keep-all areas. In
Dietlikon (world `47436cbc7385`, 626 buildings) most houses on residential streets are therefore dropped.

## Data probe (measured, not guessed)

Probe on a 2.6 x 2.6 km Dietlikon cut (osmium `-s simple`, 780 KB, centre 47.425 N 8.625 E), running the real
`world_roads.build` and `world_buildings.build` with different road-class sets, `house_dist` 30 m:

| Road classes counted | Buildings kept |
|---|---|
| main (today) | 570 |
| + residential | 1,688 |
| + residential, living_street | 1,688 (no living_street ways in the cut) |
| + residential, living_street, unclassified | 1,701 |
| + residential, living_street, unclassified, service | 1,890 |

Road pieces in the cut: service 672, residential 223, tertiary 88, primary 59, unclassified 32.

**The maintainer's named target does not pass with residential alone.** Hofwiesenstrasse 13 (w183644216, 262 m2)
is **60.5 m** from the nearest main road, **38.9 m** from the nearest residential street (Hofwiesenstrasse,
way 10700026) and **3.4 m** from a `service` lane (way 498335805), which is how the house is really reached.
At 30 m with residential only it is still dropped; with residential plus service it is kept (probe: 1,890
buildings, contains w183644216). Raising `house_dist` instead would need 40 m with residential only (1,854)
and would also loosen the rule along main roads.

## Design

### Which highway values count

Generated worlds count: `MAIN` plus **`residential`, `living_street`, `unclassified`, `service`**
(constant `NEAR_GENERATED`). Reasoning, in terms of what `world_roads` already draws:

- `residential`: the decision.
- `living_street`: a residential street by another name (shared space, houses on both sides). Free: zero ways
  in the probe cut, but other towns have them.
- `unclassified`: minor public roads, the typical lane to a farm or a hamlet. Houses along them are real homes,
  not outlying sheds, and the road is drawn and drivable. Cheap (+13 in the probe).
- `service`: needed for the maintainer's own example (no. 13 sits on a service lane, not on Hofwiesenstrasse).
  `world_roads` already drops driveways, parking aisles and the other `NO_SERVICE` kinds
  (`pipeline/world_roads.py:31`), so the remaining `service` ways are the alleys and access lanes that the
  game draws. Cost: +202 in the probe.
- Not counted: `motorway`/`motorway_link` (houses next to a motorway are noise barrier land, and the rule
  today excludes them on purpose), `pedestrian`, footways, paths and steps (not drivable streets).

Fallback if the frame-rate check fails (see Verification): drop `service` from `NEAR_GENERATED` (1,701 in the
probe) and report that no. 13 is then out at 38.9 m. Do not change `house_dist`.

### Hand-made regions stay unchanged

`world_buildings.build()` and `osm.build_world()` get a keyword `near_classes`, default `MAIN`. Only
`region._world` (generated worlds) passes `NEAR_GENERATED`. Hochrhein and Ehrendingen are built by the
`osm.py` command line with an anchors file and never pass it, so their `world_*.json` are byte-identical; the
golden tests (`test_golden.py`, `test_golden_ehrendingen.py`) prove it. Hand-made regions already use keep-all
areas and `keep_ids` to place houses on purpose; widening them would shift curated golden numbers for no gain.
The default is an immutable-by-convention constant, so no behaviour hides behind `anchors_path is None`.

### Not a pipeline version bump

`region.PIPELINE_VERSION` stays `"1"`. A bump changes every `world_id`, which breaks share links and drops
the gallery pins. The gallery worlds are rebuilt in place instead (see Rebuild).

### Frame rate

Dietlikon grows from 626 to about 2,000 buildings (about 3x; the probe frame grows 570 to 1,890, 3.3x). The
service limit is 20,000 buildings per world (`service/rhyflitzer_api/config.py:34`), far away. The renderer
draws every entry of `L.buildings` (`prototype/index.html:1586`), so the cost scales with the count. The
check is a measured fps comparison on the GPU browser, old world vs rebuilt world, same camera path.

## Rebuild of the gallery worlds

Generated worlds are built by the service worker (`service/rhyflitzer_api/worker.py` -> `build.py` ->
`region.build_world`). A `ready` world is never rebuilt: `store.submit` returns it as is (`joins`,
`store.py:96`). Re-queuing a row keeps its id, share link and `gallery` flag (`REQUEUE` upserts without
touching `gallery`, `store.py:36`), and the runner replaces `worlds/<id>` with one rename
(`runner.py:100-101`). So no code change is needed: after the fix is deployed, the maintainer re-queues the
gallery worlds by hand (plan Task 5). Worlds not in the gallery keep their old buildings until they expire
(30 days unplayed) and are then rebuilt by the next request; that is accepted.

## Assumptions

- **A1** [high] Implemented as a new `near_classes` parameter plus a `NEAR_GENERATED` constant, not by editing
  `MAIN`. Rejected: adding `residential` to `MAIN`, which would change Hochrhein/Ehrendingen
  (`pipeline/osm.py:117` passes the same call for hand-made worlds) and `world_buildings.MAIN` is only read at
  `world_buildings.py:103`.
- **A2** [med] `service` (and `unclassified`, `living_street`) count too, beyond the decision's literal
  `residential`. Evidence: probe above, no. 13 is 38.9 m from the residential street and 3.4 m from a
  service lane. Rejected: residential only (leaves the headline house out), a larger `house_dist` (also loosens
  main roads). The maintainer may drop `service` via the fallback.
- **A3** [high] `house_dist` stays 30 m, `big_area` 1,000 m2, the 20 m2 minimum stays: outlying sheds still
  drop (`world_buildings.py:127-131`).
- **A4** [high] `PIPELINE_VERSION` not bumped (see above); `docs/11-pipeline-osm.md:226` says a bump gives a new id.
- **A5** [med] Gallery worlds are rebuilt by re-queuing the SQLite row, not through the editor. Rejected: the
  editor, which needs the ALTCHA human check and counts against the per-address limits. The operator may use
  the editor instead; the id is the same.

## Consequences

- Dietlikon grows from 626 to about 2,000 buildings; world.json and load time grow with it (about 3x the
  buildings part).
- Per-world `kept_near` goes up, `kept_big` goes down: a 1,000 m2+ building next to a residential street is now
  counted as near (probe 54 -> 9 big).
- Generated worlds and hand-made regions now follow different rules; `docs/11-pipeline-osm.md` says so.
- More houses beside the race roads: collision and `prop`/car-park logic see `osm_roads` unchanged, buildings
  only get added.

## Acceptance criteria

- [ ] Rebuilt Dietlikon contains w183644216 (Hofwiesenstrasse 13) and the missing houses on Hofwiesenstrasse,
      Altbachstrasse and Bahnhofstrasse; any still missing is reported with its distance to every counted class.
- [ ] Building count before (626) and after reported; fps measured on the GPU browser before and after.
- [ ] Hochrhein and Ehrendingen worlds unchanged (golden tests green, no diff in `data/world_*.json`).
- [ ] Pipeline tests cover: default unchanged, each counted class keeps a house, uncounted classes do not, the
      service lane case, and the generated-world wiring.
- [ ] Docs and CHANGELOG updated; the manual rebuild step is written down for the maintainer.
