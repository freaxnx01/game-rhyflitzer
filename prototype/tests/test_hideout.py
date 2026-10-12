"""#102 / #201 / #277: the secret hideout in the Hübel -- a tunnel into the hill, a cave system of rooms and corridors behind it,
ending in a lift lobby; a freight lift takes the car down to a 500 m meadow with the life-size Eiffel Tower, found when the
doors open below. Needs the real world and terrain (the hill is swisstopo's). Slow (Playwright): run in the foreground."""
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


def t2b_point(h, before_door):
    """A point on T2b's axis `before_door` metres before the lobby's edge, and T2b's heading (N1 -> lobby)."""
    (n1x, n1z), (hx, hz), r = h["rooms"]["n1"]["c"], h["rooms"]["lobby"]["c"], h["rooms"]["lobby"]["r"]
    length = math.hypot(hx - n1x, hz - n1z); ux, uz = (hx - n1x) / length, (hz - n1z) / length
    s = length - r - before_door
    return (n1x + ux * s, n1z + uz * s), math.atan2(uz, ux)


@needs_world
def test_floor_lid_rooms_and_walls(server):
    """The rooms are the spec's: one floor (the cut), the hill 40+ m over every room, the lobby 14 m high at T2b's end, ring walls,
    corridor walls and two bricked-up stubs; the whole system stays inside the triangle budget."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        assert h is not None
        cx, cz = h["centre"]; hx, hz = h["rooms"]["lobby"]["c"]; n1x, n1z = h["rooms"]["n1"]["c"]
        probes = page.evaluate(f"() => [[{cx}, {cz}], [{hx}, {hz}], [{n1x}, {n1z}]].map(([x, z]) => window.__mm.probe(x, z).terrain)")
        sky = page.evaluate(f"() => window.__mm.skyGround({cx}, {cz})")
        roofed_mouth = page.evaluate(f"() => window.__mm.roofed({h['mouth'][0]}, {h['mouth'][1]})")
        counts = page.evaluate("() => window.__mm.counts")
        # inward from outside the hill at 2 m over the cavern floor: the first thing is the ring wall's outer face.
        # The target must sit inside the disc, where terrainH is the floor -- the hook takes `up` over the target.
        wall = page.evaluate(f"() => window.__mm.wallRoleAt({cx + 40}, {cz}, {cx + 21}, {cz}, 2)")
        # down T2a from R0's centre: open all the way to N1
        open_t2a = page.evaluate(f"() => window.__mm.wallRoleAt({cx}, {cz}, {n1x}, {n1z}, 2)")
        # stub E leaves R0 at 45 deg: 20 m from the centre it starts, 15 m on it is bricked up
        ex, ez = cx + math.cos(math.pi / 4) * 35, cz + math.sin(math.pi / 4) * 35
        stub = page.evaluate(f"() => window.__mm.wallRoleAt({cx}, {cz}, {ex}, {ez}, 2)")
        sx, sz = cx + math.cos(math.pi / 4) * 34.2, cz + math.sin(math.pi / 4) * 34.2       # 14.2 m into the stub: inside the end wall
        push = page.evaluate(f"() => window.__mm.pushAt({sx}, {sz}, {h['floor']})")
        br.close()
    assert errors == []
    assert 8 <= h["portalS"] <= 20, h
    assert all(abs(t - h["floor"]) < 0.3 for t in probes), (probes, h)
    assert h["lid"] - h["floor"] >= 40, h
    assert sky >= h["lid"], (sky, h)
    assert roofed_mouth is False
    assert h["rooms"]["lobby"]["c"] == [-790, 1855] and h["rooms"]["lobby"]["r"] == 22, h["rooms"]
    assert abs(h["rooms"]["lobby"]["ceiling"] - (h["floor"] + 14)) < 1e-6 and "hall" not in h["rooms"], h["rooms"]
    assert h["rooms"]["r0"]["r"] == 22 and math.hypot(cx - -712.8, cz - 1528.2) < 0.1, h["rooms"]
    assert h["stubs"] == 2 and h["lamps"] == 4 and h["walls"] >= 24, h
    assert h["lidTris"] > 0 and h["floorTris"] > 0 and h["lidTris"] + h["floorTris"] < 120000, h
    assert "eiffel" not in counts, counts            # #277: the room is built on the first ride, not at start
    assert h["found"] is False
    assert wall == "stone", wall
    assert open_t2a is None, open_t2a
    assert stub == "stone", stub
    assert push["dx"] * -math.cos(math.pi / 4) + push["dz"] * -math.sin(math.pi / 4) > 0.3, push   # pushed back towards R0


def jump_list(page):
    page.keyboard.press("KeyJ")
    page.wait_for_function("() => !document.getElementById('jump').hidden")
    names = [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
    page.keyboard.press("Escape")
    page.wait_for_function("() => document.getElementById('jump').hidden")
    return names


LIFT_FAST = "() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 0.4, open: 0.1})"
RIDE_DONE = "(lvl) => window.__mm.lift().level === lvl && window.__mm.lift().phase === 'idle'"


def drive_onto_the_lift(page, h):
    """Stand the car, at rest, on the platform; the loop's own frames then count the dwell."""
    lx, lz = h["lift"]["c"]
    page.evaluate(f"() => window.__mm.place({lx}, {lz}, {h['lift']['th']})")


def ride_down(page, h):
    page.evaluate(LIFT_FAST); drive_onto_the_lift(page, h)
    page.wait_for_function(RIDE_DONE, arg="eiffel", timeout=240000)


@needs_world
def test_tunnel_and_lobby_are_no_find(server):
    """Listed in J from the start; drive from the Hübel into the hill: R0 and the lobby at T2b's end are no find (#277: the find is
    the lift's doors opening below)."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        assert "Reservoir Hübel" in jump_list(page)   # #102: always in the list, found or not
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        r = page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 8, ['KeyW'])")
        in_r0 = page.evaluate("() => ({ found: window.__mm.hideout().found, stored: localStorage.getItem('mm.hideout'), room: window.__mm.roomAt(window.__mm.car().x, window.__mm.car().z), cave: window.__mm.cave() })")
        (px, pz), th = t2b_point(h, 60)
        r2 = page.evaluate(f"() => window.__mm.sim({px}, {pz}, {th}, 16, 6, ['KeyW'], {h['floor']})")
        room = page.evaluate("() => window.__mm.roomAt(window.__mm.car().x, window.__mm.car().z)")
        found = page.evaluate("() => window.__mm.hideout().found")
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        br.close()
    assert errors == []
    assert math.hypot(r["x"] - cx, r["z"] - cz) < 23, (r, h)
    assert abs(r["y"] - h["floor"]) < 1.0, (r, h)
    assert in_r0["room"] == "r0" and in_r0["cave"]["inside"] is True, in_r0
    assert room == "lobby" and abs(r2["y"] - h["floor"]) < 1.0, (room, r2, h)
    assert in_r0["found"] is False and found is False and stored is None and in_r0["stored"] is None


HUD_SHOWN = "() => Object.fromEntries(['arrow', 'dist', 'cpname'].map(i => [i, getComputedStyle(document.getElementById(i)).display !== 'none']))"


@needs_world
def test_lift_ride_finds_the_hideout_and_the_room(server):
    """Drive onto the lift, stand still: gate, descent, doors open below; the find toast comes only now; the room is the Eiffel room."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate(LIFT_FAST)
        assert page.evaluate("() => window.__mm.hideout().found") is False
        drive_onto_the_lift(page, h)
        page.wait_for_function(RIDE_DONE, arg="eiffel", timeout=240000)
        car = page.evaluate("() => window.__mm.car()")
        toast = page.evaluate("() => window.__mm.toast()")
        found = page.evaluate("() => window.__mm.lift().found"); stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        cave_on = page.evaluate("() => window.__mm.cave().on")
        labels = page.evaluate("() => window.__mm.labels()"); below = page.evaluate("() => document.body.classList.contains('below')")
        hud_room = page.evaluate(HUD_SHOWN)
        br.close()
    assert errors == []
    assert hud_room == {"arrow": False, "dist": False, "cpname": False}, hud_room        # no checkpoint arrow / distance / label in the room
    assert abs(car["y"] + 600) < 1.0, car
    assert found is True and stored == "1"
    assert "Hideout found" in toast["text"] or "Versteck gefunden" in toast["text"], toast
    assert cave_on is False and labels == [] and below is True


@needs_world
def test_driving_across_the_platform_without_stopping_does_nothing(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate(LIFT_FAST)
        lx, lz = h["lift"]["c"]; th = h["lift"]["th"]
        page.evaluate(f"() => window.__mm.sim({lx - math.cos(th) * 30}, {lz - math.sin(th) * 30}, {th}, 14, 3, ['KeyW'], {h['floor']})")
        page.wait_for_timeout(1500)
        state = page.evaluate("() => window.__mm.lift()")
        br.close()
    assert errors == []
    assert state["level"] == "surface" and state["phase"] == "idle", state


@needs_world
def test_room_drive_under_the_tower_and_ride_back_up(server):
    """Below: the tree ring stops the car, the car drives under the tower, R stays below, the lift takes it up to the lobby."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride_down(page, h)
        tx, tz = h["room"]["tower"]["x"], h["room"]["tower"]["z"]
        page.evaluate(f"() => window.__mm.place({tx}, {tz}, {h['lift']['th']})")     # under the tower, between the legs
        assert page.evaluate("() => window.__mm.level().id") == "eiffel"
        under = page.evaluate("() => window.__mm.car()")
        cx, cz = h["room"]["centre"]; half = h["room"]["half"]
        page.evaluate(f"() => window.__mm.sim({cx}, {cz + half - 60}, {math.pi / 2}, 25, 4, ['KeyW'], -600)")   # the tree ring ends the run
        end = page.evaluate("() => window.__mm.car()")
        page.keyboard.press("KeyR"); page.wait_for_timeout(300)
        lvl = page.evaluate("() => window.__mm.level().id")
        lx, lz = h["lift"]["c"]; c = page.evaluate("() => window.__mm.car()")
        th = h["lift"]["th"]                                                         # ride up: off the platform (re-arms the lift), then back on, at rest
        page.evaluate(f"() => window.__mm.sim({lx + math.cos(th) * 12}, {lz + math.sin(th) * 12}, {th + math.pi}, 0, 0.2, [], -600)")
        drive_onto_the_lift(page, h)
        page.wait_for_function(RIDE_DONE, arg="surface", timeout=240000)
        up = page.evaluate("() => window.__mm.car()")
        hud_surface = page.evaluate(HUD_SHOWN)
        br.close()
    assert errors == []
    assert hud_surface == {"arrow": True, "dist": True, "cpname": True}, hud_surface         # back on the surface the race HUD is back
    assert abs(under["y"] + 600) < 1.0 and math.hypot(under["x"] - tx, under["z"] - tz) < 1, under
    assert end["z"] < cz + half - 2, end
    assert lvl == "eiffel" and math.hypot(c["x"] - lx, c["z"] - lz) < 3, (lvl, c)
    assert abs(up["y"] - h["floor"]) < 1.0 and math.hypot(up["x"] - lx, up["z"] - lz) < 9, up


@needs_world
def test_room_helicopter_flies_inside_the_clamp_lands_on_the_floor_and_the_lift_works(server):
    """In the room F takes off, the helicopter stays inside the soft wall and under the ceiling when pushed out and up,
    F lands on the room floor, and the lift up still works. In the tunnel F is still refused."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride_down(page, h)
        cx, cz = h["room"]["centre"]; lx, lz = h["lift"]["c"]; th = h["lift"]["th"]
        page.evaluate(f"() => window.__mm.place({cx - 120}, {cz}, 0)")
        page.keyboard.press("KeyF"); page.wait_for_timeout(300)
        page.wait_for_function("() => window.__mm.fly().on && window.__mm.fly().y > -600", timeout=60000)   # a loaded headless run may not have stepped a frame yet
        on = page.evaluate("() => window.__mm.fly()")
        out = page.evaluate("() => window.__mm.flySim(40, ['KeyW', 'Space', 'KeyN'])")   # forward (+x) and up, nitro
        page.evaluate(f"() => window.__mm.place({cx}, {cz - 100}, {-math.pi / 2})")
        side = page.evaluate("() => window.__mm.flySim(40, ['KeyW', 'Space'])")
        page.keyboard.press("KeyF"); page.wait_for_timeout(300)
        landed = page.evaluate("() => ({ fly: window.__mm.fly().on, car: window.__mm.car(), lvl: window.__mm.level().id })")
        page.evaluate(f"() => window.__mm.sim({lx + math.cos(th) * 12}, {lz + math.sin(th) * 12}, {th + math.pi}, 0, 0.2, [], -600)")
        drive_onto_the_lift(page, h)
        page.wait_for_function(RIDE_DONE, arg="surface", timeout=240000)
        up = page.evaluate("() => window.__mm.car()")
        # the tunnel (roofed, surface level) still refuses
        (px, pz), tth = t2b_point(h, 60)
        page.evaluate(f"() => window.__mm.sim({px}, {pz}, {tth}, 0, 0.1, ['KeyW'], {h['floor']})")
        page.keyboard.press("KeyF"); page.wait_for_timeout(500)
        tunnel = page.evaluate("() => ({ toast: window.__mm.toast().text, flying: window.__mm.fly().on })")
        br.close()
    assert errors == []
    assert on["on"] is True and on["y"] > -600
    assert out["x"] <= cx + 225 + 0.01 and out["y"] <= -600 + 420 + 0.5 and out["y"] > -600, out
    assert side["on"] is True and side["y"] <= -600 + 420 + 0.5 and side["z"] >= cz - 225 - 0.01, side
    assert landed["fly"] is False and landed["lvl"] == "eiffel" and abs(landed["car"]["y"] + 600) < 1.0, landed
    assert abs(up["y"] - h["floor"]) < 1.0, up
    assert tunnel["flying"] is False and ("sky" in tunnel["toast"] or "Himmel" in tunnel["toast"]), tunnel


@needs_world
def test_room_helicopter_climbs_past_the_tower_top_and_sinks_back(server):
    """In the room, holding Space climbs steadily to above the 330 m tower top within ~20 s (it crawled at ~0.5 m/s because the
    clamp pulled the target altitude down to the lagging height every frame); Shift sinks again; always inside the clamp."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); ride_down(page, h)
        cx, cz = h["room"]["centre"]
        page.evaluate(f"() => window.__mm.place({cx - 120}, {cz}, 0)")
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
    """J (placeOnRoad) from the room puts the car on the surface; a lift ride in a race counts like a jump."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        page.evaluate("() => window.__mm.raceNow()")   # a running race: the ride must flag it
        ride_down(page, h)
        jumped = page.evaluate("() => window.__mm.raceFlags().jumped")
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.getElementById('jump').hidden")
        page.keyboard.type("reservoir"); page.keyboard.press("Enter")
        page.wait_for_function("() => document.getElementById('jump').hidden")
        lvl = page.evaluate("() => window.__mm.level().id"); y = page.evaluate("() => window.__mm.car().y")
        below = page.evaluate("() => document.body.classList.contains('below')")
        br.close()
    assert errors == []
    assert jumped is True
    assert lvl == "surface" and y > -100 and below is False, (lvl, y, below)


@needs_world
def test_sky_ground_and_no_takeoff_inside(server):
    """The helicopter sees the hill over the cave, and F in R0, in T2b and in the lobby is refused with a toast."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]; hx, hz = h["rooms"]["lobby"]["c"]
        (px, pz), th = t2b_point(h, 60)
        results = []
        for x, z, heading, speed, secs, y in [(MOUTH_ROAD[0], MOUTH_ROAD[1], HEADING, 16, 8, "null"), (px, pz, th, 0, 0.1, h["floor"]), (hx + 10, hz, math.pi, 0, 0.1, h["floor"])]:
            page.evaluate(f"() => window.__mm.sim({x}, {z}, {heading}, {speed}, {secs}, ['KeyW'], {y})")
            page.keyboard.press("KeyF")
            page.wait_for_timeout(500)
            results.append(page.evaluate("() => ({ toast: window.__mm.toast().text, car: window.__mm.car(), flying: window.__mm.fly().on })"))
        sky = page.evaluate(f"() => [window.__mm.skyGround({cx}, {cz}), window.__mm.skyGround({hx}, {hz})]")
        br.close()
    assert errors == []
    for r in results:
        assert "sky" in r["toast"] or "Himmel" in r["toast"], r
        assert r["flying"] is False
        assert abs(r["car"]["y"] - h["floor"]) < 1.0, r
    assert sky[0] >= h["lid"] and sky[1] >= h["floor"] + 40, (sky, h)


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
    """Across T2a and across the lobby's footprint on the hilltop: the car stays on the hill, never under a ceiling, the cave stays
    off (not inside, nothing of the lobby drawn, every cave light off, the forest shown), no find."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        hx, hz = h["rooms"]["lobby"]["c"]; n1x, n1z = h["rooms"]["n1"]["c"]
        t2a = page.evaluate(CROSS_JS, [n1x + 45, n1z + 25, -math.pi / 2, 5])       # north across T2a's middle
        hall = page.evaluate(CROSS_JS, [hx - 60, hz, 0.0, 12])                    # east across the lobby's footprint
        lights = page.evaluate("() => window.__mm.hideoutLights()")
        top = page.evaluate(f"() => [[{hx}, {hz}], [{n1x + 45}, {n1z + 2}]].map(([x, z]) => ({{ top: window.__mm.topAt(x, z), hill: window.__mm.skyGround(x, z), roofed: window.__mm.roofed(x, z) }}))")
        found = page.evaluate("() => window.__mm.hideout().found")
        br.close()
    assert errors == []
    for r in (t2a, hall):
        assert r["roofed"] > 0 and r["minAboveLid"] > 0, (r["minAboveLid"], r["path"][:5])
        assert r["cave"]["inside"] is False and r["cave"]["visible"] is False and r["cave"]["treesVisible"] is True, r["cave"]
    assert all(not l["visible"] for l in lights), lights
    for t in top:
        assert t["roofed"] is True and t["top"]["role"] == "grass" and abs(t["top"]["y"] - t["hill"]) < 0.05, t
    assert found is False


@needs_world
def test_map_shows_the_hill_over_the_lobby(server):
    """The static map paints the hill's height over the lobby (and over R0), not the cave floor: the capped hill tint."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        px = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.lobby.c, [rx, rz] = h.centre; return [window.__mm.mapPixel(x, z), window.__mm.mapPixel(rx, rz)]; }")
        br.close()
    assert errors == []
    assert px[0] == px[1], px
    r, g, b, a = (int(v) for v in px[0].split(","))
    hill = [31 + (120 - 31) * 0.55, 42 + (140 - 42) * 0.55, 34 + (90 - 34) * 0.55]   # rgba(120,140,90,.55) over #1f2a22: a hill over 110 m
    assert all(abs(c - e) <= 2 for c, e in zip((r, g, b), hill)) and a == 255, (px[0], hill)


@needs_world
def test_forest_stands_on_the_lid(server):
    """Forest trees over the lobby are planted on the hill, not on the cave floor."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        low = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.lobby.c; return window.__FOREST.filter(t => Math.hypot(t[0] - x, t[1] - z) < 150).map(t => t[3] - window.__mm.skyGround(t[0], t[1])); }")
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
    """From the sky, every point over the ring-wall blocks of R0, N1 and the lobby hits the hill's grass at the hill's height: no stone
    pokes out."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        ring = page.evaluate("() => Object.fromEntries(Object.entries(window.__mm.hideoutRing()).map(([k, v]) => [k, v.length]))")
        blocks = page.evaluate(FOOTPRINT_JS)
        br.close()
    assert errors == []
    assert set(ring) == {"r0", "n1", "lobby"} and ring["r0"] >= 12 and ring["n1"] >= 6 and ring["lobby"] >= 6, ring
    assert len(blocks) == sum(ring.values())
    bad = [pt for blk in blocks for pt in blk if pt["role"] != "grass" or abs(pt["y"] - pt["hill"]) > 0.05]
    assert bad == [], (len(bad), bad[:6])


@needs_world
def test_no_find_on_top_of_the_hill(server):
    """Driving over R0 or the lobby on the hilltop (or flying over it) is no find: that needs the car under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        cavern = across(page, 105, 40, 8)
        h = page.evaluate("() => window.__mm.hideout()")
        hx, hz = h["rooms"]["lobby"]["c"]
        hall = page.evaluate(CROSS_JS, [hx, hz - 60, math.pi / 2, 8])     # right over the lobby, on the hilltop
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        found = page.evaluate("() => window.__mm.hideout().found")
        br.close()
    assert errors == []
    cx, cz = h["centre"]
    assert min(math.hypot(x - cx, z - cz) for x, z, _ in cavern["path"]) < 10, cavern["path"]   # right over R0
    assert min(math.hypot(x - hx, z - hz) for x, z, _ in hall["path"]) < 10, hall["path"]       # right over the lobby
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
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["lobby"]["c"]
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
    assert inside["lights"] == 4 and len(lights) == 4 and all(l["visible"] for l in lights), lights    # R0's two + the lobby's two (#277: no floodlights)
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
    """In T1 and in T2b a chase camera still easing in from above the hill is held under the 12 m ceiling from its first step;
    on the hilltop over the cavern the camera stays above the grass."""
    ux, uz = math.cos(HEADING), math.sin(HEADING)
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        # from the Hübel into the tunnel (~35 m in); the camera 8 m back down the axis and 40 m up, where a camera
        # following from outside the hill can still be
        tunnel = page.evaluate(CAM_JS, [MOUTH_ROAD[0], MOUTH_ROAD[1], HEADING, 16, 2.5, [-ux * 8, 40, -uz * 8], None])
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        (px, pz), th = t2b_point(h, 80)
        t2b = page.evaluate(CAM_JS, [px, pz, th, 8, 0.5, [-math.cos(th) * 8, 40, -math.sin(th) * 8], h["floor"]])
        hill = page.evaluate(CAM_JS, [cx - uz * 30, cz + ux * 30, math.atan2(-ux, uz), 6, 1.5, None, None])
        br.close()
    assert errors == []
    assert abs(tunnel["car"]["y"] - h["floor"]) < 6, tunnel           # the car is down in the tunnel
    for c in (tunnel["first"], tunnel["settled"], t2b["first"], t2b["settled"]):
        assert c["ceiling"] is not None and c["y"] <= c["ceiling"] - 1 + 1e-6, (tunnel, t2b)
    assert abs(t2b["settled"]["ceiling"] - (h["floor"] + 12)) < 1e-6, t2b   # T2b: the 12 m cap
    assert hill["car"]["y"] > hill["settled"]["hill"] - 5, hill          # the car is up on the hill
    assert hill["settled"]["lid"] is not None, hill                     # with the camera over the lid
    assert hill["settled"]["y"] > hill["settled"]["hill"], hill


@needs_world
def test_lobby_hidden_from_the_mouth(server):
    """From the mouth at eye height, a ray at the lobby's floor and at the lift gate's height hits rock first."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["lobby"]["c"]
        hits = page.evaluate(f"() => [{h['floor']} + 1, {h['floor']} + 4.6].map(y => window.__mm.wallRoleAt({h['mouth'][0]}, {h['mouth'][1]}, {hx}, {hz}, 1.5, y))")
        br.close()
    assert errors == []
    assert hits[0] == "stone" and "liftgate" not in hits, hits


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
    """The GLB is fetched only once the car is near the Hübel; the room is built on the first ride and shows it 330 m tall in Eiffel
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
        ride_down(page, h)
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
        ride_down(page, h)
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
        if d <= 35:
            assert r["fog"] == day["fog"] and r["skyTop"] == day["skyTop"] and r["hemi"] == day["hemi"] and r["sun"] == day["sun"], (d, r)
            assert r["dark"] is True and r["on"] is False, (d, r)
    for d in (45, 50, 60):
        assert by[d]["fog"] == "#07080a" and by[d]["dark"] is False and by[d]["on"] is True, (d, by[d])


def crop_brightness(page):
    """Mean grey of the frame's middle (the opening, looking out of the portal), from the game's own next-frame PNG."""
    import base64, io
    from PIL import Image, ImageStat
    url = page.evaluate("() => window.__mm.photoUrl()")
    img = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("L"); w, h = img.size
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
  const rows = []; const t0 = performance.now();
  while (performance.now() - t0 < 200000) {
    await new Promise(r => requestAnimationFrame(r));
    const l = window.__mm.lift(); if (l.phase === 'idle' && rows.length) break;
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
        h = page.evaluate("() => window.__mm.hideout()"); page.evaluate("() => window.__mm.liftTimes({dwell: 0.1, close: 0.1, ride: 2, open: 0.1})")
        drive_onto_the_lift(page, h)
        down = descent_rows(page)
        page.wait_for_function(RIDE_DONE, arg="eiffel", timeout=240000)
        lx, lz = h["lift"]["c"]; th = h["lift"]["th"]                                  # off the platform re-arms the lift, then back on for the ride up
        page.evaluate(f"() => window.__mm.place({lx - math.cos(th) * 20}, {lz - math.sin(th) * 20}, {th})"); page.wait_for_timeout(1500)
        drive_onto_the_lift(page, h)
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
            assert r["trees"] is True and r["shadows"] is True and r["group"] is False and r["on"] is False, (d, r)
    for key, off in (("trees", False), ("shadows", False), ("group", True), ("on", True)):
        went_in = first(ins, key, off); went_out = first(outs, key, not off)
        assert 35 <= went_in <= 50, (key, "in", went_in)
        assert 30 <= went_out <= 45 and went_out < went_in, (key, "out", went_out)
