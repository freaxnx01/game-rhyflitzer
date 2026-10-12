import shutil
import subprocess
from collections import Counter

import pytest

from conftest import T0
from rhyflitzer_api import roadgrid

needs_osmium = pytest.mark.skipif(shutil.which("osmium") is None, reason="osmium-tool not installed")
SYNTH = ('<?xml version="1.0"?><osm version="0.6">'
         '<node id="1" lat="47.4750" lon="8.3000"/><node id="2" lat="47.4850" lon="8.3000"/>'
         '<way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/></way>'
         '<way id="11"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/></way></osm>')


def test_a_way_counts_for_the_cells_its_pieces_lie_in():
    cells = roadgrid.cells_of_way([(250.0, 250.0), (2250.0, 250.0)])
    assert dict(cells) == {(0, 0): 250.0, (1, 0): 500.0, (2, 0): 500.0, (3, 0): 500.0, (4, 0): 250.0}


def test_major_meters_sums_cells_centred_in_the_frame_and_is_none_without_an_index(store):
    assert store.major_meters((500.0, 500.0, 1500.0, 1500.0)) is None
    store.replace_roadgrid([(1, 1, 700), (2, 2, 300), (9, 9, 99999)])       # centres (750, 750), (1250, 1250)
    assert store.major_meters((500.0, 500.0, 1500.0, 1500.0)) == 1000
    assert store.major_meters((500.0, 500.0, 1000.0, 1000.0)) == 700


def test_run_due_builds_once_per_extract(store, settings):
    settings.extract_path.parent.mkdir(parents=True)
    settings.extract_path.write_bytes(b"x")
    calls = []

    def build(path, work):
        calls.append(path)
        return Counter({(1, 1): 3999.6})

    roadgrid.run_due(store, settings, T0, build=build)
    roadgrid.run_due(store, settings, T0 + 5000, build=build)
    assert len(calls) == 1 and store.major_meters((500.0, 500.0, 1000.0, 1000.0)) == 4000


def test_a_failed_index_build_is_retried_at_most_hourly(store, settings):
    settings.extract_path.parent.mkdir(parents=True)
    settings.extract_path.write_bytes(b"x")
    calls = []

    def build(path, work):
        calls.append(path)
        raise subprocess.CalledProcessError(1, "osmium")

    for offset in (0, 60, 3600):
        roadgrid.run_due(store, settings, T0 + offset, build=build)
    assert len(calls) == 2 and store.major_meters((500.0, 500.0, 1000.0, 1000.0)) is None


@needs_osmium
def test_build_reads_only_major_roads_from_a_synthetic_extract(tmp_path):
    extract = tmp_path / "ch.osm"
    extract.write_text(SYNTH, encoding="utf-8")
    cells = roadgrid.build(extract, tmp_path)
    assert abs(sum(cells.values()) - 1112) < 15 and not (tmp_path / "major-roads.pbf").exists()
