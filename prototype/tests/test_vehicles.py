"""#5 vehicle table: a golden trace of today's car (must never change) and proof that the table is really read.
Hand-traced layout (world + terrain blocked): no data files needed, seeded RNG, deterministic. Never click Start
before a golden call: once the race runs, the game loop steps the car too."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# hand START = (1882.9, -292.2), heading pi; Smile-Kreisel = W(1435, 450) = (1206.5, -127), island radius 9.5
GOLDEN_JS = """() => { const m = window.__mm, X = 1882.9, Z = -292.2, TH = Math.PI, KX = 1206.5, KZ = -127, pick = r => [r.x, r.z, r.speed];
  return { gas: pick(m.sim(X, Z, TH, 0, 4)), nitro: pick(m.sim(X, Z, TH, 0, 4, ['KeyW', 'KeyN'])), turn: pick(m.sim(X, Z, TH, 15, 2, ['KeyW', 'KeyA'])),
    handbrake: pick(m.sim(X, Z, TH, 15, 2, ['KeyW', 'KeyD', 'ControlLeft'])), coast: pick(m.sim(X, Z, TH, 20, 3, [])),
    brakeReverse: pick(m.sim(X, Z, TH, 10, 4, ['KeyS'])), kreisel: pick(m.sim(KX + 30, KZ, Math.PI, 12, 4)) }; }"""

# [x, z, speed] recorded on main @ 6d29cb8 (unchanged code) -- the refactor must reproduce them to 1e-6
GOLDEN = {
    "gas": [1803.968653733491, -292.2, 31.468025543467167],
    "nitro": [1746.6700469774994, -290.3246922497351, 41.015723512960825],
    "turn": [1882.5171647865836, -267.454153955126, 21.604638849512714],
    "handbrake": [1873.6407168218582, -300.736676160143, 5.796862538598718],
    "coast": [1834.6722120583554, -292.2, 12.614475983585198],
    "brakeReverse": [1916.5585419172364, -292.2, 13.990973001690463],
    "kreisel": [1219.3204826373772, -127, 0.23503098219921587],
}


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 320, "height": 180})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def use_vehicle(page, patch_js):
    """Activate a modified copy of compact; patch_js edits `c`, e.g. "c.drive.top = 30"."""
    page.evaluate(f"() => {{ const c = window.__mm.vehicles().compact; {patch_js}; window.__mm.setVehicle(c); }}")


def test_golden_trace_of_the_compact_car(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        got = page.evaluate(GOLDEN_JS)
        b.close()
    for k, want in GOLDEN.items():
        assert got[k] == pytest.approx(want, abs=1e-6), (k, got[k], want)


def test_set_vehicle_validates_and_round_trips(server):
    """Unknown model and non-circle collision throw (OBB is #6) and leave the active vehicle alone; a plain copy of
    compact drives exactly like the golden trace."""
    bad = """(patch) => { const c = window.__mm.vehicles().compact; c.drive.top = 30; patch(c);
      try { window.__mm.setVehicle(c); return 'no error'; } catch (e) { return e.message; } }"""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        obb = page.evaluate(f"() => ({bad})(c => {{ c.collision = {{ shape: 'obb', hw: 1.2, hd: 6 }}; }})")
        model = page.evaluate(f"() => ({bad})(c => {{ c.model = 'bus'; }})")
        top = page.evaluate("() => window.__mm.vehicle().drive.top")
        use_vehicle(page, "")
        got = page.evaluate(GOLDEN_JS)
        b.close()
    assert "#6" in obb and "obb" in obb, obb
    assert "bus" in model, model
    assert top == 60
    for k, want in GOLDEN.items():
        assert got[k] == pytest.approx(want, abs=1e-6), (k, got[k], want)
