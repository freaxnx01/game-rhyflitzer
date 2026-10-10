"""#166: build_world on a synthetic extract -- no download, no osmium cut; terrain is a fake flat grid."""
import json
import math
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
from tests.test_race import bridge_works


def flat_terrain(bbox, origin, step, base, cache, dgm_dir):
    g = geo.grid_for(bbox, geo.Frame(*origin), step)
    header = {"format": "MMH1", "w": g["w"], "h": g["h"], "step": step, "x0": g["x0"], "z0": g["z0"],
              "origin": {"lat": origin[0], "lon": origin[1]}, "base": base, "min": 0.0, "max": 0.0, "bbox": list(bbox)}
    heights = np.full((g["h"], g["w"]), 412.6, dtype=np.float32)
    heights[0, 0] = 430.0
    return header, heights


def no_race(mp):
    """Stub the automatic race out: only the race needs Node, the rest of build_world must run without it."""
    mp.setattr(region.race, "build", lambda *a: None)


def build_synth(tmp_path_factory, name, with_race: bool):
    tmp = tmp_path_factory.mktemp(name)
    mp = pytest.MonkeyPatch()
    mp.setattr(region.terrain, "sample", lambda b, o, s, c, d: flat_terrain(b, o, s, 0.0, c, d))
    if not with_race:
        no_race(mp)
    steps = []
    files = region.build_world(synth_osm.RECT, tmp / "out", pbf=synth_osm.write(tmp / "synth.osm"), cache=tmp / "cache",
                               dsm=False, progress=steps.append)
    mp.undo()
    return files, json.loads(files["world"].read_text("utf-8")), json.loads(files["meta"].read_text("utf-8")), steps


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """The synthetic world without its race: runs on any host, Node or not."""
    return build_synth(tmp_path_factory, "region", with_race=False)


@pytest.fixture(scope="module")
def raced(tmp_path_factory):
    """The synthetic world with its automatic race, measured with the game's A* through Node."""
    if not bridge_works():
        pytest.skip("no Node 22+ on PATH: the race measures its legs with the game's A*")
    return build_synth(tmp_path_factory, "raced", with_race=True)


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


def test_race_in_the_world_file(raced):
    _, world, meta, _ = raced
    a, race = world["anchors"], world["region"]["race"]
    pts = [a["start"][:2]] + [[c["x"], c["z"]] for c in a["cps"] + [a["finish"]]]
    assert len(a["cps"]) == 5 and len({c["n"] for c in a["cps"] + [a["finish"]]}) == 6
    x0, x1, z0, z1 = world["region"]["treeBox"]
    assert all(x0 + 149 <= x <= x1 - 149 and z0 + 149 <= z <= z1 - 149 for x, z in pts[1:])     # 150 m off the edge
    assert all(math.dist(p, q) >= 300 for i, p in enumerate(pts) for q in pts[i + 1:])
    assert 2500 <= race["len"] <= 7200 and race["par"] == math.ceil(race["len"] / 12.5) and meta["race"] is True


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
    world = {"roads": [], "forests": []}            # as osm.build_world returns it
    r = region.generated(world, SimpleNamespace(named_nodes=[], areas=[]), [], shapely.box(-1000, -1000, 1000, 1000),
                         synth_osm.RECT, "abc")
    assert r["name"] == "Region 2667/1259" and r["jlist"] == [] and r["race"] is None
    assert world["anchors"]["cps"] == [] and "start" not in world["anchors"] and world["forests"] == []


def test_rebase_ignores_cells_without_data():
    heights = np.array([[412.6, np.nan], [413.0, 420.0]], dtype=np.float32)   # a grid cell outside Switzerland
    hdr, out = region.rebase({"base": 0.0}, heights)
    assert hdr["base"] == 412.0 and hdr["min"] == 0.0 and hdr["max"] == pytest.approx(8.0)
    assert not np.isnan(out).any() and out[0, 1] == 0.0                         # the hole sits at the valley floor


def test_rebase_refuses_a_grid_without_any_data():
    with pytest.raises(ValueError, match="no terrain"):
        region.rebase({"base": 0.0}, np.full((2, 2), np.nan, dtype=np.float32))


def holey_terrain(bbox, origin, step, cache, dgm_dir):
    header, heights = flat_terrain(bbox, origin, step, 0.0, cache, dgm_dir)
    heights[-1, :] = np.nan                       # the grid's south row lies outside Switzerland: no swissALTI3D tile
    return header, heights


def test_terrain_reaching_outside_switzerland_keeps_the_base(tmp_path, monkeypatch):
    monkeypatch.setattr(region.terrain, "sample", holey_terrain)
    no_race(monkeypatch)
    files = region.build_world(synth_osm.RECT, tmp_path / "out", pbf=synth_osm.write(tmp_path / "synth.osm"),
                               cache=tmp_path / "cache", dsm=False)
    hdr, heights = mmh.read_mmh(files["terrain"])
    meta = json.loads(files["meta"].read_text("utf-8"))
    assert hdr["base"] == meta["base"] == 412.0 and not np.isnan(heights).any()
    assert float(heights.min()) == 0.0 and float(heights.max()) == pytest.approx(18.0)


def test_one_boundary_read_and_both_tile_caches_pruned(tmp_path, monkeypatch):
    monkeypatch.setattr(region.terrain, "sample", lambda b, o, s, c, d: flat_terrain(b, o, s, 0.0, c, d))
    reads, real_read = [], region.world_boundaries.read
    monkeypatch.setattr(region.world_boundaries, "read", lambda *a: reads.append(a) or real_read(*a))
    no_race(monkeypatch)
    for name in ("swissalti3d", "swisssurface3d"):
        (tmp_path / "cache" / name).mkdir(parents=True)
        for i in range(3):
            (tmp_path / "cache" / name / f"t{i}.tif").write_bytes(b"x" * 100)
    region.build_world(synth_osm.RECT, tmp_path / "out", pbf=synth_osm.write(tmp_path / "synth.osm"),
                       cache=tmp_path / "cache", dsm=False, tile_cache_bytes=150)
    assert len(reads) == 1                                                    # osm.build_world reuses the lines
    assert [len(list((tmp_path / "cache" / n).glob("*.tif"))) for n in ("swissalti3d", "swisssurface3d")] == [1, 1]
