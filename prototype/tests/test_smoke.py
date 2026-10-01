from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"   # blocked by default: tests that want measured terrain opt in
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def load(server, block_world: bool):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 640, "height": 360})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        msgs = []
        page.on("pageerror", lambda e: msgs.append((str(e), "")))
        page.on("console", lambda m: msgs.append((m.text, m.location.get("url", ""))) if m.type in ("error", "warning") else None)
        if block_world:
            page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_selector("#startbtn", timeout=180000)
        page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        info = page.evaluate("() => ({ mm: window.__mm, world: document.querySelector('#worldstatus')?.textContent })")
        b.close()
        # own-page errors only: a missing world or terrain file is an accepted 404 (docs/11; the terrain is blocked on purpose
        # here); third-party resources (the Star button's api.github.com call gets rate-limited to 403 after a few runs) are
        # not under test. Page errors carry no URL and stay.
        return info, [t for t, u in msgs if "world_hochrhein.json" not in u and "terrain_hochrhein.mmh" not in u and (not u or u.startswith(server))]


def test_hand_traced_fallback(server):
    info, msgs = load(server, block_world=True)
    assert info["mm"]["layout"] == "hand"
    assert "traced by hand" in info["world"]
    assert msgs == []


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_osm_layout(server):
    info, msgs = load(server, block_world=False)
    assert info["mm"]["layout"] == "osm"
    assert info["mm"]["counts"]["buildings"] > 1000
    assert "OpenStreetMap" in info["world"]
    assert msgs == []


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_physics_time_osm_vs_hand(server):
    def phys(block):
        with sync_playwright() as p:
            b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
            page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
            if block:
                page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
            page.goto(f"{server}/prototype/index.html"); page.wait_for_selector("#startbtn", timeout=180000)
            page.click("#startbtn", timeout=180000); page.keyboard.down("Space"); page.wait_for_timeout(15000)
            v = page.evaluate("() => window.__mm.physMs"); b.close(); return v
    hand, osm = phys(True), phys(False)
    assert osm <= hand * 1.5 + 0.5, f"physMs hand={hand} osm={osm}"


MMH = Path(__file__).parents[2] / "data" / "terrain_hochrhein.mmh"


@pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")
def test_osm_rhine_splash_and_overpass(server):
    """With the measured terrain: water is relative to the chunk level (Rhine above the Säckingen weir ~5.5 m) and an
    overpass is no ground for a car on the road underneath. The .mmh goes in through the start screen's file input."""
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html"); page.wait_for_selector("#startbtn", timeout=180000)
        with page.expect_navigation(timeout=180000):                                 # the page stores the terrain and reloads
            page.set_input_files("#mmhfile", str(MMH))
        page.wait_for_selector("#mmhstatus.real", timeout=180000)
        page.wait_for_function("() => window.__mm && window.__mm.place", timeout=180000)
        page.click("#startbtn", timeout=180000)
        page.evaluate("() => window.__mm.place(1000, -530)")                       # Sisseln Rhine, riverDist -92
        page.wait_for_function("() => window.__mm.car().splash > 0", timeout=60000)
        w = page.evaluate("() => window.__mm.car()")
        page.evaluate("() => window.__mm.place(-628, 1068)")                       # Zürcherstrasse under the A3, Stein
        page.wait_for_timeout(1500)
        u = page.evaluate("() => window.__mm.car()")
        deck = page.evaluate("() => window.__mm.ground(-628, 1068)")              # no height: placement rule, still the deck
        b.close()
    print("water", w, "under", u, "deck", deck)
    assert w["water"] is not None and w["water"] > 4 and w["splash"] > 0 and w["y"] <= w["water"] - 1.1   # sinks below a 5.5 m surface
    assert not u["bridge"] and u["water"] is None and abs(u["ground"] - u["terrain"]) < 0.01 and abs(u["y"] - u["terrain"]) < 0.5
    assert deck > u["terrain"] + 1.5                                                                  # the deck really is above the car


def test_camera_cycles_with_c(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        page.keyboard.press("KeyC")
        assert page.evaluate("() => window.__mm.camView") == 0      # menu open: C does nothing
        page.click("#startbtn", timeout=180000)
        seen = []
        for _ in range(4):
            page.keyboard.press("KeyC")
            page.wait_for_timeout(300)
            seen.append(page.evaluate("() => [window.__mm.camView, document.querySelector('#toast').textContent]"))
        b.close()
    assert [v for v, _ in seen] == [1, 2, 3, 0]
    assert [t for _, t in seen] == ["Camera: Chase near", "Camera: Cockpit", "Camera: Bumper", "Camera: Chase"]


@pytest.mark.parametrize("locale,text", [("de-CH", "Grüss mir die Fische!"), ("en-US", "Sleep with the fishes!")])
def test_fishes_text_while_car_lies_in_water(server, locale, text):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(locale=locale, viewport={"width": 480, "height": 270}).new_page()
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        page.click("#startbtn", timeout=180000)
        page.evaluate("() => window.__mm.place(863.6, -647.7)")          # middle of the hand-traced Rhine
        page.wait_for_function("() => window.__mm.car().splash > 0.6", timeout=180000)
        shown = page.evaluate("() => [document.querySelector('#toast').textContent, window.__mm.car().splash]")
        b.close()
    assert shown[0] == text
    assert shown[1] < 2.8          # still lying in the water, not yet reset


@pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")
def test_bundled_terrain_loads_without_upload(server):
    """GitHub Pages: the published .mmh next to the world file is used without the file input."""
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=180000)
        status, blurb, clear_hidden = page.evaluate("() => [document.querySelector('#mmhstatus').textContent, document.querySelector('#blurb').textContent, document.querySelector('#mmhclear').hidden]")
        b.close()
    assert status.startswith("Terrain: measured ·") and "(your file)" not in status
    assert "OpenStreetMap" in blurb and "swisstopo" in blurb
    assert clear_hidden


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_car_slides_along_holzbruecke_rails(server):
    """Playtest 2026-10-01: the car got stuck on the side of the wooden bridge. Steered 8 degrees into a rail at
    15 m/s with the gas held, it must scrape along and keep going, not stop."""
    import json, math
    w = json.loads(WORLD.read_text(encoding="utf-8")); hb = w["anchors"]["landmarks"]["holzbruecke"]
    def near(r):
        return min(math.dist((hb["x"], hb["z"]), p) for p in r["pts"]) < 120
    pts = [p for r in w["roads"] if r.get("bridge") and near(r) for p in r["pts"]]
    a, b = max(((p, q) for p in pts for q in pts), key=lambda pq: math.dist(*pq))
    ux, uz = (b[0] - a[0]) / math.dist(a, b), (b[1] - a[1]) / math.dist(a, b)
    x, z = a[0] + ux * 40, a[1] + uz * 40
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        res = [page.evaluate(f"() => window.__mm.sim({x}, {z}, {math.atan2(uz, ux) + s * math.radians(8)}, 15, 3)") for s in (1, -1)]
        br.close()
    for r in res:
        along = (r["x"] - x) * ux + (r["z"] - z) * uz
        assert r["bridge"], r                      # still on the deck, not through the rail
        assert along > 35 and r["speed"] > 10, r   # kept going instead of sticking to the rail


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_nitro_and_jump_menu(server):
    """N = nitro (unlimited, faster than gas alone); J opens the place list, a digit jumps the car onto a road there."""
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 640, "height": 360})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        page.click("#startbtn")
        x, z, th = page.evaluate("() => { const c = window.__mm.car(); return [c.x, c.z, window.__mm.heading()]; }")
        gas = page.evaluate(f"() => window.__mm.sim({x}, {z}, {th}, 0, 4)")["speed"]
        nitro = page.evaluate(f"() => window.__mm.sim({x}, {z}, {th}, 0, 4, ['KeyW', 'KeyN'])")["speed"]
        page.keyboard.press("KeyJ")
        places = page.evaluate("() => [...document.querySelectorAll('#jump li')].map(li => li.textContent)")
        idx = next(i for i, t in enumerate(places) if "Bahnhof Sisseln" in t)
        page.keyboard.press(f"Digit{idx + 1}")
        after = page.evaluate("() => ({ car: window.__mm.car(), open: !document.querySelector('#jump').hidden, road: window.__mm.roadDist() })")
        br.close()
    assert nitro > gas * 1.3, (gas, nitro)
    assert any("Bad Säckingen" in t for t in places) and any("Bahnhof Stein-Säckingen" in t for t in places)
    assert not after["open"]
    assert after["road"] < 0                                          # on the driving surface
    assert abs(after["car"]["x"] - 1780) < 150 and abs(after["car"]["z"] - 560) < 150, after   # Bahnhof Sisseln checkpoint


def test_plattform_tower_blocks_the_car(server):
    """The Plattform Sisslerfeld placeholder is solid where it matters: driving east straight at its anchor from 25 m
    west, the car must be stopped by the batten stair core and never come out on the far side."""
    import json
    w = json.loads(WORLD.read_text(encoding="utf-8")); a = w["anchors"]["landmarks"]["plattform"]
    x, z = a["x"] - 25, a["z"]
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        r = page.evaluate(f"() => window.__mm.sim({x}, {z}, 0, 15, 3)")
        br.close()
    assert r["x"] < a["x"], r   # stopped at the tower, not driven through it


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_car_does_not_sink_into_the_smile_kreisel(server):
    """Playtest 2026-10-01: the car sank into the roundabout. The cobble apron is driven over at its own height and
    the flower island stops the car at its rim."""
    import json
    k = json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"]["smileKreisel"]
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        apron = page.evaluate(f"() => [window.__mm.ground({k['x'] + 11}, {k['z']}, 1e4), window.__mm.ground({k['x'] + 15}, {k['z']}, 1e4)]")
        hit = page.evaluate(f"() => window.__mm.sim({k['x'] + 30}, {k['z']}, Math.PI, 12, 4)")
        br.close()
    assert apron[0] > apron[1] + 0.3, apron                    # the apron is raised above the ring road (radius 15)
    assert hit["x"] - k["x"] > 9.5 + 1.0, hit                  # stopped at the island rim (radius 9.5) instead of driving into it


@pytest.mark.parametrize("mode", ["hand", "osm"])
def test_grass_and_fields_stay_below_the_road(server, mode):
    """Playtest 2026-10-01: grass and fields covered the road. Raycast road points (centre and both edges): the rendered
    road must be on top of the rendered grass and field meshes everywhere. OSM mode runs on the measured terrain."""
    if mode == "osm" and not (WORLD.exists() and MMH.exists()):
        pytest.skip("run pipeline/osm.py build and terrain.py first")
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        if mode == "hand":
            page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
            page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.grassOverRoad && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        if mode == "osm":
            page.wait_for_selector("#mmhstatus.real", timeout=240000)
        res = page.evaluate("() => window.__mm.grassOverRoad(250)")
        br.close()
    assert res["done"] >= 240, res
    assert res["worst"] < 0.01, res
    assert res["marksBelow"] == 0, res                # road markings lie on the road, not under it
    if mode == "osm":
        assert res["marksSeen"] > 5, res
