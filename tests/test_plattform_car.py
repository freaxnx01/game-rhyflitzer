"""#567: the car stops at the Plattform Sisslerfeld's core cylinder; on foot the door stays open. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
CORE_R = 1.56   # PLATTFORM.core.r
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 640, "height": 360})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.plattform() && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


# 15 m out on the gap at phi (degrees from facing), aimed at the centre, 8 m/s with W held; 40 chained 0.1 s steps.
# Returns the closest approach to the centre and the end position along the approach axis (+ = the side it came from).
APPROACH = """([phi]) => { const p = window.__mm.plattform(), t = p.facing + phi * Math.PI / 180;
  let x = p.x + 15 * Math.cos(t), z = p.z + 15 * Math.sin(t), th = t + Math.PI, v = 8, minD = 1e9;
  for (let i = 0; i < 40; i++) { const s = window.__mm.sim(x, z, th, v, 0.1, ['KeyW']); x = s.x; z = s.z; th = s.th; v = s.speed;
    minD = Math.min(minD, Math.hypot(x - p.x, z - p.z)); }
  return { minD, along: (x - p.x) * Math.cos(t) + (z - p.z) * Math.sin(t) }; }"""


@needs_world
def test_car_aimed_at_the_centre_stops_at_the_ring(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        runs = {phi: page.evaluate(APPROACH, [phi]) for phi in (0, 120, 240)}   # the door gap and the two back gaps
        b.close()
    assert errors == []
    for phi, r in runs.items():
        assert r["minD"] > CORE_R + 0.5, (phi, r)   # before #567: 0.37-0.40 m, straight past the central post
        assert r["along"] > 0, (phi, r)             # before #567: -2.03 m, stopped only by the far corner post


@needs_world
def test_walker_walks_through_the_door_into_the_core(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = page.evaluate("() => window.__mm.plattform()")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [plat["x"] + 20, plat["z"]])
        page.keyboard.press("z")
        page.wait_for_timeout(300)
        foot = page.evaluate("""() => { const p = window.__mm.plattform(), t = p.facing;
            window.__mm.place(p.x + 2 * Math.cos(t), p.z + 2 * Math.sin(t), t + Math.PI); window.__mm.setFootY(p.base);
            const f = window.__mm.footSim(0.5, ['KeyW']); return { on: f.on, d: Math.hypot(f.x - p.x, f.z - p.z), dy: f.y - p.base }; }""")
        b.close()
    assert errors == []
    assert foot["on"] is True, foot
    assert foot["d"] < 1.0, foot          # inside the ring (1.56 m); measured 0.47 m before and after #567
    assert abs(foot["dy"]) < 0.1, foot
