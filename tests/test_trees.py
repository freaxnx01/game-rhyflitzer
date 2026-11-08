"""#734: the nicer trees -- the per-tile LOD budget, the wind clock and the fruit trees. Smoke-level: the headless renderer
draws about 1 fps, so every wait is on window.__mm.pause().frame, never a fixed sleep."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

# the centre of the fullest 512 m forest tile: the car is placed there, so the camera stands inside a wood
FULLEST_TILE_JS = """() => { const n = {}; for (const [x, z] of window.__FOREST) { const k = Math.floor(x / 512) + ',' + Math.floor(z / 512); n[k] = (n[k] || 0) + 1; }
  const [k] = Object.entries(n).sort((a, b) => b[1] - a[1])[0], [i, j] = k.split(',').map(Number); return [(i + 0.5) * 512, (j + 0.5) * 512]; }"""


def open_world(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.counts.forest && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    return b, page


def frames(page, n):
    """Let the loop draw n more frames."""
    f0 = page.evaluate("() => window.__mm.pause().frame")
    page.wait_for_function(f"() => window.__mm.pause().frame >= {f0 + n}", timeout=120000)


@needs_world
def test_forest_lod_stays_within_the_budget(server):
    """At most 9 tiles (about 7000 trees) draw the fine crowns, wherever the car is; the Original style draws no solid tree."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            total = page.evaluate("() => window.__mm.counts.forest.trees")
            page.evaluate("() => window.__mm.setStyle('smooth')"); frames(page, 3)
            at_start = page.evaluate("() => window.__mm.treeLod()")
            cx, cz = page.evaluate(FULLEST_TILE_JS)
            page.evaluate(f"() => window.__mm.place({cx}, {cz}, 0)"); frames(page, 4)
            # read the tier and freeze it in the same JS turn: a smooth frame between two evaluates would
            # still be free to flip a tile on the 700 m boundary (the turntable camera orbits +-10 m)
            in_wood = page.evaluate("() => { const r = window.__mm.treeLod(); window.__mm.setStyle('original'); return r; }")
            frames(page, 2)
            original = page.evaluate("() => window.__mm.treeLod()")
        finally:
            b.close()
    for r in (at_start, in_wood):
        assert r["fineTrees"] + r["coarseTrees"] == total, r
        assert r["fineTiles"] <= 9 and r["fineTrees"] <= 7000, r
        assert r["visibleSolid"] == r["fineTiles"] + r["coarseTiles"], r   # every tile shows exactly one tier
    assert in_wood["fineTiles"] >= 1 and in_wood["fineTrees"] > 0, in_wood
    assert original["visibleSolid"] == 0 and original["fineTiles"] == in_wood["fineTiles"], original   # the tier is kept, only hidden


@needs_world
def test_wind_clock_runs_and_pauses(server):
    """The crown shader is patched with the wind, its clock runs while playing and stands still in the pause."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            page.click("#startbtn")   # Escape only pauses in a run (canPause: overlay hidden, race armed or running)
            page.wait_for_function("() => ['armed', 'racing'].includes(window.__mm.pause().state)", timeout=30000)
            page.evaluate("() => window.__mm.setStyle('smooth')"); frames(page, 2)
            w0 = page.evaluate("() => window.__mm.treeWind()"); frames(page, 3)
            w1 = page.evaluate("() => window.__mm.treeWind()")
            page.keyboard.press("Escape")
            page.wait_for_function("() => window.__mm.pause().on", timeout=30000); frames(page, 1)
            p0 = page.evaluate("() => window.__mm.treeWind()"); frames(page, 3)
            p1 = page.evaluate("() => window.__mm.treeWind()")
        finally:
            b.close()
    assert w1["patched"] is True and w1["amp"] > 0, w1
    assert w1["time"] > w0["time"], (w0, w1)
    assert p1["time"] == p0["time"], (p0, p1)


@needs_world
def test_fruit_trees_stand_alone_not_in_the_woods(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            n = page.evaluate("() => window.__mm.treeSpecies()")
        finally:
            b.close()
    assert n["single"].get("fruit", 0) > 0, n
    assert n["forest"].get("fruit", 0) < n["forest"]["spruce"] / 4, n   # only the 4 % on the edges, never in the fill
