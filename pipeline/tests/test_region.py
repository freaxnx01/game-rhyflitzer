"""#166: build_world on a synthetic extract -- no download, no osmium cut; terrain is a fake flat grid."""
import json
import os
from types import SimpleNamespace

import numpy as np
import pytest
import shapely

import frame as F
import geo
import mmh
import region
from tests import synth_osm


def flat_terrain(bbox, origin, step, base, cache, dgm_dir):
    g = geo.grid_for(bbox, geo.Frame(*origin), step)
    header = {"format": "MMH1", "w": g["w"], "h": g["h"], "step": step, "x0": g["x0"], "z0": g["z0"],
              "origin": {"lat": origin[0], "lon": origin[1]}, "base": base, "min": 0.0, "max": 0.0, "bbox": list(bbox)}
    heights = np.full((g["h"], g["w"]), 412.6, dtype=np.float32)
    heights[0, 0] = 430.0
    return header, heights


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("region")
    mp = pytest.MonkeyPatch()
    mp.setattr(region.terrain, "build", flat_terrain)
    steps = []
    files = region.build_world(synth_osm.RECT, tmp / "out", pbf=synth_osm.write(tmp / "synth.osm"), cache=tmp / "cache",
                               dsm=False, progress=steps.append)
    mp.undo()
    return files, json.loads(files["world"].read_text("utf-8")), json.loads(files["meta"].read_text("utf-8")), steps


def test_files_steps_and_terrain_base(built):
    files, _, _, steps = built
    assert set(files) == {"world", "terrain", "meta"} and all(p.exists() for p in files.values())
    assert steps == ["terrain", "world", "places", "done"]                  # no cut: pbf= was given
    assert not [p for p in files["world"].parent.iterdir() if p.is_dir()]  # temp dir gone
    hdr, heights = mmh.read_mmh(files["terrain"])
    assert hdr["base"] == 412.0 and float(heights.min()) == pytest.approx(0.6, abs=1e-4)


def test_name_villages_jlist_start(built):
    _, world, meta, _ = built
    r, a = world["region"], world["anchors"]
    assert r["name"] == meta["name"] == "Ahausen" and r["gemeinden"] == ["Ahausen"]
    assert [v["t"] for v in r["villages"]] == ["AHAUSEN", "BEDORF"] == [lb["t"] for lb in a["labels"]]
    assert [(e["n"], e["kind"], e["g"]) for e in r["jlist"]] == [
        ("Ahausen", "village", "Ahausen"), ("Ahausen Bahnhof", "station", "Ahausen"),
        ("Kirche Ahausen", "place_of_worship", "Ahausen"), ("Schulhaus Ahausen", "school", "Ahausen")]
    assert len(a["start"]) == 3 and abs(a["start"][0]) < 200 and abs(a["start"][1]) < 200    # on the secondary/tertiary cross
    assert a["cps"] == [] and r["race"] is None and r["forestAbove"] is None


def test_forests_and_clip(built):
    _, world, meta, _ = built
    assert len(world["forests"]) == 1 == meta["counts"]["forests"]
    assert shapely.Polygon(world["forests"][0]["ring"]).area > 50_000
    x0, x1, z0, z1 = world["region"]["treeBox"]
    assert x1 - x0 == pytest.approx(2000, abs=0.2) and z1 - z0 == pytest.approx(2000, abs=0.2)
    assert all(x0 - 0.1 <= p[0] <= x1 + 0.1 and z0 - 0.1 <= p[1] <= z1 + 0.1 for r in world["roads"] for p in r["pts"])


def test_meta(built):
    _, world, meta, _ = built
    assert meta["id"] == F.world_id(synth_osm.RECT, region.PIPELINE_VERSION) == world["region"]["id"]
    assert meta["bbox"]["lv95"] == list(synth_osm.RECT) and meta["lastPlayed"] is None and meta["race"] is False
    assert "ODbL" in meta["license"] and meta["extract"]["file"] == "synth.osm" and meta["base"] == 412.0
    assert "Terrain: swissALTI3D © swisstopo" in meta["sources"] and world["origin"]["lat"] == F.origin(synth_osm.RECT)[0]


def test_build_world_refuses_bad_input(tmp_path):
    with pytest.raises(ValueError):
        region.build_world(synth_osm.RECT, tmp_path)                                         # neither extract nor pbf
    with pytest.raises(F.FrameError) as e:
        region.build_world((2693000, 1283000, 2695000, 1285000), tmp_path, pbf="x.osm")    # Büsingen
    assert e.value.code == "outside-ch"


def test_rebase_and_prune_tiles(tmp_path):
    hdr, _ = region.rebase({"base": 0.0}, np.array([[401.7, 405.0], [399.2, 420.0]], dtype=np.float32))
    assert hdr["base"] == 399.0 and hdr["min"] == pytest.approx(0.2, abs=1e-4) and hdr["max"] == pytest.approx(21.0)
    for i, name in enumerate(["a.tif", "b.tif", "c.tif"]):
        (tmp_path / name).write_bytes(b"x" * 100)
        os.utime(tmp_path / name, (1000 + i, 1000 + i))
    assert region.prune_tiles(tmp_path, 150) == 2 and [p.name for p in tmp_path.iterdir()] == ["c.tif"]
    assert region.prune_tiles(tmp_path / "missing", 0) == 0


def test_game_box_and_fallback_name():
    x0, z0, x1, z1 = region.game_box(synth_osm.RECT, geo.Frame(*F.origin(synth_osm.RECT)))
    assert x1 - x0 == pytest.approx(2000, abs=0.2) and z0 < 0 < z1
    clip = shapely.box(x0, z0, x1, z1)
    jl = [{"n": "Far", "kind": "village", "x": 900, "z": 900}, {"n": "Near", "kind": "village", "x": 10, "z": 0},
          {"n": "Kirche", "kind": "place_of_worship", "x": 0, "z": 0}]
    assert region.fallback_name(jl, clip, synth_osm.RECT) == "Near"
    assert region.fallback_name([], clip, synth_osm.RECT) == "Region 2667/1259"


def test_empty_frame_still_builds_for_free_driving():
    world = {"roads": []}
    r = region.generated(world, SimpleNamespace(named_nodes=[], areas=[]), [], shapely.box(-1000, -1000, 1000, 1000),
                         synth_osm.RECT, "abc")
    assert r["name"] == "Region 2667/1259" and r["jlist"] == [] and r["race"] is None
    assert world["anchors"]["cps"] == [] and "start" not in world["anchors"] and world["forests"] == []
