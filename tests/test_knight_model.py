"""The Rhy Knight's 3D model (assets/knight.glb) and its scanner light. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_knight(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('knight'); return window.__mm.gltfVehicle('knight'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().knight)")
    wait_frames(page)
    return g


def test_knight_model_builds_true_to_size_with_lamps_and_a_scanner(server):
    """The coupé is 4.85 m long, 1.25 m high, 2.06 m wide with the mirrors; four wheel nodes, two of them steering; one head and
    one tail lamp material; eight scanner segments; fixed livery (no paint material)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_knight(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        scan = page.evaluate("() => window.__mm.scanner()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 15000, stats
    assert abs(size["l"] - 4.85) <= 0.05 and abs(size["h"] - 1.25) <= 0.05 and abs(size["w"] - 2.06) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert [f"Scan{i}" for i in range(8)] == [m for m in g["materials"] if m.startswith("Scan") and m != "ScanBack"], g
    assert "Paint" not in g["materials"], g
    assert scan is not None and len(scan) == 8, scan
    assert not errors, errors


def test_knight_scanner_sweeps_while_driving(server):
    """Driving along, one segment after another is the brightest: the light reaches both ends of the strip."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_knight(page)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        brightest = page.evaluate("""() => { const seen = new Set(); for (let i = 0; i < 100; i++) { window.__mm.driveSim(1 / 60); const s = window.__mm.scanner(); seen.add(s.indexOf(Math.max(...s))); } return [...seen].sort((a, b) => a - b); }""")
        b.close()
    assert brightest[0] == 0 and brightest[-1] == 7 and len(brightest) >= 6, brightest
    assert not errors, errors
