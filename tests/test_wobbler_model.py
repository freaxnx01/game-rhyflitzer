"""The Rhy Wobbler's 3D model (assets/wobbler.glb) and its tip-over in a fast corner. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_carsel, open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_wobbler(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('wobbler'); return window.__mm.gltfVehicle('wobbler'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().wobbler)")
    wait_frames(page)
    return g


def test_wobbler_model_builds_with_three_wheels_true_to_size(server):
    """The van is 3.33 m long, 1.36 m high, 1.56 m wide with the wing mirror; the front wheel is two halves on one centre
    (wheel_FL, wheel_FR at z 0), so four wheel nodes, two of them steering; one head and one tail lamp material; paintable."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_wobbler(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 28000, stats
    assert abs(size["l"] - 3.33) <= 0.05 and abs(size["h"] - 1.36) <= 0.05 and abs(size["w"] - 1.56) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert "Paint" in g["materials"], g
    assert not errors, errors


def test_wobbler_model_takes_the_chosen_paint(server):
    """The body is the paint material: sunflower yellow from the factory, and a swatch in the car selection recolours it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=wobbler")
        page.wait_for_function("() => window.__mm.gltfVehicle('wobbler').state === 'ready'", timeout=180000)
        factory = page.evaluate("() => window.__mm.gltfVehicle('wobbler').paintColor")
        open_carsel(page)
        page.click('#cspaints button[data-paint="meadow"]')
        wait_frames(page)
        chosen = page.evaluate("() => window.__mm.gltfVehicle('wobbler').paintColor")
        b.close()
    assert factory == "#ffc61a" and chosen == "#5f8a4c", (factory, chosen)
    assert not errors, errors


def test_wobbler_tips_over_in_a_fast_corner_and_gets_back_up(server):
    """Full lock at 72 km/h: it falls onto its left side (a right-hand corner), the body raised by the roll over its edge,
    takes 15 % damage on landing, slides to a stop and stands up again; at 40 km/h with the throttle held, the same corner keeps it on its wheels."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_wobbler(page)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        slow = page.evaluate("() => window.__mm.tipSim(11, 2, ['KeyW', 'KeyD'])")
        page.evaluate("() => window.__mm.resetCar()")
        fast = page.evaluate("() => window.__mm.tipSim(20, 1.2, ['KeyD'])")
        later = page.evaluate("() => window.__mm.tipSim(0, 3)")
        toasts = page.evaluate("() => window.__mm.toast ? window.__mm.toast() : null")
        b.close()
    print(slow, fast, later, toasts)
    assert slow["phases"] == ["up"] and slow["dmg"] == 0, slow
    assert "falling" in fast["phases"] and fast["phase"] == "down", fast
    assert abs(fast["roll"] - 1.5708) < 0.1 and fast["lift"] > 0.6, fast
    assert abs(fast["dmg"] - 0.15) < 0.01 and fast["speed"] < 5, fast
    assert later["phase"] == "up" and later["roll"] < 1.6, later
    assert not errors, errors
