# Pipeline step 1: terrain

Replaces the prototype's made-up hills with measured heights from swisstopo and LGL.

## What it does

`pipeline/terrain.py`:

1. Finds all **swissALTI3D** 2 m tiles in the bounding box via the swisstopo STAC API, keeps the newest survey per tile, downloads them into `cache/` (only once).
2. Reads **LGL DGM1** tiles for the German side from a local folder (GeoTIFF, ASC or XYZ).
3. Reprojects both (EPSG:2056 and EPSG:25832) onto one grid in the Swiss LV95 frame, snapped to the game origin. Swiss data wins where both exist; DGM1 fills the rest.
4. Subtracts a base height (default 284 m a.s.l., roughly the Rhine at Sisseln) so the valley floor is near 0.
5. Writes one `.mmh` file (Map Madness Heightmap).

## Run it

```bash
cd pipeline
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Swiss side only (fully automatic)
python terrain.py --out ../data/terrain_hochrhein.mmh

# With the German side
python terrain.py --dgm-dir ~/geodata/lgl_dgm1 --out ../data/terrain_hochrhein.mmh
```

Options: `--bbox W S E N` (lon/lat), `--origin LAT LON`, `--step 4` (metres), `--base 284`, `--cache cache`.

Default region: 7.905–8.030 E, 47.532–47.572 N (Bad Säckingen to east of Sisseln), 4 m grid, about 9.4 × 4.5 km, around 10 MB.

## German tiles (manual download)

The LGL portal hands out DGM1 in 2 × 2 km tiles. For the default region you need the tiles covering Bad Säckingen and the Hotzenwald slope north of it.

1. Open the LGL Open GeoData portal (opengeodata.lgl-bw.de), product **DGM1**.
2. Select the tiles around Bad Säckingen / Wehr / Murg.
3. Unzip everything into one folder and pass it with `--dgm-dir`.

## Load it in the prototype

Start screen → **Load terrain (.mmh)** → pick the file. The browser keeps it (IndexedDB) and rebuilds the world with measured heights. **Use made-up terrain** switches back.

## The .mmh format

```
"MMH1" | uint32 LE header length | header JSON (UTF-8, padded to 4 bytes) | float32 LE heights
```

Header fields: `w`, `h` (samples), `step` (m), `x0`, `z0` (game coordinates of sample [0,0], the north-west corner), `origin` (lat/lon and LV95 E/N of game 0,0), `base`, `min`, `max`, `bbox`, `sources` (attribution strings). Row 0 is north, column 0 is west. Game x = east, z = south, metres.

The same format will serve the region editor later: one `.mmh` per 1 × 1 km tile.

## Known limits

- The prototype's roads, river and buildings are hand-traced from screenshots and only roughly georeferenced (origin 47.5506 N, 7.9671 E, errors of tens of metres). Heights are measured, but a road may sit a few metres beside its real embankment. The OSM step of the pipeline fixes that.
- Inside the prototype's river outline the ground is forced to water level; banks are blended over 30 m.
- Bridges keep their own deck profile.

## Incident: osmium extract took down agent-dev (2026-09-29)

While preparing the OSM step, `osmium extract -b 7.905,47.532,8.030,47.572 -s smart` on the full `switzerland-latest.osm.pbf` (547 MB) grew to 2.5 GB RSS. On top of the other sessions already running there, that pushed agent-dev (CT 201, 12 GB cap, swap 0) to its memory limit. No OOM kill happened. The kernel kept evicting and re-reading file pages instead, which drove the whole cirrus-pve node into IO thrash (load 171). agent-dev SSH and Authentik (CT 124, same node) stopped responding, so `opkssh login` hung too. The process was killed after about 15 minutes. `cache/osm/ch.osm.pbf`, `de.osm.pbf` and `region.osm.pbf` date from that moment and may be incomplete, so regenerate them.

For the OSM step:

- Do not run `osmium extract` on a country file on agent-dev. Use a small regional extract instead (for example the Geofabrik `freiburg-regbez` file, or a pre-cut Swiss canton or bbox from an extract service), or query the bbox directly via Overpass.
- If you do run it on a big file, use `-s simple` (streams, low memory) instead of `-s smart`, and put a hard memory cap around it: `systemd-run --user --scope -p MemoryMax=2G -p MemorySwapMax=0 osmium extract ...`
- Heavy one-off data preparation belongs on a node with spare RAM (odroid-plus-pve), not on the shared agent box.

## Attribution (game credits)

- swissALTI3D: © swisstopo
- DGM1: Datengrundlage: LGL, www.lgl-bw.de (dl-de/by-2-0)
