"""#521: the Tin Lizzie's 3D model (assets/modelt.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_modelt(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('modelt'); return window.__mm.gltfVehicle('modelt'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().modelt)")
    wait_frames(page)
    return g


def test_modelt_model_builds_with_four_turning_wheels_true_to_size(server):
    """The model is 3.41 m long, 1.98 m to the top of the hood and 1.43 m wide; four wheel nodes; one head and one tail lamp material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_modelt(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 32000, stats
    assert abs(size["l"] - 3.41) <= 0.05 and abs(size["h"] - 1.98) <= 0.05 and abs(size["w"] - 1.43) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert not errors, errors


def test_modelt_model_swaps_in_from_the_url(server):
    """?vehicle=modelt starts with the compact standing in and swaps the model in when it arrives."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=modelt")
        page.wait_for_function("() => window.__mm.gltfVehicle('modelt').state === 'ready' && window.__mm.gltfVehicle('modelt').wheels === 4", timeout=180000)
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert abs(size["l"] - 3.41) <= 0.05, size
    assert not errors, errors


def test_modelt_model_lamps_follow_the_lights(server):
    """The head lamps and the added tail lamp are lamp materials: L raises their emissive level."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_modelt(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('modelt').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('modelt').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors
