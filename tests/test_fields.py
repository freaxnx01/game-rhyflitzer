"""#506: real farm parcels on the Swiss side, draped on the terrain, never on a road."""
import json

import pytest
from playwright.sync_api import sync_playwright

from test_smoke import ARGS, WORLD, MMH   # flat import, like test_suedspange.py's `from test_street_labels import ARGS, WORLD`


def _served_world_has_lwb_fields() -> bool:
    """The served world file carries cantonal fields only when it was rebuilt with --fields."""
    if not WORLD.exists():
        return False
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    return any(f.get("src") == "lwb" for f in w.get("fields", []))


needs_fields_world = pytest.mark.skipif(
    not (WORLD.exists() and MMH.exists() and _served_world_has_lwb_fields()),
    reason="run pipeline/osm.py build --fields and terrain.py first (docs/11-pipeline-osm.md)")


@needs_fields_world
def test_fields_are_drawn_on_the_terrain_and_off_the_roads(server):
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.counts && window.__mm.counts.fields && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.wait_for_selector("#mmhstatus.real", timeout=240000)
        counts = page.evaluate("() => window.__mm.counts.fields")        # n, tris, lwb, osm
        centre = page.evaluate("() => window.__mm.fieldProbe()")          # a ray at the centre of the largest Sisslerfeld parcel
        road = page.evaluate("() => window.__mm.rayHits(280, 418.2)")     # Geuerenstrasse centre line (#290 spot)
        br.close()
    print(counts, centre, road)
    assert counts["n"] >= 3000 and counts["lwb"] >= 2500 and counts["osm"] >= 1 and counts["tris"] < 400000, counts
    assert centre["hit"] in ("field", "meadow") and 0.01 <= centre["y"] - centre["terrain"] <= 0.6, centre
    assert road["field"] is None and road["meadow"] is None, road
