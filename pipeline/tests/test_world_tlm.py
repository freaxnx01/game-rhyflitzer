import copy
import json

import numpy as np

import mmh
import tlm_structures
import world_tlm

E0, N0, BASE = 2600000.0, 1200000.0, 300.0


def feature(layer, kind, parts, z=None):
    return {"l": layer, "k": kind, "s": 1, "o": "x", "n": "",
            "p": [[(E0 + x, N0 - zz, z if z is not None else 0.0) for x, zz in part] for part in parts]}


def sloped(layer, kind, pts):
    return {"l": layer, "k": kind, "s": 1, "o": "x", "n": "", "p": [[(E0 + x, N0 - zz, h) for x, zz, h in pts]]}


def doc(structures=(), partners=()):
    return {"format": "TLMS1", "release": "t", "source": "s", "structures": list(structures), "partners": list(partners)}


def world(rail=(), roads=(), landmarks=None):
    return {"format": "MMW1", "origin": {"E": E0, "N": N0}, "sources": ["osm"],
            "railBridges": [{"pts": p, "layer": 1} for p in rail],
            "roads": [{"id": i, "n": n, "bridge": True, "pts": p, "w": 6.0} for i, (n, p) in enumerate(roads)],
            "anchors": {"landmarks": landmarks or {}}}


DECK = [[0.0, 0.0], [40.0, 0.0]]


def test_rail_deck_matched_gets_profile():
    w = world(rail=[DECK])
    stats = world_tlm.apply(w, doc([feature("rail", "Bruecke", [[(0, 0), (40, 0)]], z=310.0)]), BASE)
    assert w["railBridges"][0]["tlm"] == [[float(t), 10.0] for t in range(0, 41, 2)]
    assert stats == {"rail": 1, "road": 0, "under": 0}
    assert world_tlm.SOURCE in w["sources"]


def test_offset_and_direction_rules():
    far = world(rail=[DECK])
    world_tlm.apply(far, doc([feature("rail", "Bruecke", [[(0, 9), (40, 9)]], z=310.0)]), BASE)
    assert "tlm" not in far["railBridges"][0]
    near = world(rail=[DECK])
    world_tlm.apply(near, doc([feature("rail", "Bruecke", [[(20, 3), (20, 13)]], z=310.0)]), BASE)
    assert "tlm" not in near["railBridges"][0]
    ok = world(rail=[DECK])
    world_tlm.apply(ok, doc([feature("rail", "Bruecke", [[(0, 7.5), (40, 7.5)]], z=310.0)]), BASE)
    assert "tlm" in ok["railBridges"][0]


def test_half_matched_piece():
    sixty = world(rail=[DECK])
    world_tlm.apply(sixty, doc([feature("rail", "Bruecke", [[(0, 0), (24, 0)]], z=310.0)]), BASE)
    assert [t for t, _ in sixty["railBridges"][0]["tlm"]] == [float(t) for t in range(0, 25, 2)]
    forty = world(rail=[DECK])
    world_tlm.apply(forty, doc([feature("rail", "Bruecke", [[(0, 0), (16, 0)]], z=310.0)]), BASE)
    assert "tlm" not in forty["railBridges"][0]


def test_profile_follows_the_axis_height():
    w = world(rail=[DECK])
    world_tlm.apply(w, doc([sloped("rail", "Bruecke", [(0, 0, 310.0), (40, 0, 312.0)])]), BASE)
    assert w["railBridges"][0]["tlm"][0] == [0.0, 10.0]
    assert w["railBridges"][0]["tlm"][10] == [20.0, 11.0]
    assert w["railBridges"][0]["tlm"][-1] == [40.0, 12.0]


def test_road_bridge_matched_against_road_layer_only():
    w = world(roads=[("", DECK)])
    world_tlm.apply(w, doc([feature("rail", "Bruecke", [[(0, 0), (40, 0)]], z=310.0)]), BASE)
    assert "tlm" not in w["roads"][0]
    stats = world_tlm.apply(w, doc([feature("road", "Bruecke", [[(0, 0), (40, 0)]], z=310.0)]), BASE)
    assert w["roads"][0]["tlm"][0] == [0.0, 10.0]
    assert stats["road"] == 1
    skipped = world(roads=[("", DECK)])
    world_tlm.apply(skipped, doc([feature("road", "Tunnel", [[(0, 0), (40, 0)]], z=310.0)]), BASE)
    assert "tlm" not in skipped["roads"][0]


def test_under_point_from_partner():
    deck = feature("rail", "Bruecke", [[(0, 0), (40, 0)]], z=310.0)
    low = feature("road", "Keine", [[(20, -20), (20, 20)]], z=304.0)
    w = world(rail=[DECK])
    stats = world_tlm.apply(w, doc([deck], [low]), BASE)
    assert w["railBridges"][0]["tlmUnder"] == [[20.0, 0.0, 4.0, "road"]]
    assert stats["under"] == 1
    high = feature("road", "Keine", [[(20, -20), (20, 20)]], z=308.5)
    w = world(rail=[DECK])
    world_tlm.apply(w, doc([deck], [high]), BASE)
    assert "tlmUnder" not in w["railBridges"][0]


def test_hero_chain_never_matched():
    landmarks = {"holzbruecke": {"x": 20.0, "z": 5.0}}
    w = world(roads=[("Holz", DECK), ("Holz", [[40.0, 0.0], [80.0, 0.0]]), ("Other", [[80.0, 0.0], [120.0, 0.0]]),
                     ("", [[0.0, 100.0], [40.0, 100.0]])], landmarks=landmarks)
    tlm = doc([feature("road", "Bruecke", [[(0, 0), (120, 0)]], z=310.0), feature("road", "Bruecke", [[(0, 100), (40, 100)]], z=310.0)])
    world_tlm.apply(w, tlm, BASE)
    assert ["tlm" in r for r in w["roads"]] == [False, False, True, True]


def test_apply_without_matches_adds_nothing():
    w = world(rail=[DECK], roads=[("", DECK)])
    before = copy.deepcopy(w)
    stats = world_tlm.apply(w, doc([feature("rail", "Bruecke", [[(5000, 5000), (5040, 5000)]], z=310.0)]), BASE)
    assert w == before
    assert stats == {"rail": 0, "road": 0, "under": 0}


def test_rerun_drops_stale_keys():
    w = world(rail=[DECK])
    world_tlm.apply(w, doc([feature("rail", "Bruecke", [[(0, 0), (40, 0)]], z=310.0)]), BASE)
    world_tlm.apply(w, doc(), BASE)
    assert "tlm" not in w["railBridges"][0]
    assert world_tlm.SOURCE not in w["sources"]


def test_cli_is_idempotent(tmp_path):
    w = world(rail=[DECK], roads=[("", [[0.0, 100.0], [40.0, 100.0]])])
    path = tmp_path / "world.json"
    path.write_text(json.dumps(w, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    structures = tmp_path / "s.json.gz"
    tlm_structures.write(doc([feature("rail", "Bruecke", [[(0, 0), (40, 0)]], z=310.0),
                              feature("road", "Bruecke", [[(0, 100), (40, 100)]], z=310.0)],
                             [feature("road", "Keine", [[(20, -20), (20, 20)]], z=304.0)]), structures)
    terrain = tmp_path / "t.mmh"
    mmh.write_mmh(terrain, {"w": 2, "h": 2, "x0": 0, "z0": 0, "step": 16, "base": BASE}, np.zeros((2, 2)))
    argv = ["--world", str(path), "--mmh", str(terrain), "--structures", str(structures)]
    assert world_tlm.main(argv) == 0
    first = path.read_bytes()
    assert b'"tlm"' in first and b'"tlmUnder"' in first
    assert world_tlm.main(argv) == 0
    assert path.read_bytes() == first
