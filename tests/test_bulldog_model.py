"""The Rhy Bulldog's 3D model (assets/bulldog.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_carsel, open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_bulldog(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('bulldog'); return window.__mm.gltfVehicle('bulldog'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().bulldog)")
    wait_frames(page)
    return g


def test_bulldog_model_builds_with_four_turning_wheels_true_to_size(server):
    """The Caprice is 5.4 m long, 5.58 m from the push bar to the tail lamps; 1.57 m high to the tip of the aerial, 1.99 m
    wide with the mirrors; four wheel nodes; one head and one tail lamp material; the flame livery, not a paint material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_bulldog(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 20000, stats
    assert abs(size["l"] - 5.58) <= 0.05 and abs(size["h"] - 1.57) <= 0.05 and abs(size["w"] - 1.99) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert "Livery" in g["materials"] and g["paintColor"] is None, g
    assert not errors, errors


def test_bulldog_picked_in_the_garage_swaps_in_without_paint(server):
    """Picking the Bulldog in the garage builds the model once it has loaded; the paint swatches are off (fixed livery)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_carsel(page)
        page.click('#csgarage button[data-id="bulldog"]')
        page.wait_for_function("() => window.__mm.gltfVehicle('bulldog').state === 'ready' && window.__mm.gltfVehicle('bulldog').wheels === 4", timeout=180000)
        wait_frames(page)
        size = page.evaluate("() => window.__mm.carSize()")
        swatches = page.evaluate("() => [...document.querySelectorAll('#cspaints button')].every(b => b.disabled)")
        b.close()
    assert abs(size["l"] - 5.58) <= 0.05, size
    assert swatches is True
    assert not errors, errors


def test_bulldog_model_lamps_follow_the_lights(server):
    """The head lamps and the added tail lamps are lamp materials: L raises their emissive level."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_bulldog(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('bulldog').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('bulldog').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors
