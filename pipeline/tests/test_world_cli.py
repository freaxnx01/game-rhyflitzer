"""#166: `osm.py world` -- argument handling; the build itself is mocked."""
from pathlib import Path

import pytest

import frame as F
import osm
import region


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake(rect, out_dir, **kw):
        seen.append((rect, Path(out_dir), kw))
        return {"world": Path(out_dir) / "world.json", "terrain": Path(out_dir) / "terrain.mmh", "meta": Path(out_dir) / "meta.json"}
    monkeypatch.setattr(region, "build_world", fake)
    return seen


def test_lv95_and_pbf(calls, tmp_path, capsys):
    assert osm.main(["world", "--lv95", "2667000", "1259750", "2669000", "1261750", "--pbf", "r.osm.pbf", "--out", str(tmp_path), "--no-dsm"]) == 0
    rect, out, kw = calls[0]
    assert rect == (2667000.0, 1259750.0, 2669000.0, 1261750.0) and out == tmp_path
    assert kw["pbf"] == "r.osm.pbf" and kw["extract"] is None and kw["dsm"] is False and kw["cache"] == Path("cache")
    assert capsys.readouterr().out.split() == [str(tmp_path / n) for n in ("world.json", "terrain.mmh", "meta.json")]


def test_bbox_becomes_the_enclosing_lv95_rectangle(calls, tmp_path):
    assert osm.main(["world", "--bbox", "8.3283", "47.4850", "8.3550", "47.5030", "--extract", "ch.pbf", "--out", str(tmp_path)]) == 0
    rect, _, kw = calls[0]
    assert rect == F.from_lonlat(8.3283, 47.4850, 8.3550, 47.5030) and kw["extract"] == "ch.pbf" and kw["dsm"] is True


def test_refused_frame_exits_2(monkeypatch, tmp_path):
    def refuse(rect, out_dir, **kw):
        raise F.FrameError("outside-ch", "the frame must lie entirely inside Switzerland")
    monkeypatch.setattr(region, "build_world", refuse)
    assert osm.main(["world", "--lv95", "2693000", "1283000", "2695000", "1285000", "--pbf", "x", "--out", str(tmp_path)]) == 2


def test_extract_and_pbf_are_exclusive(tmp_path):
    with pytest.raises(SystemExit):
        osm.main(["world", "--lv95", "0", "0", "1", "1", "--pbf", "a", "--extract", "b", "--out", str(tmp_path)])
