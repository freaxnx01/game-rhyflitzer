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

# #211: the same two probes over the OSM forest trees (window.__FOREST); stride 37 spreads them over the map
ISOLATED_FOREST_JS = ISOLATED_JS.replace("window.__TREES", "window.__FOREST").replace("i += 7", "i += 37")
APPROACH_FOREST_JS = APPROACH_JS.replace("window.__TREES", "window.__FOREST")

# a flat, trunk-free 40 m line heading +x: every 1 m point clear of colliders (pushAt), terrain within 0.6 m of the start,
# and either all inside a wood (wood=true) or all outside every wood and off the roads (wood=false)
FLAT_LINE_JS = """([wood, rc]) => {
  const T = wood ? window.__FOREST : window.__TREES;
  for (let i = 0; i < T.length; i += 11) {
    const [tx, tz] = T[i], x0 = tx + 3 + rc, z = tz, y0 = window.__mm.probe(x0, z).terrain; let ok = true;
    for (let d = 0; d <= 40 && ok; d += 1) {
      const x = x0 + d, pr = window.__mm.probe(x, z), push = window.__mm.pushAt(x, z, pr.terrain + 0.5);
      ok = pr.water === null && !pr.bridge && Math.abs(pr.terrain - y0) < 0.6 && Math.hypot(push.dx, push.dz) < 0.01
        && window.__mm.inWood(x, z) === wood && (wood || window.__mm.roadDistAt(x, z) > 3);
    }
    if (ok) return [x0, z];
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
        # the car on the ground beside the trunk (pushAt keeps the car's own height otherwise, and a low collider is height-gated)
        pushes = page.evaluate("(ts) => ts.map(([x, z]) => window.__mm.pushAt(x + 0.5, z, window.__mm.probe(x, z).terrain + 0.5))", trees)
        b.close()
    assert len(trees) >= 20, len(trees)
    bad = [(t, d) for t, d in zip(trees, pushes) if abs(d["dx"] - (rc + t[3] - 0.5)) > 0.05 or abs(d["dz"]) > 0.05]
    assert bad == [], bad[:5]


@needs_world
def test_pushAt_aboveTheCrown_passesOver(server):
    """A car in the air above a tree's crown (a jump, a drop into a forest) is not stopped by the trunk below it."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        trees = page.evaluate(ISOLATED_JS, 20)
        out = page.evaluate("""(ts) => ts.map(([x, z, h]) => { const top = window.__mm.probe(x, z).terrain + h;
            return [window.__mm.pushAt(x + 0.5, z, top + 0.5), window.__mm.pushAt(x + 0.5, z, top - 1)]; })""", trees)
        b.close()
    assert len(trees) >= 10, len(trees)
    for t, (above, below) in zip(trees, out):
        assert abs(above["dx"]) < 0.01 and abs(above["dz"]) < 0.01, (t, above)   # above the crown top: passes over
        assert abs(below["dx"]) > 0.05, (t, below)                               # below it: still the trunk


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
    assert r["x"] > x - rt - rc - 1, (r, tree, rc)     # and it really drove up to it (not stalled on a slope)
    assert abs(r["z"] - z) < 0.5, (r, tree)


@needs_world
def test_pushAt_besideAForestTrunk_pushesTheCarOut(server):
    """#211: a forest tree blocks like a scattered tree: a car resting 0.5 m east of its centre is pushed straight east."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        trees = page.evaluate(ISOLATED_FOREST_JS, 50)
        pushes = page.evaluate("(ts) => ts.map(([x, z]) => window.__mm.pushAt(x + 0.5, z, window.__mm.probe(x, z).terrain + 0.5))", trees)
        b.close()
    assert len(trees) >= 20, len(trees)
    bad = [(t, d) for t, d in zip(trees, pushes) if abs(d["dx"] - (rc + t[3] - 0.5)) > 0.05 or abs(d["dz"]) > 0.05]
    assert bad == [], bad[:5]


@needs_world
def test_sim_driveAtAForestTree_stopsInFrontOfTheTrunk(server):
    """#211: full gas straight at a forest tree from 25 m west: the car stops with its circle on the trunk."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        tree = page.evaluate(APPROACH_FOREST_JS, rc)
        assert tree is not None
        x, z, h, rt = tree
        r = page.evaluate(f"() => window.__mm.sim({x - 25}, {z}, 0, 0, 5)")
        b.close()
    assert r["x"] < x - rt - rc + 0.3, (r, tree, rc)
    assert r["x"] > x - rt - rc - 1, (r, tree, rc)
    assert abs(r["z"] - z) < 0.5, (r, tree)


@needs_world
def test_forest_floor_is_slower(server):
    """#211: coasting 1 s from 30 m/s, the forest floor brakes the car far more than open grass."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rc = car_radius(page)
        wood, grass = page.evaluate(FLAT_LINE_JS, [True, rc]), page.evaluate(FLAT_LINE_JS, [False, rc])
        assert wood is not None and grass is not None, (wood, grass)
        in_wood = page.evaluate(f"() => window.__mm.sim({wood[0]}, {wood[1]}, 0, 30, 1, [])")
        on_grass = page.evaluate(f"() => window.__mm.sim({grass[0]}, {grass[1]}, 0, 30, 1, [])")
        b.close()
    assert in_wood["speed"] < 21, in_wood
    assert on_grass["speed"] > 24, on_grass


@needs_world
def test_no_tree_reaches_a_road(server):
    """No tree collider can touch a car whose centre is on a road: trees never block driving. The forest trees (#13)
    count too: the 8 m forest mask can put a fill tree inside a road corridor, only free() keeps it off the asphalt."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        n = page.evaluate("() => [window.__mm.treesOnRoad(), window.__TREES.length + (window.__FOREST || []).length]")
        b.close()
    assert n[1] > 1000 and n[0] == 0, n
