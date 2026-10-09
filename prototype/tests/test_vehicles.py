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

# [x, z, speed] recorded on main @ 6d29cb8 (unchanged code) -- the refactor must reproduce them to 1e-6.
# nitro and kreisel re-recorded for #69 (compact.scale 1.3 -> 1.0, collision radius 1.69 -> 1.3 m): the smaller car
# passes the first obstacle on the nitro straight and bounces off the Kreisel island 0.39 m later. The other five never touch anything.
GOLDEN = {
    "gas": [1803.968653733491, -292.2, 31.468025543467167],
    "nitro": [1739.232868382405, -290.63114851912127, 46.21729428938969],
    "turn": [1882.5171647865836, -267.454153955126, 21.604638849512714],
    "handbrake": [1873.6407168218582, -300.736676160143, 5.796862538598718],
    "coast": [1834.6722120583554, -292.2, 12.614475983585198],
    "brakeReverse": [1916.5585419172364, -292.2, 13.990973001690463],
    "kreisel": [1218.7183244804414, -127, 1.0311994537196747],
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
    """A standing car 11.8 m from the island centre (island 9.5): compact (radius 1.3) is free; at scale 2
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
    compact eye (-0.25, 1.22, -0.38) * 1.0; a moved eye (0.5, 1.5, -0.38) * 1.0. The swap mid-race keeps the car hidden."""
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
    assert before["d"] == pytest.approx([0.25, 1.22, 0.38], abs=1e-3), before
    assert after["d"] == pytest.approx([-0.5, 1.5, 0.38], abs=1e-3), after
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


def wait_settled(page, rounds=40, eps=0.01):
    """Wait until the scene has stopped uploading: three.js uploads a mesh the first time it is drawn, and the follow
    camera eases from its spawn pose into the chase pose over ~30 frames, so static world meshes keep entering the
    frustum and being uploaded for the first time (#64). Settled = two consecutive samples with equal GPU counts and
    a camera offset that moved < eps (arrival, not stillness: the exponential ease never reaches zero)."""
    sample = "() => ({ gpu: window.__mm.gpu(), d: window.__mm.cam().d })"
    prev = page.evaluate(sample)
    for _ in range(rounds):
        wait_frames(page, 5)
        cur = page.evaluate(sample)
        if cur["gpu"] == prev["gpu"] and max(abs(a - b) for a, b in zip(cur["d"], prev["d"])) < eps:
            return
        prev = cur
    raise AssertionError(f"scene did not settle in {rounds} rounds of 5 frames: {prev} -> {cur}")


def test_rebuilds_free_gpu_memory(server):
    """Review #32: each setVehicle rebuild must free its per-build materials and the plate texture. After the first
    rebuild, 5 more rebuilds of the same car (with frames drawn in between, so textures are uploaded) keep the GPU
    texture and geometry counts flat."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        use_vehicle(page, ""); wait_frames(page)
        wait_settled(page)
        first = page.evaluate("() => window.__mm.gpu()")
        for _ in range(5):
            use_vehicle(page, ""); wait_frames(page)
        last = page.evaluate("() => window.__mm.gpu()")
        b.close()
    assert first["textures"] > 0, first
    assert last["textures"] <= first["textures"], (first, last)
    assert last["geometries"] <= first["geometries"], (first, last)


def test_set_vehicle_rejects_inherited_model_and_missing_collision(server):
    """Review #32: 'constructor' is not a model (no prototype lookup), and a def without collision gets a clear Error,
    not a TypeError. Both leave the active vehicle alone."""
    bad = """(patch) => { const c = window.__mm.vehicles().compact; c.drive.top = 30; patch(c);
      try { window.__mm.setVehicle(c); return 'no error'; } catch (e) { return `${e.name}: ${e.message}`; } }"""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        ctor = page.evaluate(f"() => ({bad})(c => {{ c.model = 'constructor'; }})")
        nocol = page.evaluate(f"() => ({bad})(c => {{ delete c.collision; }})")
        top = page.evaluate("() => window.__mm.vehicle().drive.top")
        b.close()
    assert ctor.startswith("Error: ") and "constructor" in ctor, ctor
    assert nocol.startswith("Error: ") and "collision" in nocol, nocol
    assert top == 60


def test_set_vehicle_keeps_its_own_copy(server):
    """Review #32: mutating the object passed to setVehicle afterwards must not change the active vehicle (that
    would bypass checkVehicle)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        got = page.evaluate("""() => { const c = window.__mm.vehicles().compact; window.__mm.setVehicle(c);
          c.drive.top = 999; c.collision.shape = 'obb'; c.scale = 5; return window.__mm.vehicle(); }""")
        b.close()
    assert got["drive"]["top"] == 60 and got["collision"]["shape"] == "circle" and got["scale"] == 1.0, got


def test_compact_car_is_true_to_size(server):
    """#69: the compact is drawn at real size -- 4.66 m long (body outline +-2.26 m plus the 0.07 m bevel), 2.18 m over
    the mirrors, 1.55 m high -- and fits a 2.5 x 5.0 m parking bay (pipeline/world_parking.py BAY_W, BAY_D)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        scale = page.evaluate("() => window.__mm.vehicle().scale")
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert scale == 1.0
    assert size["l"] == pytest.approx(4.66, abs=0.02), size
    assert size["w"] == pytest.approx(2.18, abs=0.02), size
    assert size["h"] == pytest.approx(1.55, abs=0.02), size
    assert size["l"] < 5.0 and size["w"] < 2.5, size


@pytest.mark.parametrize("presses,dist,h", [(0, 6.9, 2.6), (1, 4.6, 1.85)])
def test_chase_cameras_sit_closer_to_the_true_size_car(server, presses, dist, h):
    """#69: chase/near distances are world metres. With the car at real size they move in by 1/1.3, so the car keeps
    its on-screen size (6.9 / 4.66 m ~ 9 / 6.06 m). The camera is smoothed: wait for arrival, never a fixed sleep."""
    arrived = (f"() => {{ const c = window.__mm.cam(); return c.view === {presses} && Math.abs(Math.hypot(c.d[0], c.d[2]) - {dist}) < 0.1"
               f" && Math.abs(c.d[1] - {h}) < 0.1; }}")
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        table = page.evaluate("() => window.__mm.vehicle().camera")
        assert table["chase"] == {"dist": 6.9, "h": 2.6} and table["near"] == {"dist": 4.6, "h": 1.85}, table
        page.click("#startbtn", timeout=180000)
        for _ in range(presses):
            page.keyboard.press("KeyC")
        page.wait_for_function(arrived, timeout=120000)
        b.close()


GLASS_JS = "() => window.__mm.glass()"


def assert_dark_opaque(g):
    for k in ("car", "heli"):
        m = g[k]
        assert m is not None, (k, g)
        assert m["transparent"] is False and m["opacity"] == 1, (k, m)
        assert all((m["color"] >> s) & 0xFF <= 0x20 for s in (16, 8, 0)), (k, hex(m["color"]))
    assert g["car"]["color"] == g["heli"]["color"], g


def test_windows_are_dark_and_opaque(server):
    """#123: car and helicopter share one dark, opaque glass, not a murky half see-through blue, also after a car rebuild."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        before = page.evaluate(GLASS_JS)
        use_vehicle(page, "c.drive.top = 30")                  # rebuilds the car (freeCar + buildCar)
        after = page.evaluate(GLASS_JS)
        b.close()
    assert_dark_opaque(before)
    assert_dark_opaque(after)


# ---------- #126: DeLorean look-alike ----------
DELOREAN_JS = "() => { window.__mm.setVehicle(window.__mm.vehicles().delorean); }"
DOORS_JS = "() => window.__mm.doors()"


def open_hand_query(p, server, query):
    """open_hand with a query string on the URL (the hooks are the same)."""
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 320, "height": 180})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errors


def test_delorean_is_in_the_table_and_true_to_size(server):
    """#126: 4.27 m long (profile -2.09..2.08 plus the 0.05 bevel), 2.0 m over the mirrors, 1.14 m to the roof, measured
    with the doors shut (Start closes them; the animation is smoothed, so wait for it, never a fixed sleep)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(DELOREAN_JS)
        page.click("#startbtn", timeout=180000)
        page.wait_for_function("() => window.__mm.doors().open < 0.01", timeout=120000)
        page.wait_for_function("() => Math.abs(window.__mm.wheelYaw().yaw) < 1e-3", timeout=120000)   # front wheels straight, or w reads 2.094
        model = page.evaluate("() => window.__mm.vehicle().model")
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert model == "delorean"
    assert size["l"] == pytest.approx(4.27, abs=0.05), size
    assert size["w"] == pytest.approx(2.0, abs=0.05), size
    assert size["h"] == pytest.approx(1.14, abs=0.05), size


def test_delorean_glass_is_dark_and_opaque(server):
    """#126: the DeLorean's cabin block is the shared #123 glass and is found by the hook."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(DELOREAN_JS)
        got = page.evaluate(GLASS_JS)
        b.close()
    assert_dark_opaque(got)


def test_delorean_drives_slower_than_compact(server):
    """#126: top 49 / accel 10 instead of 60 / 16: the golden 4 s gas run ends clearly slower (flat-road estimate with
    stepCar's drag terms: 21.1 m/s; compact 31.47)."""
    gas = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 0, 4).speed"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(DELOREAN_JS)
        slow = page.evaluate(gas)
        b.close()
    assert 18 < slow < 25, slow


def test_vehicle_query_selects_the_delorean(server):
    """#126: ?vehicle=delorean starts with the DeLorean, an unknown id with the compact, no errors either way."""
    with sync_playwright() as p:
        b, page, errors = open_hand_query(p, server, "?vehicle=delorean")
        picked = page.evaluate("() => window.__mm.vehicle().model")
        b.close()
        b, page, errors2 = open_hand_query(p, server, "?vehicle=tank")
        fallback = page.evaluate("() => window.__mm.vehicle().model")
        b.close()
    assert picked == "delorean"
    assert fallback == "compact"
    assert errors == [] and errors2 == [], (errors, errors2)


def test_delorean_doors_open_on_the_start_screen_and_close_for_the_run(server):
    """#126: on the start screen the gull-wing doors swing up (both lower panels rise); Start shuts them."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(DELOREAN_JS)
        page.wait_for_function("() => window.__mm.doors().open > 0.95", timeout=120000)
        opened = page.evaluate(DOORS_JS)
        page.click("#startbtn", timeout=180000)
        page.wait_for_function("() => window.__mm.doors().open < 0.05", timeout=120000)
        closed = page.evaluate(DOORS_JS)
        b.close()
    assert opened["target"] == 1 and closed["target"] == 0, (opened, closed)
    assert len(opened["panelY"]) == 2 and len(closed["panelY"]) == 2, (opened, closed)
    for up, down in zip(opened["panelY"], closed["panelY"]):
        assert up > down + 0.3, (opened, closed)


def test_compact_has_no_doors(server):
    """#126: the compact reports no door panels and the door state is harmless for it."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        got = page.evaluate(DOORS_JS)
        b.close()
    assert got["panelY"] == [], got


def test_swapping_from_the_delorean_to_the_compact_drops_the_door_entries(server):
    """Review #142: buildCar must reset car.userData.doors, or drawDoors keeps rotating detached hinges after a swap."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(DELOREAN_JS)
        before = page.evaluate(DOORS_JS)
        page.evaluate("() => { window.__mm.setVehicle(window.__mm.vehicles().compact); }")
        after = page.evaluate(DOORS_JS)
        b.close()
    assert len(before["panelY"]) == 2, before
    assert after["panelY"] == [], after


def test_delorean_rebuilds_free_gpu_memory(server):
    """#126: five DeLorean rebuilds keep the GPU counters flat (the steel grain is shared, the plate is per-build)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(DELOREAN_JS)
        page.wait_for_function("() => window.__mm.doors().open > 0.95", timeout=120000)   # doors fully open before the first reading
        wait_frames(page)
        first = page.evaluate("() => window.__mm.gpu()")
        for _ in range(5):
            page.evaluate(DELOREAN_JS); wait_frames(page)
        last = page.evaluate("() => window.__mm.gpu()")
        b.close()
    assert last["textures"] <= first["textures"], (first, last)
    assert last["geometries"] <= first["geometries"], (first, last)
