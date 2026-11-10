"""#477: grass shows through the 6c porch and stair-hall floor. The EG is the terrain at the door, so the ground slabs lie within
centimetres of the grass (never above the slab, but 0 to 3 cm below it: a plain depth test z-fights). The slabs are drawn with a
polygon offset that pulls them in front. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_enter_6c import key, needs_world, open_world

FOOTPRINT = """() => { const i = window.__mm.interior(), e = i.entrance, d = i.porch.d, th = e.th, c = Math.cos(th), s = Math.sin(th);
  const ox = e.x + c * d, oz = e.z + s * d, eg = i.levels[0]; let worst = -Infinity, n = 0;
  for (let a = -d; a <= 4.85; a += 0.25) for (let b = -1.35; b <= 2.65; b += 0.25) {
    const x = ox + c * a - s * b, z = oz + s * a + c * b, hit = window.__mm.rayHits(x, z).grass;
    worst = Math.max(worst, Math.max(window.__mm.probe(x, z).terrain, hit ?? -Infinity) - eg); n++; }
  return { worst, n }; }"""


@needs_world
def test_ground_slabs_stay_above_the_grass_and_are_drawn_in_front(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        page.wait_for_function("() => window.__mm.interior().built", timeout=120000)   # the build needs one rendered frame (stepInterior)
        info = page.evaluate("() => window.__mm.interior()")
        foot = page.evaluate(FOOTPRINT)
        b.close()
    assert errors == []
    assert foot["n"] > 100 and foot["worst"] <= 0.005, foot                  # terrain and drawn grass nowhere above the slab top
    assert info["groundSlab"]["meshes"] == 1 and info["groundSlab"]["offset"] < 0, info["groundSlab"]
