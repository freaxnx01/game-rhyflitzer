"""#102 / #201 / #277 / #361: the secret hideout in the Hübel -- a straight tunnel (T1) behind the gate into a round lift hall with a
drive-through freight lift; below it a short exit leads into a tunnel ring with eight star-shaped spokes, each ending (after a dark
stretch where the level switches unseen) in its own 500 m meadow room; the Eiffel Tower stands in room 0. Found when the lift's door
opens below. Needs the real world and terrain (the hill is swisstopo's). Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
GLB = ROOT / "prototype" / "assets" / "models" / "eiffel_tower.glb"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MOUTH_ROAD = (-703.3, 1419.1)          # the Hübel's centre line at the mouth
HEADING = 95 * math.pi / 180
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")
needs_model = pytest.mark.skipif(not GLB.exists(), reason="prototype/assets/models/eiffel_tower.glb is not committed yet (#201)")


def open_page(p, server, init_script=None):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    if init_script:
        page.add_init_script(init_script)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    page.click("#startbtn", timeout=180000)   # heavy real world under SwiftShader: the start overlay can take a while to accept clicks
    return br, page, errors


def t1_point(h, before_door):
    """A point on T1's axis `before_door` metres before the lift's door A (the tunnel-side door), and T1's heading."""
    cx, cz = h["centre"]; ux, uz = math.cos(HEADING), math.sin(HEADING); s = h["lift"]["hd"] + before_door
    return (cx - ux * s, cz - uz * s), HEADING


@needs_world
def test_floor_lid_hall_and_lift(server):
    """The hideout is T1 and the lift hall: one floor (the cut), the hill 40+ m over the hall, a 25 m radius hall with ring walls and
    four lamp posts, no stubs or side rooms any more; the whole system stays inside the triangle budget."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        assert h is not None
        cx, cz = h["centre"]; ux, uz = math.cos(HEADING), math.sin(HEADING)
        probes = page.evaluate(f"() => [[{cx}, {cz}]].map(([x, z]) => window.__mm.probe(x, z).terrain)")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        roofed_mouth = page.evaluate(f"() => window.__mm.roofed({h['mouth'][0]}, {h['mouth'][1]})")
        counts = page.evaluate("() => window.__mm.counts")
        # inward from outside the hill at 2 m over the hall floor: the first thing is the ring wall's outer face.
        # The target must sit inside the disc, where terrainH is the floor -- the hook takes `up` over the target.
        wall = page.evaluate(f"() => window.__mm.wallRoleAt({cx + 40}, {cz}, {cx + 21}, {cz}, 2)")
        # down T1 into the hall: open all the way (the hall's one doorway)
        open_t1 = page.evaluate(f"() => window.__mm.wallRoleAt({cx - ux * 60}, {cz - uz * 60}, {cx - ux * 14}, {cz - uz * 14}, 2)")
        lights = page.evaluate("() => window.__mm.hideoutLights()")
        br.close()
    assert errors == []
    assert 8 <= h["portalS"] <= 20, h
    assert all(abs(t - h["floor"]) < 0.3 for t in probes), (probes, h)
    assert h["lid"] - h["floor"] >= 40, h
    assert sky >= h["lid"], (sky, h)
    assert roofed_mouth is False
    assert set(h["rooms"]) == {"hall"} and h["rooms"]["hall"]["r"] == 25, h["rooms"]
    assert math.hypot(cx - -712.8, cz - 1528.2) < 0.1, h["centre"]
    assert "stubs" not in h and h["lamps"] == 4 and h["walls"] >= 24 and len(lights) == 2, (h, lights)   # the hall's two point lights
    assert h["lidTris"] > 0 and h["floorTris"] > 0 and h["lidTris"] + h["floorTris"] < 120000, h
    assert "eiffel" not in counts, counts            # #277: the room is built on entering its spoke, not at start
    assert h["found"] is False
    assert wall == "stone", wall
    assert open_t1 is None, open_t1


def jump_list(page):
    page.keyboard.press("KeyJ")
    page.wait_for_function("() => !document.getElementById('jump').hidden")
    names = [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
    page.keyboard.press("Escape")
    page.wait_for_function("() => document.getElementById('jump').hidden")
    return names


LIFT_FAST = "() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 0.4, open: 0.1})"
RIDE_DONE = "(lvl) => window.__mm.lift().level === lvl && window.__mm.lift().phase === 'idle'"


def enter_cabin(page, h, level):
    """Make the lift fast and stand the car at rest in the cabin (the loop's own frames then count the dwell). `level` is the level it
    rides to: down ('ring') from the tunnel side, up ('surface') from the ring side. The car first steps off the cabin on the level it is
    on, so the lift is armed again after an earlier ride."""
    page.evaluate(LIFT_FAST)
    lx, lz = h["lift"]["c"]; th = h["lift"]["th"]; d = 30 if level == "surface" else -30; y = -600 if level == "surface" else h["floor"]
    page.evaluate(f"() => window.__mm.sim({lx + math.cos(th) * d}, {lz + math.sin(th) * d}, {th}, 0, 0.1, [], {y})")
    page.evaluate(f"() => window.__mm.place({lx}, {lz}, {th if level == 'ring' else th + math.pi})")


def ride(page, h, level):
    enter_cabin(page, h, level)
    page.wait_for_function(RIDE_DONE, arg=level, timeout=240000)


@needs_world
def test_t1_into_the_hall_opens_door_a_and_is_no_find(server):
    """Listed in J from the start; drive from the Hübel into the hill: T1 and the hall are no find (#277: the find is the lift's door
    opening below). The lift's tunnel-side door is shut far away and opens as the car comes near; the cabin stays on the top level."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        assert "Reservoir Hübel" in jump_list(page)   # #102: always in the list, found or not
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        r = page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 4, ['KeyW'])")
        in_t1 = page.evaluate("() => ({ found: window.__mm.hideout().found, stored: localStorage.getItem('mm.hideout'), room: window.__mm.roomAt(window.__mm.car().x, window.__mm.car().z), cave: window.__mm.cave(), door: window.__mm.lift().door })")
        (px, pz), th = t1_point(h, 30)
        # standing still 30 m out for longer than the door's closing time: the drive in at 16 m/s may already have reached the
        # speed-scaled door reach (nearLiftDoor), so the door is judged once it had time to shut, not 0.1 s after the teleport
        far = page.evaluate(f"() => {{ window.__mm.sim({px}, {pz}, {th}, 0, 1.5, [], {h['floor']}); return window.__mm.lift(); }}")
        r2 = page.evaluate(f"() => window.__mm.sim({px}, {pz}, {th}, 10, 2.5, ['KeyW'], {h['floor']})")
        near = page.evaluate("() => window.__mm.lift()")
        found = page.evaluate("() => window.__mm.hideout().found")
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        br.close()
    assert errors == []
    assert abs(r["y"] - h["floor"]) < 8.0 and in_t1["cave"]["inside"] is True, (r, in_t1, h)
    assert far["door"] == 0 and far["cabin"] == "top" and far["level"] == "surface", far
    assert near["door"] > 0.9 and near["cabin"] == "top" and near["phase"] == "idle", near
    assert math.hypot(r2["x"] - cx, r2["z"] - cz) < 25 and abs(r2["y"] - h["floor"]) < 1.0, (r2, h)
    assert in_t1["found"] is False and found is False and stored is None and in_t1["stored"] is None


HUD_SHOWN = "() => Object.fromEntries(['arrow', 'dist', 'cpname'].map(i => [i, getComputedStyle(document.getElementById(i)).display !== 'none']))"


@needs_world
def test_driving_through_the_cabin_without_stopping_does_nothing(server):
    """Door A opens as the car comes; a car still rolling through the cabin (above the stop speed) starts no ride."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate(LIFT_FAST)
        (px, pz), th = t1_point(h, 8)
        page.evaluate(f"() => window.__mm.sim({px}, {pz}, {th}, 8, 1.0, ['KeyW'], {h['floor']})")      # in through door A, 8 m/s
        state = page.evaluate("() => ({ lift: window.__mm.lift(), car: window.__mm.car() })")
        br.close()
    assert errors == []
    lx, lz = h["lift"]["c"]
    assert math.hypot(state["car"]["x"] - lx, state["car"]["z"] - lz) < h["lift"]["hd"], state   # it did get into the cabin
    assert state["lift"]["level"] == "surface" and state["lift"]["phase"] == "idle", state


@needs_world
def test_room_drive_under_the_tower_and_ride_back_up(server):
    """Below: along spoke 0 into the Eiffel room, the tree ring stops the car, the car drives under the tower, R stays below at the
    portal, back through the portal tunnel to the ring, round into the cabin from the ring side, up: door A opens in the hall."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring"); into_room(page, 0, "eiffel")
        room = h["room"]; tx, tz = room["tower"]["x"], room["tower"]["z"]; cx, cz = room["centre"]; half = room["half"]; th0 = room["portal"]["th"]
        f = (math.cos(th0), math.sin(th0))
        page.evaluate(f"() => window.__mm.place({tx}, {tz}, {th0})")     # under the tower, between the legs
        assert page.evaluate("() => window.__mm.level().id") == "eiffel"
        under = page.evaluate("() => window.__mm.car()")
        page.evaluate(f"() => window.__mm.sim({cx + f[0] * (half - 60)}, {cz + f[1] * (half - 60)}, {th0}, 25, 4, ['KeyW'], -600)")   # the tree ring ends the run
        end = page.evaluate("() => window.__mm.car()")
        page.keyboard.press("KeyR"); page.wait_for_timeout(300)
        lvl = page.evaluate("() => window.__mm.level().id"); c = page.evaluate("() => window.__mm.car()")
        back_to_ring(page, 0)
        ride(page, h, "surface")
        up = page.evaluate("() => window.__mm.car()"); lift = page.evaluate("() => window.__mm.lift()")
        hud_surface = page.evaluate(HUD_SHOWN)
        br.close()
    assert errors == []
    assert hud_surface == {"arrow": True, "dist": True, "cpname": True}, hud_surface         # back on the surface the race HUD is back
    assert abs(under["y"] + 600) < 1.0 and math.hypot(under["x"] - tx, under["z"] - tz) < 1, under
    assert (end["x"] - cx) * f[0] + (end["z"] - cz) * f[1] < half - 2, end
    px, pz = room["portal"]["c"]
    assert lvl == "eiffel" and math.hypot(c["x"] - px, c["z"] - pz) < 25, (lvl, c)
    lx, lz = h["lift"]["c"]
    assert abs(up["y"] - h["floor"]) < 1.0 and math.hypot(up["x"] - lx, up["z"] - lz) < 9, up
    assert lift["level"] == "surface" and lift["cabin"] == "top" and lift["door"] > 0.9, lift


@needs_world
def test_room_helicopter_flies_inside_the_clamp_lands_on_the_floor_and_the_lift_works(server):
    """In the Eiffel room (its own rotated frame) F takes off, the helicopter stays inside the soft wall and under the ceiling when
    pushed out and up, F lands on the room floor, and the lift up still works. In the portal tunnel and on T1 F is refused."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring"); into_room(page, 0, "eiffel")
        room = h["room"]; cx, cz = room["centre"]; th0 = room["portal"]["th"]; f = (math.cos(th0), math.sin(th0)); v = (-f[1], f[0])
        # into_room leaves the car 65 m into the spoke, under the portal tunnel's roof: no sky there
        page.keyboard.press("KeyF"); page.wait_for_timeout(500)
        portal = page.evaluate("() => ({ toast: window.__mm.toast().text, flying: window.__mm.fly().on })")
        page.evaluate(f"() => window.__mm.place({cx - f[0] * 120}, {cz - f[1] * 120}, {th0})")
        page.keyboard.press("KeyF"); page.wait_for_timeout(300)
        page.wait_for_function("() => window.__mm.fly().on && window.__mm.fly().y > -600", timeout=60000)   # a loaded headless run may not have stepped a frame yet
        on = page.evaluate("() => window.__mm.fly()")
        out = page.evaluate("() => window.__mm.flySim(40, ['KeyW', 'Space', 'KeyN'])")   # forward (+f) and up, nitro
        page.evaluate(f"() => window.__mm.place({cx - v[0] * 100}, {cz - v[1] * 100}, {th0 - math.pi / 2})")
        side = page.evaluate("() => window.__mm.flySim(40, ['KeyW', 'Space'])")           # out along -v
        page.keyboard.press("KeyF"); page.wait_for_timeout(300)
        landed = page.evaluate("() => ({ fly: window.__mm.fly().on, car: window.__mm.car(), lvl: window.__mm.level().id })")
        back_to_ring(page, 0)
        ride(page, h, "surface")
        up = page.evaluate("() => window.__mm.car()")
        # T1 (roofed, surface level) still refuses
        (px, pz), tth = t1_point(h, 60)
        page.evaluate(f"() => window.__mm.sim({px}, {pz}, {tth}, 0, 0.1, ['KeyW'], {h['floor']})")
        page.keyboard.press("KeyF"); page.wait_for_timeout(500)
        tunnel = page.evaluate("() => ({ toast: window.__mm.toast().text, flying: window.__mm.fly().on })")
        br.close()
    assert errors == []
    assert portal["flying"] is False and ("sky" in portal["toast"] or "Himmel" in portal["toast"]), portal
    frame = lambda r: ((r["x"] - cx) * f[0] + (r["z"] - cz) * f[1], (r["x"] - cx) * v[0] + (r["z"] - cz) * v[1])
    assert on["on"] is True and on["y"] > -600
    assert frame(out)[0] <= 225 + 0.01 and out["y"] <= -600 + 420 + 0.5 and out["y"] > -600, (frame(out), out)
    assert side["on"] is True and side["y"] <= -600 + 420 + 0.5 and frame(side)[1] >= -225 - 0.01, (frame(side), side)
    assert landed["fly"] is False and landed["lvl"] == "eiffel" and abs(landed["car"]["y"] + 600) < 1.0, landed
    assert abs(up["y"] - h["floor"]) < 1.0, up
    assert tunnel["flying"] is False and ("sky" in tunnel["toast"] or "Himmel" in tunnel["toast"]), tunnel


@needs_world
def test_room_helicopter_climbs_past_the_tower_top_and_sinks_back(server):
    """In the room, holding Space climbs steadily to above the 330 m tower top within ~20 s (it crawled at ~0.5 m/s because the
    clamp pulled the target altitude down to the lagging height every frame); Shift sinks again; always inside the clamp."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring"); into_room(page, 0, "eiffel")
        cx, cz = h["room"]["centre"]; th0 = h["room"]["portal"]["th"]
        page.evaluate(f"() => window.__mm.place({cx - math.cos(th0) * 120}, {cz - math.sin(th0) * 120}, {th0})")
        page.keyboard.press("KeyF"); page.wait_for_timeout(300)
        page.evaluate("() => window.__mm.flySim(10, ['Space'])")
        mid = page.evaluate("() => window.__mm.fly()")
        top = page.evaluate("() => window.__mm.flySim(12, ['Space'])")
        capped = page.evaluate("() => window.__mm.flySim(20, ['Space'])")
        sunk = page.evaluate("() => window.__mm.flySim(15, ['ShiftLeft'])")
        br.close()
    assert errors == []
    assert mid["y"] > -600 + 120 + 100, mid                 # 10 s of Space: far above the +120 m take-off height
    assert top["y"] > -600 + 330, top                       # 22 s: above the tower top
    assert top["y"] <= -600 + 420 + 0.5 and capped["y"] <= -600 + 420 + 0.5 and capped["y"] > -600 + 395, capped
    assert sunk["y"] < capped["y"] - 150, (capped, sunk)    # Shift sinks


@needs_world
def test_j_below_returns_to_the_surface_and_a_ride_flags_a_race(server):
    """J (placeOnRoad) from the ring and from a room puts the car on the surface (and the cabin back on top); a lift ride in a race counts
    like a jump."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        page.evaluate("() => window.__mm.raceNow()")   # a running race: the ride must flag it
        ride(page, h, "ring")
        jumped = page.evaluate("() => window.__mm.raceFlags().jumped")
        def jump_to_reservoir():
            page.keyboard.press("KeyJ")
            page.wait_for_function("() => !document.getElementById('jump').hidden")
            page.keyboard.type("reservoir"); page.keyboard.press("Enter")
            page.wait_for_function("() => document.getElementById('jump').hidden")
            return page.evaluate("() => ({ lvl: window.__mm.level().id, y: window.__mm.car().y, below: document.body.classList.contains('below'), cabin: window.__mm.lift().cabin })")
        from_ring = jump_to_reservoir()
        ride(page, h, "ring"); into_room(page, 0, "eiffel")
        from_room = jump_to_reservoir()
        br.close()
    assert errors == []
    assert jumped is True
    for r in (from_ring, from_room):
        assert r["lvl"] == "surface" and r["y"] > -100 and r["below"] is False and r["cabin"] == "top", r


@needs_world
def test_sky_ground_and_no_takeoff_inside(server):
    """The helicopter sees the hill over the cave, and F in T1 and in the lift hall is refused with a toast."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        (px, pz), th = t1_point(h, 60)
        results = []
        for x, z, heading, speed, secs, y in [(MOUTH_ROAD[0], MOUTH_ROAD[1], HEADING, 16, 4, "null"), (px, pz, th, 0, 0.1, h["floor"]), (cx + math.cos(HEADING + math.pi / 2) * 15, cz + math.sin(HEADING + math.pi / 2) * 15, math.pi, 0, 0.1, h["floor"])]:
            page.evaluate(f"() => window.__mm.sim({x}, {z}, {heading}, {speed}, {secs}, ['KeyW'], {y})")
            page.keyboard.press("KeyF")
            page.wait_for_timeout(500)
            results.append(page.evaluate("() => ({ toast: window.__mm.toast().text, car: window.__mm.car(), flying: window.__mm.fly().on })"))
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        br.close()
    assert errors == []
    for r in results:
        assert "sky" in r["toast"] or "Himmel" in r["toast"], r
        assert r["flying"] is False
        assert abs(r["car"]["y"] - h["floor"]) < 8.0, r        # T1 falls 5 %: the mouth run ends a few metres above the hall's floor
    assert abs(results[2]["car"]["y"] - h["floor"]) < 1.0, results[2]
    assert sky >= h["lid"], (sky, h)


CROSS_JS = """([x, z, th, secs]) => {
  window.__mm.sim(x, z, th, 10, 0.05, ['KeyW']);
  const out = { roofed: 0, minAboveLid: Infinity, path: [] };
  for (let i = 0; i < secs * 10; i++) {
    const c = window.__mm.step(0.1, ['KeyW']), lid = window.__mm.lidAt(c.x, c.z);
    out.path.push([+c.x.toFixed(1), +c.z.toFixed(1), +c.y.toFixed(1)]);
    if (lid !== null) { out.roofed++; out.minAboveLid = Math.min(out.minAboveLid, c.y - lid); }
  }
  out.found = window.__mm.hideout().found;
  out.cave = window.__mm.cave();
  return out;
}"""


def across(page, s, off, secs):
    """Start `off` metres to the side of the axis at `s` metres in, on the hilltop, and drive straight across the axis."""
    ux, uz = math.cos(HEADING), math.sin(HEADING)
    mx, mz = -703.7 + ux * s, 1423.6 + uz * s
    x, z = mx - uz * off, mz + ux * off            # off the axis on its left (normal (-uz, ux))
    th = math.atan2(-ux, uz)                       # facing (uz, -ux): back across the axis to the right
    return page.evaluate(CROSS_JS, [x, z, th, secs])


@needs_world
def test_hill_is_solid_over_the_tunnel_and_the_cavern(server):
    """The review's drive: sideways across the hill at s = 40 and s = 70, and over the cavern. The car stays on the hill,
    never under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        runs = {s: across(page, s, 18, 4) for s in (40, 70)}
        cavern = across(page, 105, 40, 8)
        br.close()
    assert errors == []
    for s, r in runs.items():
        assert r["roofed"] > 0, (s, r["path"])
        assert r["minAboveLid"] > 0, (s, r["minAboveLid"], r["path"])
    assert cavern["roofed"] > 0, cavern["path"]
    assert cavern["minAboveLid"] > 0, (cavern["minAboveLid"], cavern["path"])


@needs_world
def test_hill_is_solid_over_the_system(server):
    """Across the hall's footprint on the hilltop (both ways) and over the former N1 / T2 / lobby ground: the car stays on the hill, never
    under a ceiling, the cave stays off (not inside, nothing of the hall drawn, every cave light off, the forest shown), no find; the
    old lobby ground is plain hill again, not roofed."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        hx, hz = h["centre"]
        east = page.evaluate(CROSS_JS, [hx - 60, hz, 0.0, 12])                    # east across the hall's footprint
        south = page.evaluate(CROSS_JS, [hx, hz - 60, math.pi / 2, 12])           # south across it
        lights = page.evaluate("() => window.__mm.hideoutLights()")
        top = page.evaluate(f"() => [[{hx}, {hz}]].map(([x, z]) => ({{ top: window.__mm.topAt(x, z), hill: window.__mm.skyGround(x, z), roofed: window.__mm.roofed(x, z) }}))")
        old = page.evaluate("() => ({ roofed: window.__mm.roofed(-790, 1855), lid: window.__mm.lidAt(-790, 1855), room: window.__mm.roomAt(-790, 1855) })")
        found = page.evaluate("() => window.__mm.hideout().found")
        br.close()
    assert errors == []
    for r in (east, south):
        assert r["roofed"] > 0 and r["minAboveLid"] > 0, (r["minAboveLid"], r["path"][:5])
        assert r["cave"]["inside"] is False and r["cave"]["visible"] is False and r["cave"]["treesVisible"] is True, r["cave"]
    assert all(not l["visible"] for l in lights), lights
    for t in top:
        assert t["roofed"] is True and t["top"]["role"] == "grass" and abs(t["top"]["y"] - t["hill"]) < 0.05, t
    assert old == {"roofed": False, "lid": None, "room": None}, old
    assert found is False


@needs_world
def test_map_shows_the_hill_over_the_hall(server):
    """The static map paints the hill's height over the hall (and over the former lobby ground), not the cave floor: the capped hill tint."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        px = page.evaluate("() => { const h = window.__mm.hideout(), [rx, rz] = h.centre; return [window.__mm.mapPixel(rx, rz), window.__mm.mapPixel(-790, 1855)]; }")
        br.close()
    assert errors == []
    assert px[0] == px[1], px
    r, g, b, a = (int(v) for v in px[0].split(","))
    hill = [31 + (120 - 31) * 0.55, 42 + (140 - 42) * 0.55, 34 + (90 - 34) * 0.55]   # rgba(120,140,90,.55) over #1f2a22: a hill over 110 m
    assert all(abs(c - e) <= 2 for c, e in zip((r, g, b), hill)) and a == 255, (px[0], hill)


@needs_world
def test_forest_stands_on_the_lid(server):
    """Forest trees over the hall are planted on the hill, not on the cave floor."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        low = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.centre; return window.__FOREST.filter(t => Math.hypot(t[0] - x, t[1] - z) < 150).map(t => t[3] - window.__mm.skyGround(t[0], t[1])); }")
        br.close()
    assert errors == []
    assert len(low) > 50 and all(abs(d) < 0.05 for d in low), (len(low), low[:5])


FOOTPRINT_JS = """() => Object.values(window.__mm.hideoutRing()).flat().map(r => {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), out = [];
  for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) for (const b of [-0.5, 0, 0.5]) {
    const la = a * (r.len - 0.1), lb = b * (r.wall - 0.1), x = r.x + c * la - s * lb, z = r.z + s * la + c * lb;
    const top = window.__mm.topAt(x, z), hill = window.__mm.skyGround(x, z);
    out.push({ x: +x.toFixed(2), z: +z.toFixed(2), role: top && top.role, y: top && top.y, hill });
  }
  return out;
})"""


@needs_world
def test_ring_wall_stays_under_the_hill(server):
    """From the sky, every point over the hall's ring-wall blocks hits the hill's grass at the hill's height: no stone
    pokes out."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        ring = page.evaluate("() => Object.fromEntries(Object.entries(window.__mm.hideoutRing()).map(([k, v]) => [k, v.length]))")
        blocks = page.evaluate(FOOTPRINT_JS)
        br.close()
    assert errors == []
    assert set(ring) == {"hall"} and ring["hall"] >= 12, ring
    assert len(blocks) == sum(ring.values())
    bad = [pt for blk in blocks for pt in blk if pt["role"] != "grass" or abs(pt["y"] - pt["hill"]) > 0.05]
    assert bad == [], (len(bad), bad[:6])


@needs_world
def test_no_find_on_top_of_the_hill(server):
    """Driving over the hall on the hilltop (or flying over it) is no find: that needs the car under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        cavern = across(page, 105, 40, 8)
        h = page.evaluate("() => window.__mm.hideout()")
        hx, hz = h["centre"]
        hall = page.evaluate(CROSS_JS, [hx, hz - 60, math.pi / 2, 8])     # right over the hall's centre, on the hilltop
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        found = page.evaluate("() => window.__mm.hideout().found")
        br.close()
    assert errors == []
    cx, cz = h["centre"]
    assert min(math.hypot(x - cx, z - cz) for x, z, _ in cavern["path"]) < 10, cavern["path"]   # right over the hall
    assert min(math.hypot(x - hx, z - hz) for x, z, _ in hall["path"]) < 10, hall["path"]       # and again, the other way
    assert cavern["found"] is False and hall["found"] is False and found is False and stored is None, (cavern["path"], h)


EDGES_JS = """() => {
  const h = window.__mm.hideout(), a = 95 * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a), out = [];
  for (let s = h.portalS + 2; s <= 105 - 25; s += 3) for (const side of [-1, 1]) for (let d = 5.5; d <= 10; d += 0.25) {
    const x = h.mouth[0] + ux * s - uz * d * side, z = h.mouth[1] + uz * s + ux * d * side;
    const top = window.__mm.topAt(x, z), hill = window.__mm.probe(x, z).terrain + window.__mm.cutDepth(x, z);
    out.push({ s, d: d * side, role: top && top.role, y: top && top.y, hill });
  }
  return out;
}"""


@needs_world
def test_corridor_edges_are_covered_from_above(server):
    """Downward rays across both edges of the roofed corridor hit the hill's grass at the hill's height: no groove, no
    trough-wall top showing as two lines along the tunnel."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        pts = page.evaluate(EDGES_JS)
        br.close()
    assert errors == []
    assert len(pts) > 300
    bad = [pt for pt in pts if pt["role"] != "grass" or abs(pt["y"] - pt["hill"]) > 0.05]
    assert bad == [], (len(bad), bad[:6])


def irradiance(light, x, y, z):
    """three r170 PointLight / SpotLight on its axis, physical units: intensity / d^decay, windowed to 0 at `distance`
    (getDistanceAttenuation)."""
    d = math.dist((light["x"], light["y"], light["z"]), (x, y, z))
    window = (max(0.0, 1 - (d / light["distance"]) ** 4)) ** 2 if light["distance"] > 0 else 1.0
    return light["intensity"] / max(d ** light["decay"], 0.01) * window


@needs_world
def test_cave_mode_toggles_and_restores(server):
    """Inside: dark fog, no shadows, trees hidden, lights on, interior visible, no shader recompile. Outside again: the style's
    values."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        before = page.evaluate("() => window.__mm.cave()")
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["centre"]
        page.evaluate(f"() => window.__mm.sim({hx + 15}, {hz}, {math.pi}, 8, 0.5, ['KeyW'], {h['floor']})")
        page.wait_for_function("() => window.__mm.cave().inside === true")
        inside = page.evaluate("() => window.__mm.cave()")
        lights = page.evaluate("() => window.__mm.hideoutLights()")
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING + math.pi}, 8, 0.5, ['KeyW'])")
        page.wait_for_function("() => window.__mm.cave().inside === false")
        after = page.evaluate("() => window.__mm.cave()")
        lights_after = page.evaluate("() => window.__mm.hideoutLights()")
        br.close()
    assert errors == []
    assert before["visible"] is False and before["inside"] is False, before
    assert inside["visible"] and inside["fog"] == "#07080a" and inside["shadows"] is False and inside["treesVisible"] is False, inside
    assert inside["lights"] == 2 and len(lights) == 2 and all(l["visible"] for l in lights), lights    # the hall's two (#277: no floodlights)
    assert inside["programs"] == before["programs"], "cave lights must be pre-compiled"
    for k in ("fog", "fogDensity", "shadows", "treesVisible", "visible"):
        assert after[k] == before[k], (k, before[k], after[k])
    assert all(not l["visible"] for l in lights_after), lights_after


CAM_JS = """([x, z, th, v, secs, from, y]) => {
  window.__mm.sim(x, z, th, v, secs, ['KeyW'], y);
  const step = (f) => { const c = window.__mm.camStep(1 / 60, f), car = window.__mm.car(), cx = car.x + c.d[0], cy = car.y + c.d[1], cz = car.z + c.d[2];
    return { y: cy, lid: window.__mm.lidAt(cx, cz), ceiling: window.__mm.ceilingAt(cx, cz), hill: window.__mm.probe(cx, cz).terrain + window.__mm.cutDepth(cx, cz) }; };
  const car = window.__mm.car(), first = step(from ? [car.x + from[0], car.y + from[1], car.z + from[2]] : null);
  let settled = first; for (let i = 0; i < 120; i++) settled = step(null);
  return { car, first, settled };
}"""


@needs_world
def test_camera_stays_under_the_ceiling_while_easing_and_on_the_hill_above_it(server):
    """In T1 and in the lift hall a chase camera still easing in from above the hill is held under the ceiling from its first step (T1
    capped at 12 m, the hall at the hill's underside); on the hilltop over the hall the camera stays above the grass."""
    ux, uz = math.cos(HEADING), math.sin(HEADING)
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        # from the Hübel into the tunnel (~35 m in); the camera 8 m back down the axis and 40 m up, where a camera
        # following from outside the hill can still be
        tunnel = page.evaluate(CAM_JS, [MOUTH_ROAD[0], MOUTH_ROAD[1], HEADING, 16, 2.5, [-ux * 8, 40, -uz * 8], None])
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        (px, pz), th = t1_point(h, 30)
        hall = page.evaluate(CAM_JS, [px, pz, th, 8, 3.0, [-math.cos(th) * 8, 40, -math.sin(th) * 8], h["floor"]])
        top = page.evaluate(CAM_JS, [cx - uz * 30, cz + ux * 30, math.atan2(-ux, uz), 6, 1.5, None, None])
        br.close()
    assert errors == []
    assert abs(tunnel["car"]["y"] - h["floor"]) < 6, tunnel           # the car is down in the tunnel
    for c in (tunnel["first"], tunnel["settled"], hall["first"], hall["settled"]):
        assert c["ceiling"] is not None and c["y"] <= c["ceiling"] - 1 + 1e-6, (tunnel, hall)
    assert abs(tunnel["settled"]["ceiling"] - (tunnel["car"]["ground"] + 12)) < 1.0, tunnel   # T1: the 12 m cap over the road
    assert top["car"]["y"] > top["settled"]["hill"] - 5, top          # the car is up on the hill
    assert top["settled"]["lid"] is not None, top                     # with the camera over the lid
    assert top["settled"]["y"] > top["settled"]["hill"], top


@needs_world
def test_j_reservoir_puts_the_car_on_the_huebel_facing_the_gate(server):
    """J -> "reservoir" (no find needed) puts the car on the Hübel by the mouth, facing the gate."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.getElementById('jump').hidden")
        page.keyboard.type("reservoir")
        listed = [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.getElementById('jump').hidden")
        car = page.evaluate("() => window.__mm.car()")
        th = page.evaluate("() => window.__mm.heading()")
        br.close()
    assert errors == []
    assert listed[0] == "Reservoir Hübel", listed                  # first match, so Enter takes it
    assert math.hypot(car["x"] - MOUTH_ROAD[0], car["z"] - MOUTH_ROAD[1]) < 5, car
    ux, uz = math.cos(HEADING), math.sin(HEADING)
    assert math.cos(th) * ux + math.sin(th) * uz > 0.7, ("not facing down the tunnel", th)


@needs_world
@needs_model
def test_eiffel_model_loads_lazily_and_matches_the_feet(server):
    """The GLB is fetched only once the car is near the Hübel; room 0 is built on entering its spoke and shows it 330 m tall in Eiffel
    brown, the placeholder is gone, and its four feet lie in the solid foot boxes (drive between the legs)."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        h = page.evaluate("() => window.__mm.hideout()")
        e0 = page.evaluate("() => window.__mm.eiffel()")
        assert e0 is None and requests == []                  # #277: no room, no tower, before the first ride
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 0, 0.1, [])")
        page.wait_for_function("() => performance.getEntriesByType('resource').some(r => r.name.endsWith('.glb'))", timeout=60000)
        ride(page, h, "ring"); into_room(page, 0, "eiffel")
        page.wait_for_function("() => window.__mm.eiffel().loaded === true", timeout=120000)
        e = page.evaluate("() => window.__mm.eiffel()")
        fp = page.evaluate("() => window.__mm.eiffelFootprints()")
        push = page.evaluate("() => { const h = window.__mm.hideout(), t = h.room.tower, f = window.__mm.eiffel().feet; return { foot: window.__mm.pushAt(t.x + f[2][0], t.z + f[2][1], -600), centre: window.__mm.pushAt(t.x, t.z, -600) }; }")
        br.close()
    assert errors == []
    assert len(requests) == 1 and requests[0].endswith("/prototype/assets/models/eiffel_tower.glb"), requests
    assert e["placeholder"] is False and e["tris"] >= 400000 and abs(e["height"] - 330) <= 2 and e["base"] <= 145 and e["material"] == "#6b4a32", e
    assert len(fp) == 4, fp
    for box in fp:                      # per-quadrant bbox of the model's vertices below 20 m, relative to the tower centre
        foot = min(e["feet"], key=lambda f: math.hypot(f[0] - (box["x0"] + box["x1"]) / 2, f[1] - (box["z0"] + box["z1"]) / 2))
        hw = e["footHw"] + 2
        assert foot[0] - hw <= box["x0"] and box["x1"] <= foot[0] + hw and foot[1] - hw <= box["z0"] and box["z1"] <= foot[1] + hw, (foot, box)
    assert math.hypot(push["foot"]["dx"], push["foot"]["dz"]) > 5, push      # a foot is solid
    assert math.hypot(push["centre"]["dx"], push["centre"]["dz"]) < 0.01, push  # between the legs is free


@needs_world
def test_eiffel_placeholder_survives_a_blocked_model(server):
    """With the GLB unreachable the primitive tower stays in the room, the error is noted, nothing breaks; the feet are solid either way."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        page.route("**/eiffel_tower.glb", lambda r: r.abort())
        h = page.evaluate("() => window.__mm.hideout()")
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 0, 0.1, [])")
        ride(page, h, "ring"); into_room(page, 0, "eiffel")
        page.wait_for_function("() => window.__mm.eiffel().error !== null", timeout=60000)
        e = page.evaluate("() => window.__mm.eiffel()"); counts = page.evaluate("() => window.__mm.counts")
        push = page.evaluate("() => { const h = window.__mm.hideout(), t = h.room.tower, f = window.__mm.eiffel().feet; return { foot: window.__mm.pushAt(t.x + f[2][0], t.z + f[2][1], -600), centre: window.__mm.pushAt(t.x, t.z, -600) }; }")
        br.close()
    assert errors == []
    assert e["placeholder"] is True and e["loaded"] is False and e["started"] is True and counts["eiffel"] == 1, e
    assert math.hypot(push["foot"]["dx"], push["foot"]["dz"]) > 5, push
    assert math.hypot(push["centre"]["dx"], push["centre"]["dz"]) < 0.01, push


@needs_world
def test_village_names_hidden_inside_the_cave_and_back_outside(server):
    """#258: the big village names are depth-test-free sprites, so they showed through the rock; the cavern has no sky."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        page.evaluate(f"() => window.__mm.place({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]})")
        page.wait_for_function("() => window.__mm.villageSprites().length > 0", timeout=120000)
        outside = [s["t"] for s in page.evaluate("() => window.__mm.villageSprites()")]
        c = page.evaluate("() => window.__mm.hideout().centre")
        page.evaluate(f"() => window.__mm.sim({c[0]}, {c[1]}, {HEADING}, 8, 0.5, [], {page.evaluate('() => window.__mm.hideout().floor')})")
        page.wait_for_function("() => window.__mm.cave().inside === true", timeout=120000)
        page.wait_for_function("() => window.__mm.villageSprites().length === 0", timeout=60000)
        page.evaluate(f"() => window.__mm.place({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]})")
        page.wait_for_function("() => window.__mm.cave().inside === false && window.__mm.villageSprites().length > 0", timeout=120000)
        br.close()
    assert errors == []
    assert outside, "no village name outside the cave"


@needs_world
def test_village_names_fade_out_with_the_tunnel_light_before_the_hard_switch(server):
    """#380: SCHUPFART floated in the access tunnel T1: the sprites ignore depth and only the hard cave switch (42 m in) hid them.
    They now follow the cave look (the portal veil), so the name is half gone at 24 m and gone for good by 36 m."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        mx, mz = h["mouth"]; ps = h["portalS"]; ux, uz = math.cos(HEADING), math.sin(HEADING)
        page.evaluate(f"() => window.__mm.place({mx + ux * (ps - 30)}, {mz + uz * (ps - 30)}, {HEADING})")
        page.wait_for_function("() => window.__mm.villageSprites().length > 0", timeout=120000)
        rows = {}
        for d in (24, 38):
            x, z = mx + ux * (ps + d), mz + uz * (ps + d)
            page.evaluate(f"() => {{ window.__mm.place({x}, {z}, {HEADING}); window.__mm.sim({x}, {z}, {HEADING}, 0.1, 0.05, [], window.__mm.car().y); }}")
            page.wait_for_timeout(1500)
            rows[d] = page.evaluate("() => ({ veil: window.__mm.cave().veil, sprites: window.__mm.villageSprites().map(s => [s.t, s.opacity]), names: window.__mm.villages().map(v => [v.t, v.opacity]) })")
        br.close()
    assert errors == []
    mid = rows[24]
    assert 0.2 < mid["veil"] < 0.8, mid
    for t, opacity in mid["sprites"]:
        base = dict(mid["names"])[t]
        assert abs(opacity - base * (1 - mid["veil"])) < 0.05, (t, opacity, base, mid["veil"])
    assert rows[38]["sprites"] == [], rows[38]


@needs_world
def test_cave_light_stays_daylight_until_the_deep_point_and_the_tunnel_darkens_locally(server):
    """Driving in from 30 m outside the gate to 60 m into the tunnel: the scene's fog, sky, ambient and sun are the day's own until the
    deep point (CAVE_SWITCH_IN), where the whole cave look takes over; before that the tunnel's lining is what darkens it. The
    maintainer: 'it should never be dark outside' -- the cave look used to fade in from the gate, darkening the world seen through the
    opening."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        mx, mz = h["mouth"]; ps = h["portalS"]; ux, uz = math.cos(HEADING), math.sin(HEADING)
        rows = []
        for d in list(range(-30, 41, 5)) + list(range(45, 61, 5)):
            x, z = mx + ux * (ps + d), mz + uz * (ps + d)
            page.evaluate(f"() => {{ window.__mm.place({x}, {z}, {HEADING}); window.__mm.sim({x}, {z}, {HEADING}, 0.1, 0.05, [], window.__mm.car().y); }}")
            rows.append((d, page.evaluate("() => window.__mm.cave()")))
        br.close()
    assert errors == []
    by = dict(rows); day = by[-30]
    assert day["fog"] == "#e8bd8c" and day["dark"] is True, day
    for d, r in rows:
        if d <= 10:   # #379: the day look holds where the opening is near; from there to the deep point it fades (test_t1_fades...)
            assert r["fog"] == day["fog"] and r["skyTop"] == day["skyTop"] and r["hemi"] == day["hemi"] and r["sun"] == day["sun"], (d, r)
        if d <= 35:
            assert r["dark"] is True and r["on"] is False, (d, r)
    for d in (45, 50, 60):
        assert by[d]["fog"] == "#07080a" and by[d]["dark"] is False and by[d]["on"] is True, (d, by[d])


def rendered_frame(page, tries=5):
    """The game's own next-frame PNG as a grey PIL image. A capture with every pixel 0 is no game frame (even the darkest spoke
    frame has the lit car in it): the gpu-odroid CI runner (Intel UHD) now and then hands one back -- a daylight view read 0.0 --
    so it is taken again; a frame that stays all black is reported as such, not as a cut or a dark scene."""
    import base64, io
    from PIL import Image
    for _ in range(tries):
        url = page.evaluate("() => window.__mm.photoUrl()")
        img = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("L")
        if img.getextrema() != (0, 0):
            return img
        page.wait_for_timeout(500)
    state = page.evaluate("""async () => { const c = document.getElementById('gl'), gl = c.getContext('webgl2');
      return { lost: gl ? gl.isContextLost() : 'none', glError: gl ? gl.getError() : null, size: [c.width, c.height], frameMs: await window.__mm.frameMs(10),
               car: window.__mm.car(), cave: window.__mm.cave() }; }""")
    raise AssertionError(f"the rendered frame was entirely black {tries} times in a row (renderer/GPU problem): {state}")


def crop_brightness(page):
    """Mean grey of the frame's middle (the opening, looking out of the portal), from the game's own next-frame PNG."""
    from PIL import ImageStat
    img = rendered_frame(page); w, h = img.size
    return ImageStat.Stat(img.crop((int(w * 0.42), int(h * 0.35), int(w * 0.58), int(h * 0.55)))).mean[0]


@needs_world
def test_the_opening_seen_from_inside_the_tunnel_is_as_bright_as_outside(server):
    """Standing 10 m inside looking out of the portal, the picture at the opening is daylight, not black ('it should never be dark
    outside'). Compared with the same view from 15 m outside the gate."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        mx, mz = h["mouth"]; ps = h["portalS"]; ux, uz = math.cos(HEADING), math.sin(HEADING)
        def shot(d):
            x, z = mx + ux * (ps + d), mz + uz * (ps + d); th = HEADING + math.pi
            page.evaluate(f"() => {{ window.__mm.place({x}, {z}, {th}); window.__mm.sim({x}, {z}, {th}, 0.1, 0.05, [], window.__mm.car().y); }}")
            page.wait_for_timeout(4000)
            return page.evaluate("() => window.__mm.cave()"), crop_brightness(page)
        inside, bi = shot(10)
        outside, bo = shot(-15)
        br.close()
    assert errors == []
    assert inside["inside"] is True and outside["inside"] is False, (inside, outside)
    assert bo > 25, f"the outside reference is itself dark: {bo}"
    assert bi > 0.7 * bo, f"the opening seen from 10 m inside is dark: {bi:.0f} vs outside {bo:.0f}"


RECORD_RIDE = """async () => {
  const rows = []; const t0 = performance.now(); let rode = false;
  while (performance.now() - t0 < 200000) {
    await new Promise(r => requestAnimationFrame(r));
    const l = window.__mm.lift(); if (l.phase !== 'idle') rode = true; else if (rode) break;
    rows.push({ phase: l.phase, scroll: l.scroll, indicator: l.indicator });
  }
  return rows;
}"""


def descent_rows(page):
    return [r for r in page.evaluate(RECORD_RIDE) if r["phase"] == "descending"]


@needs_world
def test_lift_shaft_pattern_rises_riding_down_and_sinks_riding_up(server):
    """Three.js samples uv + offset: a growing offset.y moves the shaft wall's pattern DOWN on screen. Riding down it must rise past
    the car (offset.y shrinks) and riding up it must sink; the floor indicator counts -1 .. -12 down and -12 .. -1 up."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        enter_cabin(page, h, "ring"); page.evaluate("() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 2, open: 0.1})")
        down = descent_rows(page)
        page.wait_for_function(RIDE_DONE, arg="ring", timeout=240000)
        enter_cabin(page, h, "surface"); page.evaluate("() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 2, open: 0.1})")   # off the cabin re-arms the lift, then back in for the ride up
        up = descent_rows(page)
        br.close()
    assert errors == []
    assert len(down) > 5 and len(up) > 5, (len(down), len(up))
    assert down[-1]["scroll"] < down[0]["scroll"], (down[0], down[-1])
    assert up[-1]["scroll"] > up[0]["scroll"], (up[0], up[-1])
    steps = lambda rows: [r["scroll"] - q["scroll"] for q, r in zip(rows, rows[1:])]
    assert all(s <= 1e-9 for s in steps(down)) and all(s >= -1e-9 for s in steps(up))
    nums = lambda rows: [int(r["indicator"].replace("−", "-")) for r in rows]   # the full -1 .. -12 count is lift.test.mjs's (exact, no render time)
    assert nums(down)[0] == -1 and nums(down)[-1] < -1 and nums(down) == sorted(nums(down), reverse=True), nums(down)
    assert nums(up)[0] == -12 and nums(up)[-1] > -12 and nums(up) == sorted(nums(up)), nums(up)


RECORD_DECK = """async () => {
  const rows = []; const t0 = performance.now(); let rode = false;
  while (performance.now() - t0 < 200000) {
    await new Promise(r => requestAnimationFrame(r));
    const l = window.__mm.lift(); if (l.phase !== 'idle') rode = true; else if (rode) break;
    rows.push({ phase: l.phase, level: l.level, deck: l.deck, trees: window.__mm.cave().treesVisible });
  }
  return rows;
}"""


@needs_world
def test_the_cabin_deck_stays_drawn_through_the_whole_ride_both_ways(server):
    """#382: riding up, the level switches to the surface at the ride's midpoint (floor -6); the hall's deck and shaft house (the cave
    group) were only drawn again once the car could drive (followCave in stepCar), so for half the ride the car stood on the hill's
    blotchy ground with the forest and the day look on. In every frame of both rides the deck under the car is drawn."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        enter_cabin(page, h, "ring"); page.evaluate("() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 2, open: 0.3})")
        down = page.evaluate(RECORD_DECK)
        page.wait_for_function(RIDE_DONE, arg="ring", timeout=240000)
        enter_cabin(page, h, "surface"); page.evaluate("() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 2, open: 0.3})")
        up = page.evaluate(RECORD_DECK)
        br.close()
    assert errors == []
    for rows in (down, up):
        assert {r["level"] for r in rows} == {"surface", "ring"}, rows   # the ride crosses the switch: both levels are sampled
        assert all(r["deck"] for r in rows), [r for r in rows if not r["deck"]]
        assert not any(r["trees"] for r in rows), [r for r in rows if r["trees"]]   # the forest on the hill is never drawn in the shaft


SWITCH_PROBE = """async ({x, z, th, y}) => {
  window.__mm.place(x, z, th); window.__mm.sim(x, z, th, 0.1, 0.05, [], y);
  const c = window.__mm.cave(); return { inside: c.inside, on: c.on, trees: c.treesVisible, shadows: c.shadows, group: c.visible };
}"""


@needs_world
def test_cave_switches_happen_deep_in_the_tunnel_not_at_the_portal(server):
    """The forest, the shadow map and the interior are hard switches; they must not flip where the portal is in view. Driving in and
    out along T1 they flip once each way, deep inside (past the 30 m light fade). Measured before: all of them at 0 m, the portal."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        page.evaluate("() => window.__mm.setStyle('smooth')")   # the style with a sun shadow map ('original' has none to switch)
        h = page.evaluate("() => window.__mm.hideout()")
        mx, mz = h["mouth"]; ps = h["portalS"]; ux, uz = math.cos(HEADING), math.sin(HEADING)
        def probe(d):
            x, z = mx + ux * (ps + d), mz + uz * (ps + d)
            return page.evaluate(SWITCH_PROBE, {"x": x, "z": z, "th": HEADING, "y": page.evaluate("() => window.__mm.car().y")})
        ins = [(d, probe(d)) for d in range(-10, 61, 2)]
        outs = [(d, probe(d)) for d in range(60, -11, -2)]
        br.close()
    assert errors == []
    def first(rows, key, want): return next(d for d, r in rows if r[key] == want)
    assert any(r["inside"] for d, r in ins if 0 < d <= 10), "the car is under the hill a few metres in"
    for d, r in ins + outs:
        if d <= 30:
            assert r["trees"] is True and r["shadows"] is True and r["on"] is False, (d, r)
        if d <= 10:
            assert r["group"] is False, (d, r)   # #379: the hall's lamps fade in with the look (test_t1_fades...), not switched at the deep point
    for key, off in (("trees", False), ("shadows", False), ("on", True)):
        went_in = first(ins, key, off); went_out = first(outs, key, not off)
        assert 35 <= went_in <= 50, (key, "in", went_in)
        assert 30 <= went_out <= 45 and went_out < went_in, (key, "out", went_out)


T1_STEP = """async ({x, z, th}) => {
  window.__mm.place(x, z, th); window.__mm.sim(x, z, th, 3, 0.05, [], window.__mm.car().y);
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  const c = window.__mm.cave(); return { k: c.k, group: c.visible, veil: c.veil, lining: c.lining, lamps: c.lamps, house: c.liftHouse, on: c.on, hemi: c.hemi };
}"""


@needs_world
def test_t1_fades_between_day_and_cave_without_a_cut_both_ways(server):
    """#379: driving into T1 the view jumped at 42 m from the day look (grey end, no hall) to the cave look (lit hall, lift door), and
    driving out from dark to sunlight and trees at 36 m. Stepping 2 m at a time both ways: the look's blend k, the hall lamps, the
    lining and the portal's veil change in small steps only, the lift house is drawn the whole way (no pop-in), the lamps' group only
    appears or goes while it gives no light, and the rendered middle of the picture never jumps."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        mx, mz = h["mouth"]; ps = h["portalS"]; ux, uz = math.cos(HEADING), math.sin(HEADING)
        runs = {}
        for name, ds, th in (("in", range(-6, 61, 2), HEADING), ("out", range(60, -7, -2), HEADING + math.pi)):
            rows = []; d0 = ds[0]
            page.evaluate(T1_STEP, {"x": mx + ux * (ps + d0), "z": mz + uz * (ps + d0), "th": th}); page.wait_for_timeout(1500)   # the chase camera settles after the jump
            for d in ds:
                r = page.evaluate(T1_STEP, {"x": mx + ux * (ps + d), "z": mz + uz * (ps + d), "th": th}); r["d"] = d; r["lum"] = crop_brightness(page); rows.append(r)
            runs[name] = rows
        hover = [page.evaluate(T1_STEP, {"x": mx + ux * (ps + 39 + 2.5 * math.sin(i)), "z": mz + uz * (ps + 39 + 2.5 * math.sin(i)), "th": HEADING}) for i in range(12)]
        br.close()
    assert errors == []
    for name, rows in runs.items():
        assert rows[0]["k"] == 0 or rows[-1]["k"] == 0, name
        assert max(r["k"] for r in rows) == 1, name
        assert all(r["house"] for r in rows), (name, [r["d"] for r in rows if not r["house"]])
        for a, b in zip(rows, rows[1:]):
            assert abs(b["k"] - a["k"]) <= 0.2, (name, a["d"], b["d"], a["k"], b["k"])
            assert abs(b["veil"] - a["veil"]) <= 0.2 and abs(b["lining"] - a["lining"]) <= 0.2, (name, a, b)
            if a["group"] != b["group"]:
                assert max(a["k"], b["k"]) <= 0.05, ("the lamps popped", name, a, b)
            assert abs(b["lum"] - a["lum"]) <= 15, ("a cut in the picture", name, a["d"], b["d"], round(a["lum"]), round(b["lum"]))
    assert len({r["on"] for r in hover}) == 1 and max(r["k"] for r in hover) - min(r["k"] for r in hover) < 0.05, hover   # no flicker hovering at the deep point


# ---------- #361: the tunnel ring, the star of rooms, the dark switch ----------


def into_room(page, k, room_id):
    """From the ring level: drive from 45 m into spoke k past the switch (s 52)."""
    s = page.evaluate(f"() => window.__mm.spoke({k}, 45)")
    page.evaluate(f"() => window.__mm.sim({s['x']}, {s['z']}, {s['th']}, 10, 2, ['KeyW'], -600)")
    page.wait_for_function(f"() => window.__mm.below().level === '{room_id}'", timeout=120000)


def back_to_ring(page, k):
    """From room k at 60 m into its spoke: drive back out past the switch (s 48)."""
    s = page.evaluate(f"() => window.__mm.spoke({k}, 60)")
    page.evaluate(f"() => window.__mm.sim({s['x']}, {s['z']}, {s['th'] + math.pi}, 10, 2, ['KeyW'], -600)")
    page.wait_for_function("() => window.__mm.below().level === 'ring'", timeout=120000)


@needs_world
def test_ride_down_lands_in_the_ring_and_finds_the_hideout(server):
    """Drive into the cabin, stand still: door shuts, descent, the ring-side door opens; the find toast comes only now; only the Eiffel and Atomium spokes are signed; no room is built yet."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        assert page.evaluate("() => window.__mm.hideout().found") is False
        ride(page, h, "ring")
        lift = page.evaluate("() => window.__mm.lift()"); below = page.evaluate("() => window.__mm.below()")
        toast = page.evaluate("() => window.__mm.toast()"); car = page.evaluate("() => window.__mm.car()")
        found = page.evaluate("() => window.__mm.hideout().found"); stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        cave_on = page.evaluate("() => window.__mm.cave().on")
        labels = page.evaluate("() => window.__mm.labels()"); body_below = page.evaluate("() => document.body.classList.contains('below')")
        hud = page.evaluate(HUD_SHOWN)
        br.close()
    assert errors == []
    assert lift["cabin"] == "bottom" and lift["level"] == "ring" and lift["door"] > 0.9, lift
    assert below["level"] == "ring" and below["ring"] is True and below["built"] is None and below["signs"] == [], below
    assert len(below["rooms"]) == 8 and below["rooms"][:2] == ["eiffel", "atomium"], below
    assert hud == {"arrow": False, "dist": False, "cpname": False}, hud        # no checkpoint arrow / distance / label below
    assert abs(car["y"] + 600) < 1.0 and found is True and stored == "1"
    assert cave_on is False and labels == [] and body_below is True
    assert "Hideout found" in toast["text"] or "Versteck gefunden" in toast["text"], toast


@needs_world
def test_spoke_zero_leads_into_the_eiffel_room_and_back_to_the_ring(server):
    """Driving along spoke 0 past its dark stretch switches the level to the Eiffel room (no teleport, no toast, speed kept); driving
    back switches to the ring again. The switch has hysteresis: 50 m in is still the ring either way."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        s = page.evaluate("() => window.__mm.spoke(0, 45)")
        page.evaluate(f"() => window.__mm.sim({s['x']}, {s['z']}, {s['th']}, 10, 0.1, [], -600)")
        before = page.evaluate("() => ({ below: window.__mm.below(), car: window.__mm.car() })")
        into_room(page, 0, "eiffel")
        room = page.evaluate("() => ({ below: window.__mm.below(), car: window.__mm.car(), lvl: window.__mm.level() })")
        s50 = page.evaluate("() => window.__mm.spoke(0, 50)")
        page.evaluate(f"() => window.__mm.sim({s50['x']}, {s50['z']}, {s50['th']}, 0, 0.1, [], -600)")
        mid = page.evaluate("() => window.__mm.below().level")
        back_to_ring(page, 0)
        ring = page.evaluate("() => window.__mm.below()")
        br.close()
    assert errors == []
    assert before["below"]["level"] == "ring" and before["below"]["spoke"]["k"] == 0 and before["below"]["built"] == 0, before
    assert room["below"]["level"] == "eiffel" and room["below"]["built"] == 0 and room["lvl"]["id"] == "eiffel", room
    assert abs(room["car"]["y"] + 600) < 1.0, room
    assert mid == "eiffel", mid               # standing at s 50 inside the room level stays there (switch back only at s <= 48)
    assert ring["level"] == "ring" and ring["built"] == 0, ring


def frame_brightness(page):
    """Mean grey of the whole rendered frame (the canvas only, no HUD), from the game's own next-frame PNG."""
    from PIL import ImageStat
    return ImageStat.Stat(rendered_frame(page)).mean[0]


SPOKE_STEP = """async ({k, s, back}) => {
  const p = window.__mm.spoke(k, s), th = back ? p.th + Math.PI : p.th;
  window.__mm.place(p.x, p.z, th); window.__mm.sim(p.x, p.z, th, 3, 0.05, [], -600);
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  const b = window.__mm.below(); return { level: b.level, dark: b.dark, fog: b.fog };
}"""


@needs_world
def test_spoke_fades_into_the_room_and_back_without_a_blackout_or_a_cut(server):
    """#379: ring -> room and back went almost fully black for ~4 s, then the room (lit tunnel, sky, landmark) appeared in one cut.
    Stepping 2 m at a time through spoke 0 both ways: the dark fade changes in small steps, the level swaps only where the fade is
    full (so the swap shows nothing), the picture's brightness never jumps, and it never goes pure black."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        runs = {}
        for name, ss, back in (("in", range(16, 85, 2), False), ("out", range(84, 15, -2), True)):
            page.evaluate(SPOKE_STEP, {"k": 0, "s": ss[0], "back": back}); page.wait_for_timeout(1500)   # the chase camera settles after the jump
            rows = []
            for s in ss:
                r = page.evaluate(SPOKE_STEP, {"k": 0, "s": s, "back": back}); r["s"] = s; r["lum"] = frame_brightness(page); rows.append(r)
            runs[name] = rows
        br.close()
    assert errors == []
    for name, rows in runs.items():
        assert {r["level"] for r in rows} == {"ring", "eiffel"}, name
        for a, b in zip(rows, rows[1:]):
            assert abs(b["dark"] - a["dark"]) <= 0.2, (name, a, b)
            if a["level"] != b["level"]:
                assert a["dark"] == 1 and b["dark"] == 1, ("the level swapped in view", name, a, b)
            assert abs(b["lum"] - a["lum"]) <= 12, ("a cut in the picture", name, a["s"], b["s"], round(a["lum"]), round(b["lum"]))
        assert min(r["lum"] for r in rows) > 3, ("pure black", name, [(r["s"], round(r["lum"])) for r in rows])


@needs_world
def test_one_room_built_at_a_time_and_empty_rooms_have_no_object(server):
    """Entering room 4's spoke builds room 4 (no tower, no Eiffel count) and nothing else; going back into room 0 builds the Eiffel room and
    throws room 4's meshes away."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        into_room(page, 4, "room4")
        three = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        back_to_ring(page, 4)
        into_room(page, 0, "eiffel")
        zero = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        br.close()
    assert errors == []
    assert three["below"]["built"] == 4 and three["below"]["level"] == "room4" and "eiffel" not in three["counts"], three
    assert three["below"]["object"] is False, three
    assert zero["below"]["built"] == 0 and zero["counts"]["eiffel"] == 1 and zero["below"]["object"] is True, zero


@needs_world
def test_atomium_room_builds_loads_its_model_on_entering_and_has_solid_feet(server):
    """#355: entering spoke 1 builds the Atomium room and fetches atomium.glb then (not before); the model stands 101 m tall on the floor,
    keeps its own textures, has no terrain patch, and the central column and a bipod foot are solid while the space between is free."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith("atomium.glb") else None)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        assert page.evaluate("() => window.__mm.atomium()") is None and requests == []
        into_room(page, 1, "atomium")
        page.wait_for_function("() => window.__mm.atomium() && window.__mm.atomium().loaded === true", timeout=120000)
        a = page.evaluate("() => window.__mm.atomium()")
        info = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        push = page.evaluate("() => { const t = window.__mm.below().tower, f = window.__mm.atomium().feet; return { column: window.__mm.pushAt(t.x, t.z, -600), foot: window.__mm.pushAt(t.x + f[1][0], t.z + f[1][1], -600), between: window.__mm.pushAt(t.x - 30, t.z, -600) }; }")
        br.close()
    assert errors == []
    assert len(requests) == 1 and requests[0].endswith("/prototype/assets/models/atomium.glb"), requests
    assert a["placeholder"] is False and 8000 <= a["tris"] <= 12000 and abs(a["height"] - 101.3) < 0.1 and a["material"] is None, a
    assert info["below"]["built"] == 1 and info["below"]["object"] is True and info["counts"].get("atomium") == 1 and "eiffel" not in info["counts"], info
    assert math.hypot(push["column"]["dx"], push["column"]["dz"]) > 5 and math.hypot(push["foot"]["dx"], push["foot"]["dz"]) > 5, push
    assert math.hypot(push["between"]["dx"], push["between"]["dz"]) < 0.01, push


@needs_world
def test_titanic_room_builds_loads_its_model_on_entering_and_has_a_solid_hull(server, tmp_path):
    """#422: entering spoke 7 builds the Titanic room and fetches titanic.glb then (not before); the ship lies 269 m long along the room's cross
    axis, 73 m tall, sunk by its 10.5 m draught into a kerbed water basin, and the hull is solid amidships while the water beside it is open
    ground, the kerb stops the car and the quay lane outside it and past the ends is free. Leaves a screenshot of the ship in tmp_path."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith("titanic.glb") else None)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        assert page.evaluate("() => window.__mm.titanic()") is None and requests == []
        into_room(page, 7, "room7")
        page.wait_for_function("() => window.__mm.titanic() && window.__mm.titanic().loaded === true", timeout=180000)
        t = page.evaluate("() => window.__mm.titanic()")
        info = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, th = window.__mm.spoke(7, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], p = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -600);
          const b = window.__mm.titanic().basin; return { mid: p(0, 0), bow: p(0, 125), side: p(40, 0), end: p(0, 150), kerb: p(b.w, 0), kerbEnd: p(0, b.end), quay: p(b.lane.w, 0), quayEnd: p(0, b.lane.end) }; }""")
        view = page.evaluate("() => { const r = window.__mm.hideout().room, v = window.__mm.below().tower, th = window.__mm.spoke(7, 0).th; return { x: v.x - Math.cos(th) * 150, z: v.z - Math.sin(th) * 150, th, y: r.y }; }")
        page.evaluate(f"() => window.__mm.sim({view['x']}, {view['z']}, {view['th']}, 0, 1.5, [], -600)")
        page.set_viewport_size({"width": 1280, "height": 720}); page.wait_for_timeout(1500)
        page.screenshot(path=str(tmp_path / "titanic-basin.png"))
        br.close()
    print("screenshot:", tmp_path / "titanic-basin.png")
    assert errors == []
    assert len(requests) == 1 and requests[0].endswith("/prototype/assets/models/titanic.glb"), requests
    assert t["placeholder"] is False and 250000 <= t["tris"] <= 330000 and abs(t["height"] - 72.9) < 0.1 and t["length"] == 269, t
    assert info["below"]["built"] == 7 and info["below"]["object"] is True and info["counts"].get("titanic") == 1 and "eiffel" not in info["counts"], info
    assert math.hypot(push["mid"]["dx"], push["mid"]["dz"]) > 0.5 and math.hypot(push["bow"]["dx"], push["bow"]["dz"]) > 2, push
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) < 0.01 for k in ("side", "end", "quay", "quayEnd")), push
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) > 0.3 for k in ("kerb", "kerbEnd")), push
    assert t["draught"] == 10.5 and abs(t["keel"] - (view["y"] - 10.5)) < 0.01 and t["basin"]["y"] > view["y"], (t, view)


@needs_world
def test_r_in_the_ring_and_in_a_room(server):
    """R on the ring level puts the car back at the lift exit's ring end (50 m from the lift centre along the heading); R in a room puts it
    at the room's portal, inside the lawn, and keeps the level."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        s = page.evaluate("() => window.__mm.spoke(5, 30)")
        page.evaluate(f"() => window.__mm.sim({s['x']}, {s['z']}, {s['th']}, 0, 0.1, [], -600)")
        page.keyboard.press("KeyR"); page.wait_for_timeout(300)
        in_ring = page.evaluate("() => ({ car: window.__mm.car(), lvl: window.__mm.level().id })")
        into_room(page, 0, "eiffel")
        page.evaluate("() => window.__mm.step(1, [])")
        page.keyboard.press("KeyR"); page.wait_for_timeout(300)
        in_room = page.evaluate("() => ({ car: window.__mm.car(), lvl: window.__mm.level().id, room: window.__mm.hideout().room })")
        br.close()
    assert errors == []
    lx, lz = h["lift"]["c"]
    assert in_ring["lvl"] == "ring" and abs(math.hypot(in_ring["car"]["x"] - lx, in_ring["car"]["z"] - lz) - 50) < 1, in_ring
    room = in_room["room"]; px, pz = room["portal"]["c"]
    assert in_room["lvl"] == "eiffel" and math.hypot(in_room["car"]["x"] - px, in_room["car"]["z"] - pz) < 25, in_room


@needs_world
def test_helicopter_is_refused_on_the_ring_level_and_in_a_spoke(server):
    """F stays refused below in the ring and its tunnels (no sky), with the usual toast; the car stays on the ground."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        s = page.evaluate("() => window.__mm.spoke(2, 30)")
        results = []
        for spot in (None, s):
            if spot:
                page.evaluate(f"() => window.__mm.sim({spot['x']}, {spot['z']}, {spot['th']}, 0, 0.1, [], -600)")
            page.keyboard.press("KeyF"); page.wait_for_timeout(500)
            results.append(page.evaluate("() => ({ toast: window.__mm.toast().text, flying: window.__mm.fly().on, y: window.__mm.car().y, lvl: window.__mm.level().id })"))
        br.close()
    assert errors == []
    for r in results:
        assert ("sky" in r["toast"] or "Himmel" in r["toast"]) and r["flying"] is False and abs(r["y"] + 600) < 1.0 and r["lvl"] == "ring", r



@needs_world
def test_artemis_room_builds_the_rocket_and_capsule_on_entering_without_a_download(server, tmp_path):
    """#488: entering spoke 2 builds the Artemis II stack (98.1 m on its mount) and the Orion capsule from primitives -- no model file is
    fetched; the core, the mount's edge and the capsule are solid, the lawn beside the mount and the capsule's ring are open. Leaves a screenshot."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        assert page.evaluate("() => window.__mm.artemis()") is None
        into_room(page, 2, "room2")
        page.wait_for_function("() => window.__mm.artemis() && window.__mm.artemis().built === 2", timeout=120000)
        a = page.evaluate("() => window.__mm.artemis()")
        info = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, th = window.__mm.spoke(2, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], p = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -600);
          const c = window.__mm.artemis().capsule; return { core: p(0, 0), mount: p(0, 11), beside: p(0, 30), capsule: window.__mm.pushAt(c.x, c.z, -600), ring: p(-50, 45 + 11) }; }""")
        view = page.evaluate("() => { const v = window.__mm.below().tower, th = window.__mm.spoke(2, 0).th; return { x: v.x - Math.cos(th) * 150, z: v.z - Math.sin(th) * 150, th }; }")
        page.evaluate(f"() => window.__mm.sim({view['x']}, {view['z']}, {view['th']}, 0, 1.5, [], -600)")
        page.set_viewport_size({"width": 1280, "height": 720}); page.wait_for_timeout(1500)
        page.screenshot(path=str(tmp_path / "artemis-room.png"))
        br.close()
    print("screenshot:", tmp_path / "artemis-room.png")
    assert errors == []
    assert requests == [], requests
    assert a["built"] == 2 and abs(a["h"] - 98.1) < 1e-6 and 1000 <= a["tris"] <= 20000 and a["colliders"] == 5, a
    assert info["below"]["built"] == 2 and info["below"]["level"] == "room2" and info["below"]["object"] is True and info["counts"].get("artemis") == 1 and "eiffel" not in info["counts"], info
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) > 0.5 for k in ("core", "mount", "capsule")), push
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) < 0.01 for k in ("beside", "ring")), push
