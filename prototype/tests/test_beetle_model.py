"""The Ladybug's 3D model (prototype/assets/beetle.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_beetle(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('beetle'); return window.__mm.gltfVehicle('beetle'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().beetle)")
    wait_frames(page)
    return g


def test_beetle_model_builds_with_four_turning_wheels_true_to_size(server):
    """The model is 3.81 m long, 1.48 m high and 1.62 m wide; four wheel nodes; one head and one tail lamp material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_beetle(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 40000, stats
    assert abs(size["l"] - 3.81) <= 0.05 and abs(size["h"] - 1.48) <= 0.05 and abs(size["w"] - 1.62) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert not errors, errors


def test_beetle_model_swaps_in_from_the_url(server):
    """?vehicle=beetle starts with the compact standing in and swaps the model in when it arrives."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=beetle")
        page.wait_for_function("() => window.__mm.gltfVehicle('beetle').state === 'ready' && window.__mm.gltfVehicle('beetle').wheels === 4", timeout=180000)
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert abs(size["l"] - 3.81) <= 0.05, size
    assert not errors, errors


def test_beetle_model_lamps_follow_the_lights(server):
    """The head and tail lamps are lamp materials: L raises their emissive level."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_beetle(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('beetle').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('beetle').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors
