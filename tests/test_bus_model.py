"""#478: the Regional Bus's real 3D model (assets/bus.glb). Slow (Playwright): run in the foreground."""
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


def test_bus_is_yellow_outside_and_has_a_floor_inside(server):
    """#723 drew the dark interior lining (Plain_7) from both sides to close the floor; it also lines walls and roof, so from
    outside it covered the yellow body. Now a ray onto the flank hits the Body, and a ray down in the cabin hits the floor copy."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_bus(page)
        flank = page.evaluate("() => window.__mm.carRay([0, 0.7, 4], [0, 0, -1])")
        floor = page.evaluate("() => window.__mm.carRay([0.5, 2.2, 0], [0, -1, 0])")
        b.close()
    assert flank and [h["material"] for h in flank if h["d"] < flank[0]["d"] + 0.01] == ["Body"], flank   # nothing drawn on top of the paint
    assert floor and floor[0]["material"] == "Plain_7" and 0.1 < floor[0]["y"] < 0.5, floor
    assert not errors, errors


def test_bus_wheels_are_covered_from_inside_the_cabin(server):
    """#758: the wheel arches face the wheel, so from the cabin they were culled and the wheels showed through the windscreen.
    Rays from inside the cabin at each wheel meet an arch cover (Plain_7) before the tyre (Plain_0); the flank still shows Body only."""
    shots = {"front down": ([3.36, 2.2, 1.0], [0, -1, 0]), "rear down": ([-2.66, 2.2, 0.85], [0, -1, 0]),
             "front down left": ([3.36, 2.2, -1.0], [0, -1, 0]),
             "front side": ([3.36, 0.7, 0], [0, 0, 1]), "rear side": ([-2.66, 0.7, 0], [0, 0, 1]),
             "from the windscreen": ([5.5, 1.6, 0.4], [-2.14, -1.1, 0.72])}
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_bus(page)
        hits = {k: page.evaluate("([f, d]) => window.__mm.carRay(f, d)", [f, d]) for k, (f, d) in shots.items()}
        flank = page.evaluate("() => window.__mm.carRay([0, 0.7, 4], [0, 0, -1])")
        b.close()
    for name, h in hits.items():
        assert h and h[0]["material"] == "Plain_7", (name, h)   # a cover first, not the tyre
    assert flank and [h["material"] for h in flank if h["d"] < flank[0]["d"] + 0.01] == ["Body"], flank
    assert not errors, errors
