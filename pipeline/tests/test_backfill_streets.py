"""#557: the targeted backfill adds only the street field to an existing world file."""
import copy
import json
from pathlib import Path

import geo
import osm_read

import backfill_building_streets as BF

F = geo.Frame(*geo.DEFAULT_ORIGIN)


def tiny_osm(path, nodes=(), ways=()):
    """A minimal .osm extract: nodes/ways given in game coords against the world origin."""
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6">']
    for nid, x, z, tags in nodes:
        lon, lat = F.game_to_lonlat(x, z)
        t = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
        parts.append(f'<node id="{nid}" lat="{float(lat):.9f}" lon="{float(lon):.9f}">{t}</node>')
    for wid, refs, tags in ways:
        t = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
        parts.append(f'<way id="{wid}">' + "".join(f'<nd ref="{r}"/>' for r in refs) + t + '</way>')
    parts.append("</osm>")
    Path(path).write_text("\n".join(parts) + "\n", encoding="utf-8")
    return Path(path)


def world_dict():
    return {"format": "MMW1", "origin": {"lat": geo.DEFAULT_ORIGIN[0], "lon": geo.DEFAULT_ORIGIN[1]},
            "buildings": [
                {"id": 1, "h": 6.0, "roof": "gable", "rect": [-6.0, 0.0, 12.0, 9.0, 0.0],
                 "ring": [[-12.0, -4.5], [0.0, -4.5], [0.0, 4.5], [-12.0, 4.5]], "addr": "6"},
                {"id": 2, "h": 6.0, "roof": "gable", "rect": [6.0, 0.0, 12.0, 9.0, 0.0],
                 "ring": [[0.0, -4.5], [12.0, -4.5], [12.0, 4.5], [0.0, 4.5]], "addr": "7"},
            ]}


def test_backfill_adds_only_st_from_the_address_nodes(tmp_path):
    pbf = tiny_osm(tmp_path / "tiny.osm", nodes=[(50, -6.0, 0.0, {"addr:housenumber": "6", "addr:street": "Bodenackerstrasse"})])
    world = world_dict()
    before = copy.deepcopy(world)
    stats = BF.backfill(world, osm_read.read(pbf, F))
    assert world["buildings"][0]["st"] == "Bodenackerstrasse"
    assert "st" not in world["buildings"][1], "only the building with a node inside changes"
    for b, o in zip(world["buildings"], before["buildings"]):
        assert {k: v for k, v in b.items() if k != "st"} == o, "no other key changes"
    assert stats == {"nodes": 1, "own": 0}
    assert BF.backfill(world, osm_read.read(pbf, F)) == {"nodes": 0, "own": 0}, "a second run adds nothing"


def test_backfill_own_street_from_the_area_wins(tmp_path):
    ring = [(x, z) for x, z in [(-12.0, -4.5), (0.0, -4.5), (0.0, 4.5), (-12.0, 4.5)]]
    nodes = [(60 + i, x, z, {}) for i, (x, z) in enumerate(ring)] + [(64, -6.0, 0.0, {"addr:housenumber": "6", "addr:street": "Bodenackerstrasse"})]
    ways = [(1, [60, 61, 62, 63, 60], {"building": "yes", "addr:street": "Eigengasse"})]
    pbf = tiny_osm(tmp_path / "tiny.osm", nodes=nodes, ways=ways)
    world = world_dict()
    stats = BF.backfill(world, osm_read.read(pbf, F))
    assert world["buildings"][0]["st"] == "Eigengasse", "the building's own tag beats the node's street"
    assert stats == {"own": 1, "nodes": 0}


def test_backfill_main_round_trips_the_file_except_st(tmp_path):
    pbf = tiny_osm(tmp_path / "tiny.osm", nodes=[(50, -6.0, 0.0, {"addr:housenumber": "6", "addr:street": "Bodenackerstrasse"})])
    world = tmp_path / "world.json"
    raw = json.dumps(world_dict(), ensure_ascii=False, separators=(",", ":"))
    world.write_text(raw, encoding="utf-8")
    assert BF.main(["--pbf", str(pbf), "--world", str(world)]) == 0
    after = world.read_text(encoding="utf-8")
    assert '"st":"Bodenackerstrasse"' in after
    stripped = after.replace('"st":"Bodenackerstrasse",', "").replace(',"st":"Bodenackerstrasse"', "")
    assert stripped == raw, "the file changes nowhere but the st fields"
    BF.main(["--pbf", str(pbf), "--world", str(world)])
    assert world.read_text(encoding="utf-8") == after, "a second run is a no-op"
