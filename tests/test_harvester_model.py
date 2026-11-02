"""The Rhy Harvester's 3D model (assets/harvester.glb): a combine with a turning reel. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_carsel, open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_harvester(page):
    page.evaluate("async () => { await window.__mm.loadVehicle('harvester'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().harvester)")
    wait_frames(page)
    return page.evaluate("() => window.__mm.gltfVehicle('harvester')")   # after the swap: wheels counts the built machine


def test_harvester_model_builds_true_to_size(server):
    """11.7 m long with the unloading auger, 9.9 m wide over the header, 4.44 m high; four wheel nodes, the front two steering;
    the cab's lamp strips as a head lamp material; a paint material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_harvester(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    print(g, stats, size)
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 38000, stats
    assert abs(size["l"] - 11.7) <= 0.1 and abs(size["h"] - 4.44) <= 0.05 and abs(size["w"] - 9.87) <= 0.05, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1, g
    assert "Paint" in g["materials"], g
    assert not errors, errors


def test_harvester_reel_turns_while_driving(server):
    """The reel turns about its axis all the time (backwards, 1.6 rad/s); the machine drives off."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_harvester(page)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        before = page.evaluate("() => window.__mm.spin()")
        drive = page.evaluate("() => window.__mm.driveSim(2, ['KeyW'])")
        after = page.evaluate("() => window.__mm.spin()")
        b.close()
    assert [s["node"] for s in after] == ["reel"], after
    assert after[0]["turned"] - before[0]["turned"] <= -3.1, (before, after)
    assert drive["speed"] > 2, drive
    assert not errors, errors


def test_harvester_takes_the_chosen_paint(server):
    """The body is the paint material: meadow green from the factory, and a swatch in the car selection recolours it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=harvester")
        page.wait_for_function("() => window.__mm.gltfVehicle('harvester').state === 'ready'", timeout=180000)
        factory = page.evaluate("() => window.__mm.gltfVehicle('harvester').paintColor")
        open_carsel(page)
        page.click('#cspaints button[data-paint="sunflower"]')
        wait_frames(page)
        chosen = page.evaluate("() => window.__mm.gltfVehicle('harvester').paintColor")
        b.close()
    assert factory == "#5f8a4c" and chosen == "#ffc61a", (factory, chosen)
    assert not errors, errors
