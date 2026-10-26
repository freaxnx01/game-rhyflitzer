"""#478: the Regional Bus's real 3D model (prototype/assets/bus.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_bus(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('bus'); return window.__mm.gltfVehicle('bus'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().bus)")
    wait_frames(page)
    return g


def test_bus_model_builds_with_four_turning_wheels_true_to_size(server):
    """The model is 12.2 m long with its mirrors, 2.90 m to the roof, about 3.1 m wide over the mirrors; lamps are lightable;
    the wheels sit where the primitives bus has them (front axle x 3.4, rear -2.68)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_bus(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 45000, stats
    assert abs(size["l"] - 12.22) <= 0.08 and abs(size["h"] - 2.90) <= 0.05 and abs(size["w"] - 3.11) <= 0.1, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert not errors, errors


def test_bus_model_swaps_in_from_the_url(server):
    """?vehicle=bus starts with the primitives bus (3.05 m with its roof unit) and swaps the model (2.90 m) in when it arrives."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=bus")
        page.wait_for_function("() => window.__mm.gltfVehicle('bus').state === 'ready' && window.__mm.gltfVehicle('bus').wheels === 4", timeout=180000)
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert abs(size["h"] - 2.90) <= 0.05, size
    assert not errors, errors


def test_bus_model_lamps_follow_the_lights(server):
    """The model's head and tail lenses are lamp materials: L raises their emissive level like the Hatchback's."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_bus(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('bus').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('bus').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors
