"""#831: the Rhy Gullwing's real 3D model (assets/delorean.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"
DOORS_JS = "() => window.__mm.doors()"


def load_delorean(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('delorean'); return window.__mm.gltfVehicle('delorean'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().delorean)")
    wait_frames(page)
    return g


def test_delorean_model_builds_true_to_size_with_lamps_and_doors(server):
    """4.26 m long and 1.18 m to the roof; 1.78 m wide, not the stand-in's 2.0 m: the model has no door mirrors, and the
    DMC-12's body is 1.86 m over the sills. Eight plain materials, none of them paint (the steel is not paintable)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_delorean(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        doors = page.evaluate(DOORS_JS)
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 15000, stats
    assert len(g["materials"]) <= 8 and "Paint" not in g["materials"], g
    assert abs(size["l"] - 4.26) <= 0.05 and abs(size["h"] - 1.18) <= 0.05 and abs(size["w"] - 1.78) <= 0.08, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert len(doors["panelY"]) == 2, doors
    assert not errors, errors


def test_delorean_model_doors_open_on_the_start_screen_and_close_for_the_run(server):
    """#126's door test, on the model: both door nodes swing up about their hinge on the roof spine and Start shuts them."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_delorean(page)
        page.wait_for_function("() => window.__mm.doors().open > 0.95", timeout=120000)
        opened = page.evaluate(DOORS_JS)
        page.click("#startbtn", timeout=180000)
        page.wait_for_function("() => window.__mm.doors().open < 0.05", timeout=120000)
        closed = page.evaluate(DOORS_JS)
        b.close()
    assert len(opened["panelY"]) == 2 and len(closed["panelY"]) == 2, (opened, closed)
    for up, down in zip(opened["panelY"], closed["panelY"]):
        assert up > down + 0.3, (opened, closed)
    assert not errors, errors


def test_delorean_model_swaps_in_from_the_url(server):
    """?vehicle=delorean starts with the primitives car and swaps the model in when it arrives."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=delorean")
        page.wait_for_function("() => window.__mm.gltfVehicle('delorean').state === 'ready' && window.__mm.gltfVehicle('delorean').wheels === 4", timeout=180000)
        model = page.evaluate("() => window.__mm.vehicle().model")
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert model == "delorean", model
    assert abs(size["l"] - 4.26) <= 0.05, size
    assert not errors, errors


def test_delorean_model_lamps_follow_the_lights(server):
    """The model's head and tail lenses are lamp materials: L raises their emissive level like the Little Classic's."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_delorean(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('delorean').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('delorean').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"] and on["tailLevel"] > off["tailLevel"], (off, on)
    assert not errors, errors
