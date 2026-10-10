"""#102: the secret hideout in the Hübel -- a tunnel into the hill, a cavern with the Eiffel Tower, found by driving in.
Needs the real world and terrain (the hill is swisstopo's). Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MOUTH_ROAD = (-703.3, 1419.1)          # the Hübel's centre line at the mouth
HEADING = 95 * math.pi / 180
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


def open_page(p, server):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    page.click("#startbtn", timeout=180000)   # heavy real world under SwiftShader: the start overlay can take a while to accept clicks
    return br, page, errors


@needs_world
def test_floor_lid_and_tower(server):
    """The cavern floor is the cut, the lid is the hill 40+ m above it, the tower counts itself, walls and lamps exist."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        assert h is not None
        cx, cz = h["centre"]
        probe = page.evaluate(f"() => window.__mm.probe({cx}, {cz})")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        roofed_mouth = page.evaluate(f"() => window.__mm.roofed({h['mouth'][0]}, {h['mouth'][1]})")
        counts = page.evaluate("() => window.__mm.counts")
        # inward from outside the hill at 2 m over the cavern floor: the first thing is the ring wall's outer face.
        # The target must sit inside the disc, where terrainH is the floor -- the hook takes `up` over the target.
        wall = page.evaluate(f"() => window.__mm.wallRoleAt({cx + 40}, {cz}, {cx + 21}, {cz}, 2)")
        tower = page.evaluate(f"() => window.__mm.wallRoleAt({cx - 20}, {cz}, {cx}, {cz}, 5.4)")
        br.close()
    assert errors == []
    assert 8 <= h["portalS"] <= 20, h
    assert abs(probe["terrain"] - h["floor"]) < 0.3, (probe, h)
    assert h["lid"] - h["floor"] >= 40, h
    assert sky >= h["lid"], (sky, h)
    assert roofed_mouth is False
    assert h["lidTris"] > 0 and h["walls"] >= 24 and h["lamps"] == 4, h
    assert counts["eiffel"] == 1
    assert h["found"] is False
    assert wall == "stone", wall
    assert tower == "dome", tower


def jump_list(page):
    page.keyboard.press("KeyJ")
    page.wait_for_function("() => !document.getElementById('jump').hidden")
    names = [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
    page.keyboard.press("Escape")
    page.wait_for_function("() => document.getElementById('jump').hidden")
    return names


@needs_world
def test_drive_in_finds_the_hideout(server):
    """Not listed before; drive from the Hübel into the hill: the car ends on the cavern floor, the find is toasted and
    remembered, J lists the Eiffelturm, and the chase camera stays under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        assert "Eiffelturm" not in jump_list(page)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        # gas held for 8 s: ~105 m down the tunnel, so the car comes to rest inside the cavern
        r = page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 8, ['KeyW'])")
        found = page.evaluate("() => window.__mm.hideout().found")
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        toast = page.evaluate("() => window.__mm.toast()")
        names = jump_list(page)
        lid = page.evaluate(f"() => window.__mm.lidAt({r['x']}, {r['z']})")
        # wait for arrival, not stillness (CLAUDE.md): the chase cam lerps in from the start screen at ~1 fps under SwiftShader
        page.wait_for_function(f"() => {{ const c = window.__mm.cam(), car = window.__mm.car(); return car.y + c.d[1] < {lid} && c.d[1] > 0; }}", timeout=120000)
        br.close()
    assert errors == []
    assert math.hypot(r["x"] - cx, r["z"] - cz) < 23, (r, h)
    assert abs(r["y"] - h["floor"]) < 1.0, (r, h)
    assert found is True and stored == "1"
    assert toast["shown"] and ("Hideout found" in toast["text"] or "Versteck gefunden" in toast["text"]), toast
    assert "Eiffelturm" in names
    assert lid is not None and lid - h["floor"] > 40, (lid, h)


@needs_world
def test_sky_ground_and_no_takeoff_inside(server):
    """The helicopter sees the hill over the cavern, and F inside the hideout is refused with a toast."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 8, ['KeyW'])")
        page.keyboard.press("KeyF")
        page.wait_for_timeout(500)
        toast = page.evaluate("() => window.__mm.toast().text")
        car = page.evaluate("() => window.__mm.car()")
        flying = page.evaluate("() => window.__mm.fly().on")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        br.close()
    assert errors == []
    assert "sky" in toast or "Himmel" in toast, toast
    assert flying is False
    assert abs(car["y"] - h["floor"]) < 1.0, car
    assert sky >= h["lid"], (sky, h)


CROSS_JS = """([x, z, th, secs]) => {
  window.__mm.sim(x, z, th, 10, 0.05, ['KeyW']);
  const out = { roofed: 0, minAboveLid: Infinity, path: [] };
  for (let i = 0; i < secs * 10; i++) {
    const c = window.__mm.step(0.1, ['KeyW']), lid = window.__mm.lidAt(c.x, c.z);
    out.path.push([+c.x.toFixed(1), +c.z.toFixed(1), +c.y.toFixed(1)]);
    if (lid !== null) { out.roofed++; out.minAboveLid = Math.min(out.minAboveLid, c.y - lid); }
  }
  out.found = window.__mm.hideout().found;
  return out;
}"""


def across(page, s, off, secs):
    """Start `off` metres to the side of the axis at `s` metres in, on the hilltop, and drive straight across the axis."""
    ux, uz = math.cos(HEADING), math.sin(HEADING)
    mx, mz = -703.7 + ux * s, 1423.6 + uz * s
    x, z = mx - uz * off, mz + ux * off            # off the axis on its left (normal (-uz, ux))
    th = math.atan2(-ux, uz)                       # facing (uz, -ux): back across the axis to the right
    return page.evaluate(CROSS_JS, [x, z, th, secs])


@needs_world
def test_hill_is_solid_over_the_tunnel_and_the_cavern(server):
    """The review's drive: sideways across the hill at s = 40 and s = 70, and over the cavern. The car stays on the hill,
    never under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        runs = {s: across(page, s, 18, 4) for s in (40, 70)}
        cavern = across(page, 105, 40, 8)
        br.close()
    assert errors == []
    for s, r in runs.items():
        assert r["roofed"] > 0, (s, r["path"])
        assert r["minAboveLid"] > 0, (s, r["minAboveLid"], r["path"])
    assert cavern["roofed"] > 0, cavern["path"]
    assert cavern["minAboveLid"] > 0, (cavern["minAboveLid"], cavern["path"])



FOOTPRINT_JS = """() => window.__mm.hideoutRing().map(r => {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), out = [];
  for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) for (const b of [-0.5, 0, 0.5]) {
    const la = a * (r.len - 0.1), lb = b * (r.wall - 0.1), x = r.x + c * la - s * lb, z = r.z + s * la + c * lb;
    const top = window.__mm.topAt(x, z), hill = window.__mm.skyGround(x, z);
    out.push({ x: +x.toFixed(2), z: +z.toFixed(2), role: top && top.role, y: top && top.y, hill });
  }
  return out;
})"""


@needs_world
def test_ring_wall_stays_under_the_hill(server):
    """From the sky, every point over the 24 ring-wall blocks hits the hill's grass at the hill's height: no stone pokes out."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        blocks = page.evaluate(FOOTPRINT_JS)
        br.close()
    assert errors == []
    assert len(blocks) == 24
    bad = [pt for blk in blocks for pt in blk if pt["role"] != "grass" or abs(pt["y"] - pt["hill"]) > 0.05]
    assert bad == [], (len(bad), bad[:6])
