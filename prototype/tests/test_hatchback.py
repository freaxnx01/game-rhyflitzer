"""#236: the Hatchback. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load(page):
    return page.evaluate("async () => { await window.__mm.loadVehicle('hatchback'); return window.__mm.gltfVehicle(); }")


def use_hatchback(page):
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().hatchback)")
    wait_frames(page)


def test_hatchback_builds_with_four_turning_wheels_and_stays_in_budget(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load(page)
        use_hatchback(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["meshes"] <= 24 and stats["triangles"] <= 25000, stats
    assert abs(size["l"] - 4.46) <= 0.03, size
    assert g["wheels"] == 4, g
    assert not any("mazda" in m.lower() for m in g["materials"]), g["materials"]
    assert len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, yaw
    assert not errors, errors


def test_hatchback_paint_swatch_recolours_the_body(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load(page)
        use_hatchback(page)
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=120000)
        page.evaluate("() => window.__mm.carsel()")
        page.click('#cspaints button[data-paint="ice"]')
        wait_frames(page)
        g = page.evaluate("() => window.__mm.gltfVehicle()")
        compact = page.evaluate("() => window.__mm.carMats().body.color")
        b.close()
    assert g["paintColor"] == "#7fd1ff", g
    assert compact == "#7fd1ff", compact
    assert not errors, errors
