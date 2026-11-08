"""The Rhy Estate's 3D model (assets/estate.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_estate(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('estate'); return window.__mm.gltfVehicle('estate'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().estate)")
    wait_frames(page)
    return g


def test_estate_model_builds_true_to_size_paintable_with_lamps(server):
    """The estate is 4.57 m long and about 2.0 m wide with the mirrors; four wheel nodes, two of them steering; one head and one
    tail lamp material; a paint material that takes the chosen colour."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_estate(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 30000, stats
    assert abs(size["l"] - 4.57) <= 0.05 and abs(size["w"] - 2.01) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert "Paint" in g["materials"] and g["paintColor"], g
    assert not errors, errors


def test_estate_wheels_face_outwards(server):
    """No wheel inside out (the Coupé's right wheels were, #721): every wheel shows the same share of outward faces."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_estate(page)
        facing = page.evaluate("() => window.__mm.wheelFacing()")
        b.close()
    assert len(facing) == 4 and min(facing) > 0.6 and max(facing) - min(facing) < 0.05, facing
    assert not errors, errors


def test_silver_metallic_is_metallic_and_another_paint_takes_it_back(server):
    """Silver metallic brings its own finish (metalness 0.55); navy afterwards gives the body its own finish back."""
    from test_carselect import open_carsel
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_estate(page)
        open_carsel(page)
        page.click("#cspaints button[data-paint=silver]")
        silver = page.evaluate("() => ({ name: document.querySelector('#cspaintname').textContent, body: window.__mm.carMats().body })")
        page.click("#cspaints button[data-paint=navy]")
        navy = page.evaluate("() => window.__mm.carMats().body")
        b.close()
    assert silver["name"] == "Silver metallic" and silver["body"]["metalness"] == 0.55 and silver["body"]["color"] == "#c3c7cc", silver
    assert navy["metalness"] == 0 and navy["color"] == "#1b2d5e", navy
    assert not errors, errors
