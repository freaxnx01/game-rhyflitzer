from pathlib import Path

import geo
import osm


def test_cut_commands_extract_each_then_merge(tmp_path):
    pbfs = [Path("/g/switzerland-latest.osm.pbf"), Path("/g/freiburg-regbez-latest.osm.pbf")]
    cmds = osm.cut_commands(pbfs, geo.pad_bbox(geo.DEFAULT_BBOX, 2000), tmp_path / "out.osm.pbf", tmp_path)
    assert len(cmds) == 3
    for c, src in zip(cmds[:2], pbfs):
        assert c[:2] == ["osmium", "extract"]
        assert "-s" in c and c[c.index("-s") + 1] == "smart"
        assert str(src) in c and "--overwrite" in c
        w, s, e, n = map(float, c[c.index("-b") + 1].split(","))
        assert w < 7.905 and e > 8.030 and s < 47.532 and n > 47.572
    assert cmds[2][:2] == ["osmium", "merge"] and cmds[2][-1] == str(tmp_path / "out.osm.pbf")


def test_cut_dry_run_prints_commands(tmp_path, capsys):
    (tmp_path / "a.osm.pbf").write_bytes(b"")
    osm.main(["cut", "--pbf-dir", str(tmp_path), "--out", str(tmp_path / "o.osm.pbf"), "--dry-run"])
    out = capsys.readouterr().out
    assert "osmium extract" in out and "osmium merge" in out
