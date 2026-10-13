"""#228: the minimap names every Gemeinde, each once at its place node, with RHEIN/HOLZBRÜCKE kept.
Playwright: run in the foreground, never run_in_background."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errs


@needs_world
def test_minimap_names_every_gemeinde(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server)
        names = page.evaluate("() => window.__mm.minimapNames()")
        labels = [n["t"] for n in names]
        for t in ["MÜNCHWILEN", "EIKEN", "ZUZGEN", "GIPF-OBERFRICK", "KAISTEN", "WEGENSTETTEN"]:
            assert t in labels, t
        for t in ["RHEIN", "HOLZBRÜCKE"]:
            assert t in labels, t
        # no village name is doubled: SISSELN moves from the Rhine bank to the village node, not both
        village_names = page.evaluate("() => window.__mm.minimapNames().map(n => n.t).filter(t => !['RHEIN','HOLZBRÜCKE'].includes(t))")
        from collections import Counter
        dupes = [t for t, c in Counter(village_names).items() if c > 1]
        assert dupes == [], f"doubled villages: {dupes}"
        assert labels.count("SISSELN") == 1, "SISSELN doubled"
        # every name lies inside the map extent (800 x 400)
        for n in names:
            mx, my = page.evaluate("([x, z]) => window.__mm.worldToMap(x, z)", [n["x"], n["z"]])
            assert 0 <= mx <= 800 and 0 <= my <= 400, f"{n['t']} at ({mx}, {my})"
        assert errs == []
        b.close()


def test_hand_layout_has_no_minimap_names(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, block_world=True)
        names = page.evaluate("() => window.__mm.minimapNames()")
        assert names == []
        assert errs == []
        b.close()
