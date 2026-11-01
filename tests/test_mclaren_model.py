"""The Rhy Papaya's 3D model (assets/mclaren.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_carsel, open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_mclaren(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('mclaren'); return window.__mm.gltfVehicle('mclaren'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().mclaren)")
    wait_frames(page)
    return g


def test_mclaren_model_builds_with_four_turning_wheels_true_to_size(server):
    """The model is 4.58 m long, 1.18 m high and 2.14 m wide (mirrors); four wheel nodes; one head and one tail lamp material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_mclaren(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 29000, stats
    assert abs(size["l"] - 4.58) <= 0.05 and abs(size["h"] - 1.18) <= 0.05 and abs(size["w"] - 2.14) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert not errors, errors


def test_mclaren_model_swaps_in_from_the_url(server):
    """?vehicle=mclaren starts with the compact standing in and swaps the model in when it arrives."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=mclaren")
        page.wait_for_function("() => window.__mm.gltfVehicle('mclaren').state === 'ready' && window.__mm.gltfVehicle('mclaren').wheels === 4", timeout=180000)
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert abs(size["l"] - 4.58) <= 0.05, size
    assert not errors, errors


def test_mclaren_model_lamps_follow_the_lights(server):
    """The head and tail lamps are lamp materials: L raises their emissive level."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_mclaren(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('mclaren').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('mclaren').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors


def test_mclaren_model_takes_the_chosen_paint(server):
    """The body is the paint material: signal (papaya) orange from the factory, and a swatch in the car selection recolours it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=mclaren")
        page.wait_for_function("() => window.__mm.gltfVehicle('mclaren').state === 'ready'", timeout=180000)
        factory = page.evaluate("() => window.__mm.gltfVehicle('mclaren').paintColor")
        open_carsel(page)
        page.click('#cspaints button[data-paint="ice"]')
        wait_frames(page)
        chosen = page.evaluate("() => window.__mm.gltfVehicle('mclaren').paintColor")
        b.close()
    assert factory == "#ff7a1a" and chosen == "#7fd1ff", (factory, chosen)
    assert not errors, errors
