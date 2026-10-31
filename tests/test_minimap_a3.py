"""#226: the minimap writes "A3" on the motorway and draws it red. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_boundaries import ARGS, MMH_ROUTE, open_page

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def dist_to_segment(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = 0 if dx == dz == 0 else max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)))
    return math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))


@needs_world
def test_motorway_labels_sit_on_the_motorway_and_it_is_red(server):
    w = json.loads(WORLD.read_text())
    ways = [r["pts"] for r in w["roads"] if r.get("cls") == "motorway"]
    with sync_playwright() as p:
        b, page, errs = open_page(p, server)
        labels = page.evaluate("() => window.__mm.motorwayLabels()")
        assert len(labels) >= 2
        for l in labels:
            assert l["t"] == "A3"
            assert min(dist_to_segment(l["x"], l["z"], pts[i], pts[i + 1]) for pts in ways for i in range(len(pts) - 1)) < 30
        # a motorway point well away from every label is red-ish
        far = [(pts[i], pts[i + 1]) for pts in ways for i in range(len(pts) - 1)
               if all(math.hypot((pts[i][0] + pts[i + 1][0]) / 2 - l["x"], (pts[i][1] + pts[i + 1][1]) / 2 - l["z"]) > 150 for l in labels)]
        assert far
        a, c = far[0]
        px = page.evaluate(f"() => window.__mm.mapPixel({(a[0] + c[0]) / 2}, {(a[1] + c[1]) / 2})")
        r, g, _ = (int(v) for v in px.split(",")[:3])
        assert r > g + 40, px
        assert not errs
        b.close()


def test_hand_layout_has_no_motorway_labels(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, block_world=True)
        assert page.evaluate("() => window.__mm.motorwayLabels()") == []
        assert not errs
        b.close()
