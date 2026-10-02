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


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames. The camera and the HUD are only written inside the loop, and
    a headless renderer can draw slower than 1 fps -- a fixed wait_for_timeout then reads the state from before the
    swap. The counter rides on requestAnimationFrame, registered after the game's loop, so it ticks after it."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=120000)


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


def test_table_top_speed_is_used(server):
    """top 30 instead of 60: the same 4 s on the gas end clearly slower (flat-road estimate 21.9 m/s, compact 31.47)."""
    gas = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 0, 4).speed"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        fast = page.evaluate(gas)
        use_vehicle(page, "c.drive.top = 30")
        slow = page.evaluate(gas)
        table_top = page.evaluate("() => window.__mm.vehicles().compact.drive.top")
        b.close()
    assert fast == pytest.approx(GOLDEN["gas"][2], abs=1e-6)
    assert 18 < slow < 24, slow
    assert table_top == 60          # the hook hands out a copy; the table itself is untouched


def test_table_collision_radius_scales(server):
    """A standing car 11.8 m from the island centre (island 9.5): compact (radius 1.69) is free; at scale 2
    (radius 2.6) it is pushed out to 12.1 m."""
    stand = "() => { const r = window.__mm.sim(1218.3, -127, Math.PI / 2, 0, 0.1, []); return Math.hypot(r.x - 1206.5, r.z + 127); }"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        small = page.evaluate(stand)
        use_vehicle(page, "c.scale = 2")
        big = page.evaluate(stand)
        b.close()
    assert small == pytest.approx(11.8, abs=0.01), small
    assert big == pytest.approx(12.1, abs=0.01), big


def test_table_mass_softens_the_crash(server):
    """Coasting head-on into the island at 15 m/s: the heavier car keeps clearly more speed after the hit."""
    crash = "() => window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, []).speed"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        light = page.evaluate(crash)
        use_vehicle(page, "c.mass = 2")
        heavy = page.evaluate(crash)
        b.close()
    assert light == pytest.approx(2.074, abs=0.005), light      # recorded on main @ 6d29cb8
    assert heavy > light * 1.15, (light, heavy)


def test_table_cockpit_eye_is_used(server):
    """Cockpit view, car at START heading pi (forward = -x, right = -z): the camera sits at the scaled eye.
    compact eye (-0.25, 1.22, -0.38) * 1.3; a moved eye (0.5, 1.5, -0.38) * 1.3. The swap mid-race keeps the car hidden."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn", timeout=180000)
        page.keyboard.press("KeyC"); page.keyboard.press("KeyC"); wait_frames(page)
        before = page.evaluate("() => window.__mm.cam()")
        use_vehicle(page, "c.camera.cockpit.eye = [0.5, 1.5, -0.38]"); wait_frames(page)
        after = page.evaluate("() => window.__mm.cam()")
        visible = page.evaluate("() => window.__mm.hud().carVisible")
        b.close()
    assert before["view"] == 2 and after["view"] == 2
    assert before["d"] == pytest.approx([0.325, 1.586, 0.494], abs=1e-3), before
    assert after["d"] == pytest.approx([-0.65, 1.95, 0.494], abs=1e-3), after
    assert visible is False


def test_table_gears_drive_the_hud(server):
    """20 m/s = 72 km/h: 3rd gear with compact's table, 1st with a long first gear. The HUD reads the vehicle's table."""
    roll = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 20, 0.02, [])"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(roll); wait_frames(page)
        compact = page.inner_text("#gearn")
        use_vehicle(page, "c.sound.gears = [0, 100, 200, 300, 400, 500, 999]")
        page.evaluate(roll); wait_frames(page)
        long_first = page.inner_text("#gearn")
        b.close()
    assert (compact, long_first) == ("3", "1")


def test_rebuilds_free_gpu_memory(server):
    """Review #32: each setVehicle rebuild must free its per-build materials and the plate texture. After the first
    rebuild, 5 more rebuilds of the same car (with frames drawn in between, so textures are uploaded) keep the GPU
    texture and geometry counts flat."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        use_vehicle(page, ""); wait_frames(page)
        first = page.evaluate("() => window.__mm.gpu()")
        for _ in range(5):
            use_vehicle(page, ""); wait_frames(page)
        last = page.evaluate("() => window.__mm.gpu()")
        b.close()
    assert first["textures"] > 0, first
    assert last["textures"] <= first["textures"], (first, last)
    assert last["geometries"] <= first["geometries"], (first, last)
