"""The Rhy Fizz's 3D model (assets/fizz.glb): a drinks truck with ten wheels and fairy lights. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_carsel, open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_fizz(page):
    page.evaluate("async () => { await window.__mm.loadVehicle('fizz'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().fizz)")
    wait_frames(page)
    return page.evaluate("() => window.__mm.gltfVehicle('fizz')")   # after the swap: wheels counts the built truck


def test_fizz_model_builds_with_ten_wheels_true_to_size(server):
    """The truck is 11.19 m long with the blinker boxes, 3.08 m high, 3.22 m wide over the stylised tyres (track ±1.37 m); ten
    wheel nodes, the front two steering; two
    head lamp materials (the lamps and the fairy lights) and one tail; its own colours, not a paint material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_fizz(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 22000, stats
    assert abs(size["l"] - 11.19) <= 0.05 and abs(size["h"] - 3.08) <= 0.05 and abs(size["w"] - 3.22) <= 0.05, size
    assert g["wheels"] == 10 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 8, (g, yaw)
    assert g["lamps"]["head"] == 2 and g["lamps"]["tail"] == 1, g
    assert "Fairy" in g["materials"] and g["paintColor"] is None, g
    assert not errors, errors


def test_fizz_fairy_lights_follow_the_lights(server):
    """The fairy lights are a head lamp material (the second of two): L raises the glow of every head lamp material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_fizz(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('fizz').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('fizz').lamps")
        b.close()
    assert on["head"] == 2 and on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors


def test_fizz_picked_in_the_garage_swaps_in_without_paint(server):
    """Picking the truck in the garage builds the model once it has loaded; the paint swatches are off (fixed livery)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_carsel(page)
        page.click('#csgarage button[data-id="fizz"]')
        page.wait_for_function("() => window.__mm.gltfVehicle('fizz').state === 'ready' && window.__mm.gltfVehicle('fizz').wheels === 10", timeout=180000)
        wait_frames(page)
        swatches = page.evaluate("() => [...document.querySelectorAll('#cspaints button')].every(b => b.disabled)")
        b.close()
    assert swatches is True
    assert not errors, errors
