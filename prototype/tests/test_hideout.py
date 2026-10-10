"""#102 / #201: the secret hideout in the Hübel -- a tunnel into the hill, a cave system of rooms and corridors behind it, a
340 m hall with a life-size Eiffel Tower, found by driving into the hall. Needs the real world and terrain (the hill is
swisstopo's). Slow (Playwright): run in the foreground."""
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
    """A point on T2b's axis `before_door` metres before the hall's edge, and T2b's heading (N1 -> hall)."""
    (n1x, n1z), (hx, hz), r = h["rooms"]["n1"]["c"], h["rooms"]["hall"]["c"], h["rooms"]["hall"]["r"]
    length = math.hypot(hx - n1x, hz - n1z); ux, uz = (hx - n1x) / length, (hz - n1z) / length
    s = length - r - before_door
    return (n1x + ux * s, n1z + uz * s), math.atan2(uz, ux)


@needs_world
def test_floor_lid_rooms_and_walls(server):
    """The rooms are the spec's: one floor (the cut), the hill 40+ m over every room, the hall 340 m across under at least 40 m of
    rock, ring walls, corridor walls and two bricked-up stubs; the whole system stays inside the triangle budget."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        assert h is not None
        cx, cz = h["centre"]; hx, hz = h["rooms"]["hall"]["c"]; n1x, n1z = h["rooms"]["n1"]["c"]
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
    assert h["rooms"]["hall"]["c"] == [-790, 1855] and h["rooms"]["hall"]["r"] == 170, h["rooms"]
    assert h["rooms"]["hall"]["minRock"] >= 40 and abs(h["rooms"]["hall"]["ceiling"] - (h["floor"] + 380)) < 1e-6, h["rooms"]
    assert h["rooms"]["r0"]["r"] == 22 and math.hypot(cx - -712.8, cz - 1528.2) < 0.1, h["rooms"]
    assert h["stubs"] == 2 and h["lamps"] == 4 and h["walls"] >= 24, h
    assert h["lidTris"] > 0 and h["floorTris"] > 0 and h["lidTris"] + h["floorTris"] < 120000, h
    assert counts["eiffel"] == 1
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


@needs_world
def test_drive_in_finds_the_hideout(server):
    """Listed in J from the start; drive from the Hübel into the hill: the car ends on R0's floor and that is no find yet; the
    last 60 m of T2b into the hall are: the find is toasted and remembered, the car stands on the hall floor."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        assert "Reservoir Hübel" in jump_list(page)   # #102: always in the list, found or not
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]
        # gas held for 8 s: ~105 m down the tunnel, so the car comes to rest inside R0
        r = page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 16, 8, ['KeyW'])")
        in_r0 = page.evaluate("() => ({ found: window.__mm.hideout().found, stored: localStorage.getItem('mm.hideout'), room: window.__mm.roomAt(window.__mm.car().x, window.__mm.car().z), cave: window.__mm.cave() })")
        (px, pz), th = t2b_point(h, 60)
        r2 = page.evaluate(f"() => window.__mm.sim({px}, {pz}, {th}, 16, 6, ['KeyW'], {h['floor']})")
        found = page.evaluate("() => window.__mm.hideout().found")
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        toast = page.evaluate("() => window.__mm.toast()")
        room = page.evaluate("() => window.__mm.roomAt(window.__mm.car().x, window.__mm.car().z)")
        names = jump_list(page)
        br.close()
    assert errors == []
    assert math.hypot(r["x"] - cx, r["z"] - cz) < 23, (r, h)
    assert abs(r["y"] - h["floor"]) < 1.0, (r, h)
    assert in_r0["room"] == "r0" and in_r0["cave"]["inside"] is True, in_r0
    assert in_r0["found"] is False and in_r0["stored"] is None, in_r0            # #201: R0 is a hub, the find is the hall
    assert room == "hall" and abs(r2["y"] - h["floor"]) < 1.0, (room, r2, h)
    assert found is True and stored == "1"
    assert toast["shown"] and ("Hideout found" in toast["text"] or "Versteck gefunden" in toast["text"]), toast
    assert "Reservoir Hübel" in names


@needs_world
def test_sky_ground_and_no_takeoff_inside(server):
    """The helicopter sees the hill over the cave, and F in R0, in T2b and in the hall is refused with a toast."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        cx, cz = h["centre"]; hx, hz = h["rooms"]["hall"]["c"]
        (px, pz), th = t2b_point(h, 60)
        results = []
        for x, z, heading, speed, secs, y in [(MOUTH_ROAD[0], MOUTH_ROAD[1], HEADING, 16, 8, "null"), (px, pz, th, 0, 0.1, h["floor"]), (hx + 100, hz, math.pi, 0, 0.1, h["floor"])]:
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
    """Across T2a and across the whole hall on the hilltop: the car stays on the hill, never under a ceiling, the cave stays
    off (not inside, nothing of the hall drawn, every cave light off, the forest shown), no find."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        hx, hz = h["rooms"]["hall"]["c"]; n1x, n1z = h["rooms"]["n1"]["c"]
        t2a = page.evaluate(CROSS_JS, [n1x + 45, n1z + 25, -math.pi / 2, 5])       # north across T2a's middle
        hall = page.evaluate(CROSS_JS, [hx - 200, hz, 0.0, 25])                   # east across the hall's footprint
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
def test_map_shows_the_hill_over_the_hall(server):
    """The static map paints the hill's height over the hall (and over R0), not the cave floor: the capped hill tint."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        px = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.hall.c, [rx, rz] = h.centre; return [window.__mm.mapPixel(x, z), window.__mm.mapPixel(rx, rz)]; }")
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
        low = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.hall.c; return window.__FOREST.filter(t => Math.hypot(t[0] - x, t[1] - z) < 150).map(t => t[3] - window.__mm.skyGround(t[0], t[1])); }")
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
    """From the sky, every point over the ring-wall blocks of R0 and N1 hits the hill's grass at the hill's height: no stone
    pokes out."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        ring = page.evaluate("() => Object.fromEntries(Object.entries(window.__mm.hideoutRing()).map(([k, v]) => [k, v.length]))")
        blocks = page.evaluate(FOOTPRINT_JS)
        br.close()
    assert errors == []
    assert set(ring) == {"r0", "n1"} and ring["r0"] >= 12 and ring["n1"] >= 6, ring
    assert len(blocks) == ring["r0"] + ring["n1"]
    bad = [pt for blk in blocks for pt in blk if pt["role"] != "grass" or abs(pt["y"] - pt["hill"]) > 0.05]
    assert bad == [], (len(bad), bad[:6])


@needs_world
def test_no_find_on_top_of_the_hill(server):
    """Driving over R0 or the hall on the hilltop (or flying over it) is no find: that needs the car under the ceiling."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        cavern = across(page, 105, 40, 8)
        h = page.evaluate("() => window.__mm.hideout()")
        hx, hz = h["rooms"]["hall"]["c"]
        hall = page.evaluate(CROSS_JS, [hx, hz - 8, math.pi / 2, 3])   # the hilltop here is woods: start by the centre, the edge walls stop a longer run
        stored = page.evaluate("() => localStorage.getItem('mm.hideout')")
        found = page.evaluate("() => window.__mm.hideout().found")
        br.close()
    assert errors == []
    cx, cz = h["centre"]
    assert min(math.hypot(x - cx, z - cz) for x, z, _ in cavern["path"]) < 10, cavern["path"]   # right over R0
    assert min(math.hypot(x - hx, z - hz) for x, z, _ in hall["path"]) < 10, hall["path"]       # right over the tower
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
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        page.evaluate(f"() => window.__mm.sim({hx + 100}, {hz}, {math.pi}, 8, 0.5, ['KeyW'], {h['floor']})")
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
    assert 6 <= inside["lights"] <= 12 and len(lights) == inside["lights"] and all(l["visible"] for l in lights), lights
    assert inside["programs"] == before["programs"], "cave lights must be pre-compiled"
    for k in ("fog", "fogDensity", "shadows", "treesVisible", "visible"):
        assert after[k] == before[k], (k, before[k], after[k])
    assert all(not l["visible"] for l in lights_after), lights_after


@needs_world
def test_floodlights_aim_at_the_tower_and_draw_calls_stay_bounded(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        page.evaluate(f"() => window.__mm.sim({hx + 100}, {hz}, {math.pi}, 8, 0.5, ['KeyW'])")   # on the hill over the hall
        page.wait_for_timeout(1500)
        out_calls = page.evaluate("() => window.__mm.renderInfo().calls")
        page.evaluate(f"() => window.__mm.sim({hx + 100}, {hz}, {math.pi}, 8, 0.5, ['KeyW'], {h['floor']})")
        page.wait_for_function("() => window.__mm.cave().inside === true")
        page.wait_for_timeout(1500)
        in_calls = page.evaluate("() => window.__mm.renderInfo().calls")
        spots = [l for l in page.evaluate("() => window.__mm.hideoutLights()") if l["kind"] == "spot"]
        br.close()
    assert errors == []
    assert len(spots) == 4
    aim = (hx, h["floor"] + 100, hz)
    e = sum(irradiance(l, *aim) for l in spots)
    assert 0.4 <= e <= 1.2, (e, spots)
    for l in spots:
        assert tuple(round(v, 1) for v in l["target"]) == tuple(round(v, 1) for v in aim), (l["target"], aim)
    assert in_calls <= out_calls + 20, (out_calls, in_calls)


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
def test_chase_camera_tilts_up_in_the_hall(server):
    """In the hall the chase camera looks up (the tower rises into the frame); outside it looks slightly down as always."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        page.evaluate(f"() => window.__mm.sim({hx + 120}, {hz}, {math.pi}, 8, 0.5, ['KeyW'], {h['floor']})")
        inside = page.evaluate("() => { let c; for (let i = 0; i < 180; i++) c = window.__mm.camStep(1 / 60, null); return { ...c, cave: window.__mm.cave() }; }")
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING + math.pi}, 8, 0.5, ['KeyW'])")
        outside = page.evaluate("() => { let c; for (let i = 0; i < 180; i++) c = window.__mm.camStep(1 / 60, null); return { ...c, cave: window.__mm.cave() }; }")
        br.close()
    assert errors == []
    assert inside["cave"]["hallCam"] == 1 and inside["look"][1] >= 0.3, inside
    assert outside["cave"]["hallCam"] == 0 and outside["look"][1] <= 0.05, outside


@needs_world
def test_tower_hidden_from_the_mouth(server):
    """From the mouth at eye height, a ray at the tower's foot hits rock; no ray from the mouth has the tower as its first hit."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        hits = page.evaluate(f"() => [60, 150, 300].map(y => window.__mm.wallRoleAt({h['mouth'][0]}, {h['mouth'][1]}, {hx}, {hz}, 1.5, y))")
        br.close()
    assert errors == []
    assert hits[0] == "stone" and "eiffel" not in hits, hits


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
    """The GLB is fetched only once the car is near the Hübel; loaded, it is 330 m tall in Eiffel brown, the placeholder is
    gone, and its four feet lie in the solid foot boxes (drive between the legs)."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        e0 = page.evaluate("() => window.__mm.eiffel()")
        assert e0["placeholder"] is True and e0["loaded"] is False and requests == []
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 0, 0.1, [])")
        page.wait_for_function("() => window.__mm.eiffel().loaded === true", timeout=60000)
        e = page.evaluate("() => window.__mm.eiffel()")
        fp = page.evaluate("() => window.__mm.eiffelFootprints()")
        push = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.hall.c, f = window.__mm.eiffel().feet; return { foot: window.__mm.pushAt(x + f[2][0], z + f[2][1], h.floor), centre: window.__mm.pushAt(x, z, h.floor) }; }")
        br.close()
    assert errors == []
    assert len(requests) == 1 and requests[0].endswith("/prototype/assets/models/eiffel_tower.glb"), requests
    assert e["placeholder"] is False and e["tris"] >= 400000 and abs(e["height"] - 330) <= 2 and e["base"] <= 145 and e["material"] == "#6b4a32", e
    assert len(fp) == 4, fp
    for box in fp:                      # per-quadrant bbox of the model's vertices below 20 m, relative to the hall centre
        foot = min(e["feet"], key=lambda f: math.hypot(f[0] - (box["x0"] + box["x1"]) / 2, f[1] - (box["z0"] + box["z1"]) / 2))
        hw = e["footHw"] + 2
        assert foot[0] - hw <= box["x0"] and box["x1"] <= foot[0] + hw and foot[1] - hw <= box["z0"] and box["z1"] <= foot[1] + hw, (foot, box)
    assert math.hypot(push["foot"]["dx"], push["foot"]["dz"]) > 5, push      # a foot is solid
    assert math.hypot(push["centre"]["dx"], push["centre"]["dz"]) < 0.01, push  # between the legs is free


@needs_world
def test_eiffel_placeholder_survives_a_blocked_model(server):
    """With the GLB unreachable the primitive tower stays, the error is noted, nothing breaks; the feet are solid either way."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        page.route("**/eiffel_tower.glb", lambda r: r.abort())
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 0, 0.1, [])")
        page.wait_for_function("() => window.__mm.eiffel().error !== null", timeout=60000)
        e = page.evaluate("() => window.__mm.eiffel()"); counts = page.evaluate("() => window.__mm.counts")
        push = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.hall.c, f = window.__mm.eiffel().feet; return { foot: window.__mm.pushAt(x + f[2][0], z + f[2][1], h.floor), centre: window.__mm.pushAt(x, z, h.floor) }; }")
        br.close()
    assert errors == []
    assert e["placeholder"] is True and e["loaded"] is False and e["started"] is True and counts["eiffel"] == 1, e
    assert math.hypot(push["foot"]["dx"], push["foot"]["dz"]) > 5, push
    assert math.hypot(push["centre"]["dx"], push["centre"]["dz"]) < 0.01, push
