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
    assert not u["bridge"] and u["water"] is None and -0.01 < u["ground"] - u["terrain"] < 1.0 and abs(u["y"] - u["ground"]) < 0.5   # on the road below (drawn surface), not on the deck
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


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_jump_menu_random_spot(server):
    """J then 0 drops the car on a random road point anywhere in the map; it counts as a jump during a race."""
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 640, "height": 360})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        page.click("#startbtn")
        page.keyboard.press("KeyJ")
        last = page.evaluate("() => [...document.querySelectorAll('#jump li')].at(-1)?.textContent || ''")
        spots = []
        for i in range(3):
            if i: page.keyboard.press("KeyJ")
            page.keyboard.press("Digit0")
            spots.append(page.evaluate("() => ({ car: window.__mm.car(), open: !document.querySelector('#jump').hidden, road: window.__mm.roadDist() })"))
        jumped = page.evaluate("() => window.__mm.raceFlags().jumped")
        br.close()
    assert "Random spot" in last, last
    for s in spots:
        assert not s["open"], s
        assert s["road"] < 0, s                                       # on the driving surface
    pts = [(s["car"]["x"], s["car"]["z"]) for s in spots]
    assert any(((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 > 50 for a in pts for b in pts), pts   # random, not one fixed spot
    assert jumped


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
def test_smile_kreisel_fits_the_mapped_roundabout(server):
    """Playtest 2026-10-01: first the car sank into the roundabout, then it could not drive round it at all (the hero
    island was sized for the hand map and covered OSM's small ring road). The island sits inside the mapped ring, the
    ring stays free all the way round, the cobble apron is driven over at its own height, the island stops the car."""
    import json, math
    w = json.loads(WORLD.read_text(encoding="utf-8")); k = w["anchors"]["landmarks"]["smileKreisel"]
    ring = next(r for r in w["roads"] if len(r["pts"]) > 4 and math.dist(r["pts"][0], r["pts"][-1]) < 0.5
                and min(math.dist((k["x"], k["z"]), p) for p in r["pts"]) < 30)
    q = ring["pts"][:-1]; cx = sum(p[0] for p in q) / len(q); cz = sum(p[1] for p in q) / len(q)
    rad = sum(math.dist((cx, cz), p) for p in q) / len(q); inner = rad - ring["w"] / 2
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        apron = page.evaluate(f"() => [window.__mm.ground({cx + inner + 0.5}, {cz}, 1e4), window.__mm.ground({cx + rad}, {cz}, 1e4)]")
        pushed = page.evaluate(f"() => [...Array(16).keys()].map(i => {{ const a = i / 16 * Math.PI * 2, x = {cx} + Math.cos(a) * {rad}, z = {cz} + Math.sin(a) * {rad}, r = window.__mm.sim(x, z, a + Math.PI / 2, 0, 0.3, []); return Math.hypot(r.x - x, r.z - z); }})")
        hit = page.evaluate(f"() => window.__mm.sim({cx + 30}, {cz}, Math.PI, 12, 4)")
        br.close()
    assert inner > 2.5, (rad, ring["w"])
    assert max(pushed) < 0.05, pushed                           # the whole ring is drivable ("kann ihn gar nicht mehr befahren")
    assert apron[0] > apron[1] + 0.2, apron                     # the apron (0.375 m over the centre) is raised above the ring road
    assert inner - 1.0 < math.hypot(hit["x"] - cx, hit["z"] - cz) < inner + 3, hit   # stopped at the island rim, not inside it


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


@pytest.mark.parametrize("mode", ["hand", "osm"])
def test_wheels_do_not_sink_into_the_road(server, mode):
    """Playtest 2026-10-01: at the Smile-Kreisel the wheels sank into the asphalt. Wherever a road, junction disc or the
    kreisel ring is drawn, the car must drive on that surface (at most 8 cm below it)."""
    if mode == "osm" and not (WORLD.exists() and MMH.exists()):
        pytest.skip("run pipeline/osm.py build and terrain.py first")
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        if mode == "hand":
            page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
            page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sinkCheck && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        if mode == "osm":
            page.wait_for_selector("#mmhstatus.real", timeout=240000)
        res = page.evaluate("() => window.__mm.sinkCheck(400)")
        br.close()
    assert res["done"] > 200, res
    assert res["worst"] < 0.08, res


@pytest.mark.parametrize("mode", ["hand", "osm"])
def test_no_trees_on_the_railway(server, mode):
    """Playtest 2026-10-01: "Bäume auf Schienen?" — trees kept off the roads but not off the track."""
    if mode == "osm" and not WORLD.exists():
        pytest.skip("run pipeline/osm.py build first")
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        if mode == "hand":
            page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.treesOnRail && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        n = page.evaluate("() => [window.__mm.treesOnRail(), (window.__TREES || []).length]")
        br.close()
    assert n[1] > 100 and n[0] == 0, n


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_props_loaded(server):
    import json
    want = {}
    for p in json.loads(WORLD.read_text(encoding="utf-8")).get("props", []):
        want[p["kind"]] = want.get(p["kind"], 0) + 1
    info, msgs = load(server, block_world=False)
    assert info["mm"]["counts"]["props"] == want
    assert msgs == []
    info, _ = load(server, block_world=True)
    assert "props" not in info["mm"]["counts"]


@pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")
def test_sissle_visible_along_its_course(server):
    """Playtest 2026-10-02: standing on the bridge over the Sissle, the stream could not be seen (flat water chunks on a
    stream that falls 25 m, under the ground for half its length). Along the whole course, seen from above, the water is
    the first surface, and the car gets wet in it."""
    import json, math
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    pts = []
    for st in (s for s in w["streams"] if s["name"] == "Sissle"):
        for (ax, az), (bx, bz) in zip(st["pts"], st["pts"][1:]):
            n = max(1, int(math.dist((ax, az), (bx, bz)) // 40))
            pts += [[ax + (bx - ax) * k / n, az + (bz - az) * k / n] for k in range(n)]
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.waterVisible && document.querySelector('#mmhstatus.real')", timeout=240000)
        res = page.evaluate(f"() => window.__mm.waterVisible({json.dumps(pts)})")
        br.close()
    assert res["checked"] > 60, res
    assert res["visible"] >= 0.97 * res["checked"], res
    assert res["wet"] >= 0.97 * res["checked"], res


@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_hud_bundle(server):
    """#20: help overlay (F1), compass, odometer with reset (K), car on/off (V), turn signals (Q/E), the name of the
    water you are at, Tab = game speed x3 (a run that used it is not recorded)."""
    import json, math
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    rhine = next(x for x in w["water"] if x["name"] == "Rhein" and len(x["rings"][0]) > 20)
    rx = sum(p[0] for p in rhine["rings"][0]) / len(rhine["rings"][0]); rz = sum(p[1] for p in rhine["rings"][0]) / len(rhine["rings"][0])
    sis = next(s for s in w["streams"] if s["name"] == "Sissle"); sx, sz = sis["pts"][len(sis["pts"]) // 2]
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 960, "height": 540})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        page.click("#startbtn")
        hud = lambda: page.evaluate("() => window.__mm.hud()")
        page.keyboard.press("F1"); help_open = hud()["help"]; help_text = page.inner_text("#help")
        page.keyboard.press("F1"); help_closed = hud()["help"]
        x, z = page.evaluate("() => { const c = window.__mm.car(); return [c.x, c.z]; }")
        page.evaluate(f"() => window.__mm.sim({x}, {z}, -Math.PI / 2, 0, 0.02, [])")      # heading -z = north
        page.wait_for_timeout(400); north = hud()["compass"]
        page.evaluate(f"() => window.__mm.sim({x}, {z}, 0, 0, 0.02, [])")                  # heading +x = east
        page.wait_for_timeout(400); east = hud()["compass"]
        page.evaluate(f"() => window.__mm.sim({x}, {z}, 0, 20, 3, [])")
        trip = hud()["trip"]; page.keyboard.press("KeyK"); trip_reset = hud()["trip"]; total = hud()["total"]
        # the shadow follows the toggle in stepCar, i.e. one frame later - and a headless tab only renders while a raf-polled wait drives it, so count frames instead of waiting on the clock
        page.evaluate("() => { window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }")
        wait_frames = lambda: page.wait_for_function("f0 => window.__frames > f0 + 2", arg=page.evaluate("() => window.__frames"), timeout=60000)
        page.keyboard.press("KeyV"); car_off = hud()["carVisible"]; wait_frames(); shadow_off = hud()["shadowVisible"]
        page.keyboard.press("KeyV"); car_on = hud()["carVisible"]; wait_frames(); shadow_on = hud()["shadowVisible"]
        page.keyboard.press("KeyQ"); left = hud()["blinker"]; page.keyboard.press("KeyE"); right = hud()["blinker"]; page.keyboard.press("KeyE"); off = hud()["blinker"]
        page.keyboard.down("Tab"); page.wait_for_timeout(300); fast = hud()["timeScale"]; page.keyboard.up("Tab"); page.wait_for_timeout(300); normal = hud()["timeScale"]
        jumped = page.evaluate("() => window.__mm.raceFlags()")
        page.evaluate(f"() => window.__mm.place({rx}, {rz})"); page.wait_for_function("() => window.__mm.hud().water === 'Rhein'", timeout=60000)
        page.evaluate(f"() => window.__mm.place({sx + sis['w'] / 2 + 8}, {sz})"); page.wait_for_function("() => window.__mm.hud().water === 'Sissle'", timeout=60000)
        br.close()
    assert help_open and not help_closed and "Nitro" in help_text and "Turn signals" in help_text
    assert north.startswith("N ") and east.startswith("E "), (north, east)
    assert 0.04 < trip < 0.08 and trip_reset == 0 and total >= trip, (trip, trip_reset, total)
    assert car_off is False and car_on is True
    assert shadow_off is False and shadow_on is True, (shadow_off, shadow_on)   # V hides the car's ground shadow too (#37)
    assert (left, right, off) == ("left", "right", None)
    assert fast == 3 and normal == 1 and jumped["fast"] is True
