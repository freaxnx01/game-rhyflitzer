"""#902: from the field north of the Plattform Sisslerfeld onto the Geuerenstrasse the car is not launched.
Measured terrain only. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

DATA = Path(__file__).parents[1] / "data"
pytestmark = pytest.mark.skipif(not ((DATA / "world_hochrhein.json").exists() and (DATA / "terrain_hochrhein.mmh").exists()),
                                reason="run pipeline/osm.py build and terrain.py first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# world angle of the start point from the tower (270 = north, the field), start speed; before #902: 6.3-14.5 m above ground
RUNS = [(240, 20), (270, 10), (270, 20), (300, 15), (330, 20)]
DRIVE = """([a, v]) => { const p = window.__mm.plattform(), t = a * Math.PI / 180;
  window.__mm.resetCar && window.__mm.resetCar();
  window.__mm.sim(p.x + 30 * Math.cos(t), p.z + 30 * Math.sin(t), t + Math.PI + 0.12, v, 1 / 60, ['KeyW']);
  let top = 0;
  for (let i = 0; i < 150; i++) { window.__mm.step(1 / 60, ['KeyW']); const c = window.__mm.car();
    top = Math.max(top, c.y - c.ground); if (Math.hypot(c.x - p.x, c.z - p.z) < 3) break; }
  return top; }"""


def test_car_from_the_field_is_not_launched_at_the_road_edge(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 320, "height": 180})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.plattform() && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.wait_for_selector("#mmhstatus.real", timeout=240000)   # the coarse fallback terrain does not reproduce the bug (test_bridge_ends pattern)
        page.click("#startbtn")
        tops = {run: page.evaluate(DRIVE, list(run)) for run in RUNS}
        b.close()
    assert errors == []
    for run, top in tops.items():
        assert top < 0.5, (run, top)
