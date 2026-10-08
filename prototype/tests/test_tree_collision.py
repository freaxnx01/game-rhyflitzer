"""#131: trees are solid at the trunk, like lamp posts; they never reach a road.
Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

# isolated trees: no other tree within 6 m, so a push comes from this trunk alone
ISOLATED_JS = """(n) => {
  const T = window.__TREES, out = [];
  for (let i = 0; i < T.length && out.length < n; i += 7) {
    const [x, z, h] = T[i];
    if (T.some(([u, v], j) => j !== i && Math.hypot(u - x, v - z) < 6)) continue;
    out.push([x, z, h, window.__mm.treeTrunkR(h)]);
  }
  return out;
}"""

# first tree with 25 m of open ground to its west: pushAt finds nothing on the approach line
APPROACH_JS = """(rc) => {
  for (const [x, z, h] of window.__TREES) {
    const rt = window.__mm.treeTrunkR(h); let clear = true;
    for (let px = x - 25; px <= x - rc - rt - 0.3 && clear; px += 1) { const d = window.__mm.pushAt(px, z); clear = Math.hypot(d.dx, d.dz) < 0.01; }
    if (clear) return [x, z, h, rt];
  }
  return null;
}"""


def open_world(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__TREES && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    return b, page


def car_radius(page):
    return page.evaluate("() => { const v = window.__mm.vehicle(); return v.collision.r * v.scale; }")


@needs_world
def test_pushAt_besideATrunk_pushesTheCarOut(server):
    """A car resting 0.5 m east of a tree's centre is pushed straight east, out of the trunk (today: not at all)."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        trees = page.evaluate(ISOLATED_JS, 50)
        pushes = page.evaluate("(ts) => ts.map(([x, z]) => window.__mm.pushAt(x + 0.5, z))", trees)
        b.close()
    assert len(trees) >= 20, len(trees)
    bad = [(t, d) for t, d in zip(trees, pushes) if abs(d["dx"] - (rc + t[3] - 0.5)) > 0.05 or abs(d["dz"]) > 0.05]
    assert bad == [], bad[:5]


@needs_world
def test_sim_driveAtATree_stopsInFrontOfTheTrunk(server):
    """Full gas straight at a tree from 25 m west: the car stops with its circle on the trunk, it does not pass through."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        tree = page.evaluate(APPROACH_JS, rc)
        assert tree is not None
        x, z, h, rt = tree
        r = page.evaluate(f"() => window.__mm.sim({x - 25}, {z}, 0, 0, 5)")
        b.close()
    assert r["x"] < x - rt - rc + 0.3, (r, tree, rc)   # stopped in front of the trunk
    assert r["x"] > x - 25 + 10, (r, tree)             # and it really drove there
    assert abs(r["z"] - z) < 0.5, (r, tree)


@needs_world
def test_no_tree_reaches_a_road(server):
    """No tree collider can touch a car whose centre is on a road: trees never block driving."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        n = page.evaluate("() => [window.__mm.treesOnRoad(), window.__TREES.length]")
        b.close()
    assert n[1] > 1000 and n[0] == 0, n
