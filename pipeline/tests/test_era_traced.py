"""#530: the hand-traced Sisseln houses of 1952 in the world file."""
import copy
import json
from pathlib import Path

import pytest
from shapely.geometry import LineString, Polygon

import era_traced as T
from geo import Frame

ORIGIN = {"lat": 47.5506, "lon": 7.9671}
FRAME = Frame(ORIGIN["lat"], ORIGIN["lon"])
WORLD_FILE = Path(__file__).parent.parent.parent / "data" / "world_hochrhein.json"


def entry(i, de, dn, size=10.0):
    e, n = FRAME.e0 + de, FRAME.n0 + dn
    return {"id": f"sisseln-{i:02d}", "ref": "1946", "ring": [[e, n], [e + size, n], [e + size, n + size], [e, n + size]]}


def test_house_shape():
    h = T.house(entry(1, 100, -50), FRAME)
    assert set(h) == {"id", "h", "roof", "palette", "rect", "ring", "rh"}
    assert (h["id"], h["h"], h["rh"], h["roof"], h["palette"]) == ("sisseln-01", 6.0, 4.0, "gable", "village")
    xs = sorted({round(x, 3) for x, _ in h["ring"]})
    zs = sorted({round(z, 3) for _, z in h["ring"]})
    assert xs == [100.0, 110.0] and zs == [40.0, 50.0]
    assert h["rect"][2] == pytest.approx(10, abs=0.01) and h["rect"][3] == pytest.approx(10, abs=0.01)


def test_apply_writes_era_houses_and_source():
    world = {"origin": dict(ORIGIN), "sources": [], "era": {"year": 1952}}
    traced = {"houses": [entry(1, 0, 0), entry(2, 50, 0)]}
    assert T.apply(world, traced) == 2
    assert len(world["era"]["houses"]) == 2 and world["era"]["year"] == 1952
    assert world["sources"].count(T.SOURCE_LINE) == 1
    snapshot = copy.deepcopy(world)
    assert T.apply(world, traced) == 2
    assert world == snapshot and list(world["era"]) == ["year", "houses"]


def test_apply_puts_houses_last_after_fields():
    world = {"origin": dict(ORIGIN), "sources": [], "era": {"year": 1952, "houses": [], "fields": [{"kind": "cereal"}]}}
    T.apply(world, {"houses": [entry(1, 0, 0)]})
    assert list(world["era"]) == ["year", "fields", "houses"]


def test_apply_needs_era():
    world = {"origin": dict(ORIGIN), "sources": []}
    snapshot = copy.deepcopy(world)
    with pytest.raises(ValueError, match="era_1952.py"):
        T.apply(world, {"houses": [entry(1, 0, 0)]})
    assert world == snapshot


@pytest.mark.skipif(not WORLD_FILE.exists(), reason="no world file")
def test_committed_houses_clear_of_1952():
    world = json.loads(WORLD_FILE.read_text(encoding="utf-8"))
    houses = world["era"]["houses"]
    assert len(houses) == 28
    standing = [Polygon(b["ring"]) for b in world["buildings"] if not b.get("modern")]
    roads = [LineString(r["pts"]).buffer(r["w"] / 2) for r in world["roads"] if not r.get("modern")]
    for h in houses:
        poly = Polygon(h["ring"])
        for other in standing + roads:
            assert poly.intersection(other).area <= 0.5, h["id"]
