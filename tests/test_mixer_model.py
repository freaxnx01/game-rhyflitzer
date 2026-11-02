"""The Rhy Mixer's 3D model (assets/mixer.glb): six wheels and a turning drum. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_carsel, open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_mixer(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('mixer'); return window.__mm.gltfVehicle('mixer'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().mixer)")
    wait_frames(page)
    return g


def test_mixer_model_builds_with_six_wheels_true_to_size(server):
    """The truck is 7.23 m long, 3.39 m high to the top of the drum, 2.92 m wide with the mirrors; six wheel nodes, the front
    two steering; one head and one tail lamp material; the cab and drum livery, not a paint material."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_mixer(page)
        g = page.evaluate("() => window.__mm.gltfVehicle('mixer')")   # after the swap: wheels counts the built car
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 38000, stats
    assert abs(size["l"] - 7.23) <= 0.05 and abs(size["h"] - 3.39) <= 0.05 and abs(size["w"] - 2.92) <= 0.06, size
    assert g["wheels"] == 6 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 4, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert "Cab" in g["materials"] and "Drum" in g["materials"] and g["paintColor"] is None, g
    assert not errors, errors


def test_mixer_drum_turns_while_driving_and_the_tandem_wheels_roll(server):
    """The drum turns about its axis all the time (1 rad/s); driving rolls all six wheels and the truck stays on its wheels."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_mixer(page)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        before = page.evaluate("() => window.__mm.spin()")
        drive = page.evaluate("() => window.__mm.driveSim(2, ['KeyW'])")
        after = page.evaluate("() => window.__mm.spin()")
        b.close()
    assert [s["node"] for s in after] == ["drum"], after
    assert after[0]["turned"] - before[0]["turned"] >= 1.9, (before, after)
    assert drive["speed"] > 3 and drive["worst"] > -0.05, drive
    assert not errors, errors


def test_mixer_picked_in_the_garage_swaps_in_without_paint(server):
    """Picking the mixer in the garage builds the model once it has loaded; the paint swatches are off (fixed livery)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_carsel(page)
        page.click('#csgarage button[data-id="mixer"]')
        page.wait_for_function("() => window.__mm.gltfVehicle('mixer').state === 'ready' && window.__mm.gltfVehicle('mixer').wheels === 6", timeout=180000)
        wait_frames(page)
        swatches = page.evaluate("() => [...document.querySelectorAll('#cspaints button')].every(b => b.disabled)")
        b.close()
    assert swatches is True
    assert not errors, errors
