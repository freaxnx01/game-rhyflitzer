# Region editor (idea)

> **Design (2026-10-09):** [`superpowers/specs/2026-10-09-region-editor-design.md`](superpowers/specs/2026-10-09-region-editor-design.md) — public, Switzerland only, one rectangle ≤ 4 × 4 km, built on ionos1. Where it differs from this idea doc, the design wins.

Players pick their own region by dragging a frame on an OSM map. Our server converts it into a playable Rhyflitzer world.

## Flow

1. Map picker (MapLibre or Leaflet) with a draggable, size-limited frame
2. Frame snaps to a fixed tile grid (e.g. 1 × 1 km)
3. Job goes into a server-side queue
4. Pipeline builds only the tiles not already in the cache
5. Player receives a world package (tile list + metadata) and drives

## Consequence for the architecture

The preprocessing script must be built from day one as a **reusable pipeline** (library + CLI), not a one-off script:

- v0: CLI, fixed region (Bad Säckingen / Stein / Sisseln / Sisslerfeld)
- v1: CLI, any region
- v2: web editor wraps the same pipeline as a server job

Snapping to a fixed global tile grid makes tiles deterministic and shareable: two players who pick overlapping frames reuse the same cached tiles.

## Data quality tiers

| Tier | Where | Buildings | Terrain |
|---|---|---|---|
| Gold | Switzerland, Baden-Württemberg (+ other German states with open LoD2) | Official LoD2 with roof shapes | Official DEM |
| Silver | Everywhere else | OSM footprints, height from `building:levels` or `height`, otherwise default | Global DEM (e.g. Copernicus GLO-30) |

The editor shows the tier of the selected region before generating.

## Limits

- **Area**: max frame size (e.g. 4 km²) per job
- **Rate**: jobs per user/IP per day, one job at a time per user
- **Queue**: bounded worker pool, jobs time out
- **Complexity**: max buildings / road segments per tile; reject or simplify beyond
- **Storage**: cache with quota and LRU eviction for tiles nobody plays
- **Accounts**: anonymous = small frames only; logged in = larger frames

## Don't hammer public OSM services

- The public Overpass API and the OSM tile servers have usage policies; a public editor would violate them quickly
- Instead: download regional extracts (Geofabrik PBF, e.g. Switzerland + Baden-Württemberg), update them periodically, and cut regions locally (osmium)
- Map picker tiles: self-hosted vector tiles or a provider with a suitable free tier
- Fits the self-hosting approach

## Generated worlds need gameplay

Hand-made regions have races and hero assets; generated ones don't. So:
- **Auto races**: pick checkpoints on the road graph by distance and road type, compute a par time from A* routes
- **Cruise mode** always works
- Landmarks: generic procedural buildings only; hero assets stay exclusive to curated regions

## Licensing

- OSM is ODbL: attribution in the game; generated tile data served publicly is likely a derivative database and has to be offered under ODbL
- swisstopo and LGL: attribution per source, shown per tile/region
- Check before launch

## Scope

v2 feature. Build and prove the pipeline on the fixed v0 region first.
