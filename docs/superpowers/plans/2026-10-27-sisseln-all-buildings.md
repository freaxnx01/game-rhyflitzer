# Sisseln All Buildings Implementation Plan

> Implemented locally in the session (needs the git-ignored OSM/DSM caches); not dispatched to the pipeline.

**Goal:** Keep every building inside the Gemeinde Sisseln boundary; add Volg and Neues Schulhaus to the J list.

**Architecture:** `anchors.py` learns polygon areas (`lonlat_polygon`), `anchors.json` gets the `sisseln` area and three
`keep_buildings`, `landmarks.js` two entries, then the world JSON is rebuilt from the local regional extract.

**Tech Stack:** Python pipeline (shapely, pytest), buildless JS game (`node --test`).

**Spec:** [docs/superpowers/specs/2026-10-27-sisseln-all-buildings-design.md](../specs/2026-10-27-sisseln-all-buildings-design.md)

## Global Constraints

- Heavy steps under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- No hand edits to `data/world_hochrhein.json`; only `osm.py build`.
- CHANGELOG entry, player-facing.

### Task 1: Polygon areas in `anchors.py`

- [ ] Failing tests in `pipeline/tests/test_anchors.py`:

```python
def test_lonlat_polygon_area_resolves_to_game_points():
    spec = {"areas": {"s": {"lonlat_polygon": [[7.98, 47.55], [7.99, 47.55], [7.99, 47.556]], "keep_all_buildings": True}}}
    data = OsmData(areas=[], ways=[], nodes={}, named_nodes=[], way_nodes={}, addr_nodes=[], prop_nodes=[])
    pts = anchors.resolve(spec, data, F)["areas"]["s"]
    assert len(pts) == 3 and all(len(p) == 2 for p in pts)
    x, z = F.to_game(7.99, 47.55)
    assert pts[1] == [round(float(x), 1), round(float(z), 1)]


def test_keep_all_boxes_accepts_polygon_areas():
    spec = {"areas": {"p": {"lonlat_polygon": [[0, 0]], "keep_all_buildings": True}, "q": {"game_box": [0, 0, 10, 10], "keep_all_buildings": True}}}
    shapes = anchors.keep_all_boxes(spec, {"areas": {"p": [[0.0, 0.0], [10.0, 0.0], [0.0, 10.0]], "q": [0.0, 0.0, 10.0, 10.0]}})
    assert shapes[0].contains(shapely.Point(2, 2)) and not shapes[0].contains(shapely.Point(8, 8))
    assert shapes[1].bounds == (0.0, 0.0, 10.0, 10.0)
```

- [ ] Implement: in `resolve`, `elif isinstance(a, dict) and "lonlat_polygon" in a:` → list of rounded `frame.to_game`
  points; in `keep_all_boxes`, `shapely.Polygon(v) if v and isinstance(v[0], list) else shapely.box(*v)`.
- [ ] `pipeline/.venv/bin/python -m pytest pipeline/tests -q` green; commit.

### Task 2: Data — area, keep list, landmarks

- [ ] `pipeline/anchors.json`: area `sisseln` with the spec's ring as `lonlat_polygon`, `keep_all_buildings: true`, `src`;
  add `w171822900`, `w282842878` to `keep_buildings` (`w171822721` is there).
- [ ] `prototype/landmarks.js`: `{ name: 'Volg Sisseln', gemeinde: 'Sisseln', building: 171822900 }` and
  `{ name: 'Neues Schulhaus Sisseln', gemeinde: 'Sisseln', building: 282842878 }` after `Schulhaus Sisseln`.
- [ ] Commit.

### Task 3: Rebuild the world and check it

- [ ] Rebuild (from `pipeline/`): `osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --dsm-heights cache --out ../data/world_hochrhein.json`, capped.
- [ ] Compare with main's world: building count +≈416, every new building's centroid inside the ring, both new
  landmark ids present; other sections unchanged or explained.
- [ ] `node --test prototype/tests/*.test.mjs`; targeted Playwright (landmarks / J list) on the GPU browser.
- [ ] CHANGELOG, commit, push, PR.
