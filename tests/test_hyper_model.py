"""The Rhy Hyper's 3D model (assets/hyper.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_carsel, open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_hyper(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('hyper'); return window.__mm.gltfVehicle('hyper'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().hyper)")
    wait_frames(page)
    return g


def test_hyper_model_builds_with_four_turning_wheels_true_to_size(server):
    """The model is 4.51 m long, 1.21 m high and 2.22 m wide (mirrors); four wheel nodes; one head and one tail lamp material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_hyper(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 32000, stats
    assert abs(size["l"] - 4.51) <= 0.05 and abs(size["h"] - 1.21) <= 0.05 and abs(size["w"] - 2.22) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert not errors, errors


def test_hyper_model_swaps_in_from_the_url(server):
    """?vehicle=hyper starts with the compact standing in and swaps the model in when it arrives."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=hyper")
        page.wait_for_function("() => window.__mm.gltfVehicle('hyper').state === 'ready' && window.__mm.gltfVehicle('hyper').wheels === 4", timeout=180000)
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert abs(size["l"] - 4.51) <= 0.05, size
    assert not errors, errors


def test_hyper_model_lamps_follow_the_lights(server):
    """The head and tail lamps are lamp materials: L raises their emissive level."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_hyper(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('hyper').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('hyper').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors


def test_hyper_model_takes_the_chosen_paint(server):
    """The body is the paint material: racing blue from the factory, and a swatch in the car selection recolours it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=hyper")
        page.wait_for_function("() => window.__mm.gltfVehicle('hyper').state === 'ready'", timeout=180000)
        factory = page.evaluate("() => window.__mm.gltfVehicle('hyper').paintColor")
        open_carsel(page)
        page.click('#cspaints button[data-paint="ice"]')
        wait_frames(page)
        chosen = page.evaluate("() => window.__mm.gltfVehicle('hyper').paintColor")
        b.close()
    assert factory == "#2266dd" and chosen == "#7fd1ff", (factory, chosen)
    assert not errors, errors
