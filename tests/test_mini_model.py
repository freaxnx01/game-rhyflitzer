"""#468: the Little Classic's real 3D model (assets/mini.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, open_carsel, wait_frames

STATS_JS = "() => window.__mm.carStats()"
CHAIR_ON = '{"id":"mini","paint":"navy","chair":true}'


def load_mini(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('mini'); return window.__mm.gltfVehicle('mini'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().mini)")
    wait_frames(page)
    return g


def test_mini_model_builds_with_four_turning_wheels_true_to_size(server):
    """The model is 3.05 m long and 1.30 m to the roof, about 1.59 m wide with its one door mirror; lamps are lightable."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_mini(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 12000, stats
    assert abs(size["l"] - 3.05) <= 0.05 and abs(size["h"] - 1.30) <= 0.05 and abs(size["w"] - 1.59) <= 0.08, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert not errors, errors


def test_mini_model_swaps_in_from_the_url_and_keeps_the_armchair(server):
    """?vehicle=mini starts with the primitives car and swaps the model in when it arrives; the chair rides on its roof."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, stored=CHAIR_ON, query="?vehicle=mini")
        page.wait_for_function("() => window.__mm.gltfVehicle('mini').state === 'ready' && window.__mm.gltfVehicle('mini').wheels === 4", timeout=180000)
        chair = page.evaluate("() => window.__mm.chair()")
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert chair["on"] and chair["visible"], chair
    assert abs(size["h"] - 1.30) <= 0.05, size   # the chair is not measured
    assert not errors, errors


def test_mini_model_lamps_follow_the_lights(server):
    """The model's head and tail lenses are lamp materials: L raises their emissive level like the Hatchback's."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_mini(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('mini').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('mini').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors


def test_mini_picked_in_the_garage_shows_no_primitives_before_the_model(server):
    """Stepping onto the Mini in the garage keeps the stage car until mini.glb is ready, then builds the model: the
    primitives stand-in is never built while the file is still loading (it was, as a low-poly flash before the model)."""
    record = """() => { const seen = window.__seen = []; const tick = () => { const m = window.__mm.vehicle().model, s = window.__mm.gltfVehicle('mini').state;
        const last = seen[seen.length - 1]; if (!last || last[0] !== m || last[1] !== s) seen.push([m, s]); requestAnimationFrame(tick); }; tick(); }"""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_carsel(page)
        page.evaluate(record)
        page.click('#csgarage button[data-id="mini"]')
        page.wait_for_function("() => window.__mm.gltfVehicle('mini').state === 'ready' && window.__mm.gltfVehicle('mini').wheels === 4", timeout=180000)
        wait_frames(page)
        seen = page.evaluate("() => window.__seen")
        b.close()
    assert not [s for s in seen if s[0] == "mini" and s[1] != "ready"], seen
    assert seen[-1] == ["mini", "ready"], seen
    assert not errors, errors
