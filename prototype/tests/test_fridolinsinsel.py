"""#214: the car drives out of the Rhine onto the Fridolinsinsel. Real world + real terrain (tracked in data/).
Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# from the bed 38 m west of the island's shore, heading east (+x) along z = 170; steps of 0.25 s through the hook, until the car is out of the water
DRIVE = """() => { window.__mm.sim(-1262, 170, 0, 0, 0, []);
  for (let i = 0; i < 80; i++) { window.__mm.step(0.25, ['KeyW']); const c = window.__mm.car();
    if (c.water === null) return { t: i * 0.25, x: c.x, z: c.z }; }
  return null; }"""


def test_car_drives_out_of_the_rhine_onto_the_fridolinsinsel(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 480, "height": 270}).new_page()
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.click("#startbtn", timeout=180000)
        out = page.evaluate(DRIVE)
        polys = page.evaluate("() => window.__mm.counts.forest.polys")
        b.close()
    assert out is not None, "the car never left the water: a wall stops it on the bed"
    # measured: the island's west shore (wood polygon edge = water edge) at z=170 is x=-1236.7 in the world data; the car leaves the
    # water on the first 0.25 s step past it (x=-1236.6, ~1.1 m per step). The plan's -1235 was a guess 1.6 m inland of the shore.
    assert -1237 < out["x"] < -1230, out      # it came out at the west shore, not the east bank (-1209.9)
    assert polys == len(json.loads(WORLD.read_text(encoding="utf-8"))["forests"]) - 1
