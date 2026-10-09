"""#39: debug overlay (F3 or ?debug) with car coordinates and building heights. Slow (Playwright): run in the foreground."""
import json
import re
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
BODENACKER_6 = 171822634
TALLEST = 155170807                                  # roof top 38.1 m (h 32.5 + rh 5.6), the tallest in the region
SPOT_DX = {BODENACKER_6: 20, TALLEST: 22}            # car this far east of the footprint centre, clear of the façade
CHASE_ARRIVED = ("() => { const c = window.__mm.cam(), d = c.d; return c.view === 0"
                 " && Math.abs(Math.hypot(d[0], d[2]) - 6.9) < 0.3 && Math.abs(d[1] - 2.6) < 0.3; }")   # compact chase cam since #69
COCKPIT_ARRIVED = ("() => { const c = window.__mm.cam(), d = c.d; return c.view === 2"
                   " && Math.abs(d[0] - 0.25) < 0.05 && Math.abs(d[1] - 1.22) < 0.05 && Math.abs(d[2] - 0.38) < 0.05; }")   # cockpit eye x scale 1.0 (#69)


def open_page(p, server, block_world=False, query=""):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 960, "height": 540})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def height_text(b):
    ridge = f" +{b['rh']:.1f}" if isinstance(b.get("rh"), (int, float)) else ""
    return f"{b['h']:.1f} m{ridge} {b.get('hsrc') or 'osm'}"


def test_f3_toggles_the_panel_and_the_hand_layout_has_no_lv95(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        dbg = lambda: page.evaluate("() => window.__mm.debug()")
        start = dbg()["on"]; hidden_at_start = not page.is_visible("#debug")
        page.keyboard.press("F3")
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
        on = dbg(); shown = page.is_visible("#debug"); text = page.inner_text("#debug")
        page.keyboard.press("F3")
        off = dbg()["on"]; hidden_again = not page.is_visible("#debug")
        help_text = page.text_content("#help")
        br.close()
    assert start is False and hidden_at_start
    assert on["on"] is True and shown
    assert text.startswith("x ") and "LV95 —" in text and "bldg —" in text, text
    assert on["pos"]["E"] is None and on["heights"] == [] and on["sprites"] == 0
    assert off is False and hidden_again
    assert "F3" in help_text and "debug" in help_text.lower()


@pytest.mark.parametrize("query,expected", [("?debug", True), ("?debug=1", True), ("?debug=0", False)])
def test_url_flag_switches_debug_on_at_load(server, query, expected):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query=query)
        on = page.evaluate("() => window.__mm.debug().on")
        visible = page.is_visible("#debug")
        br.close()
    assert on is expected and visible is expected


@needs_world
def test_coordinates_and_building_heights_near_the_car(server):
    w = json.loads(WORLD.read_text(encoding="utf-8")); o = w["origin"]
    b = next(x for x in w["buildings"] if x["id"] == BODENACKER_6)
    want = height_text(b)
    cx, cz = b["rect"][0] + 20, b["rect"][1]
    with sync_playwright() as p:
        br, page = open_page(p, server, query="?debug")
        page.evaluate(f"() => window.__mm.place({cx}, {cz})")
        page.wait_for_function(f"() => window.__mm.debug().heights.some(l => l.id === {BODENACKER_6})", timeout=60000)
        dbg = page.evaluate("() => window.__mm.debug()")
        addr_before = page.evaluate("() => window.__mm.labelSprites()")
        page.keyboard.press("F3")
        page.wait_for_function("() => window.__mm.debug().sprites === 0", timeout=60000)
        addr_after = page.evaluate("() => window.__mm.labelSprites()")
        br.close()
    pos = dbg["pos"]
    assert abs(pos["E"] - pos["x"] - o["E"]) < 1e-6 and abs(pos["N"] + pos["z"] - o["N"]) < 1e-6, pos
    assert abs(pos["lat"] - o["lat"]) < 0.05 and abs(pos["lon"] - o["lon"]) < 0.05, pos
    assert f"LV95 {round(pos['E'])} / {round(pos['N'])}" in dbg["lines"], dbg["lines"]
    label = next(l for l in dbg["heights"] if l["id"] == BODENACKER_6)
    assert label["t"] == want and label["d"] <= 60, label
    assert 1 <= len(dbg["heights"]) <= 40 and dbg["sprites"] == len(dbg["heights"])
    near = dbg["heights"][0]
    assert f"bldg {near['id']} · {near['t']}" in dbg["lines"], dbg["lines"]
    assert addr_before > 0 and addr_after == addr_before                     # house numbers are not the debug layer


def test_click_on_the_panel_copies_one_line(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query="?debug")
        page.click("#startbtn")
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
        page.evaluate("() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; }")
        page.click("#debug")
        page.wait_for_function("() => window.__copied !== null", timeout=30000)
        copied = page.evaluate("() => window.__copied")
        lines = page.evaluate("() => window.__mm.debug().lines")
        toast = page.text_content("#toast")                               # CSS upper-cases the toast
        br.close()
    assert copied.startswith("x ") and " | LV95 —" in copied, copied
    assert copied.split(" | ")[0].split("  ")[0] == lines[0].split("  ")[0]    # same panel (the car may have moved a frame since)
    assert toast == "Copied"


def panel_lines(page):
    page.keyboard.press("F3")
    page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
    return page.evaluate("() => window.__mm.debug().lines")


SIZE_LINE = re.compile(r"size (\d+\.\d\d) × (\d+\.\d\d) × (\d+\.\d\d) m")
HAND_MAP_LINE = "map 6.40 × 3.80 km · 24.3 km²"


def test_panel_shows_car_size_and_hand_layout_map(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        lines = panel_lines(page)
        size = page.evaluate("() => window.__mm.carSize()")
        text = page.evaluate("() => window.__mm.debug().copy")
        page.evaluate("() => { const c = window.__mm.vehicles().compact; c.scale = 1.5; window.__mm.setVehicle(c); }")
        page.wait_for_function("() => window.__mm.debug().lines.some(l => l.startsWith('size ') && parseFloat(l.slice(5)) > 6)", timeout=60000)
        scaled = next(l for l in page.evaluate("() => window.__mm.debug().lines") if l.startswith("size "))
        br.close()
    got = next(l for l in lines if l.startswith("size "))
    m = SIZE_LINE.fullmatch(got)
    assert m, got
    l, w, h = (float(v) for v in m.groups())
    assert (l, w, h) == (pytest.approx(size["l"], abs=0.02), pytest.approx(size["w"], abs=0.02), pytest.approx(size["h"], abs=0.02)), got
    assert HAND_MAP_LINE in lines, lines
    copied = text.split(" | ")
    assert got in copied and HAND_MAP_LINE in copied, text
    ms = SIZE_LINE.fullmatch(scaled)                                       # the size follows the selected vehicle
    assert ms, scaled
    assert [float(v) for v in ms.groups()] == [pytest.approx(v * 1.5, abs=0.03) for v in (l, w, h)], (got, scaled)


CAR_POSE = ("() => { const p = window.__mm.carPose(); return { rot: p.rot.map(v => +v.toFixed(9)), visible: p.visible }; }")
SPY_MEASURE = """async () => { const THREE = await import('three'); const orig = THREE.Box3.prototype.expandByObject;
  window.__measured = 0; THREE.Box3.prototype.expandByObject = function (...a) { window.__measured++; return orig.apply(this, a); }; }"""


def test_panel_ticks_leave_the_car_alone(server):
    """#124 AC 5: the size line reads a value measured when the car is built; the 250 ms panel tick never re-measures
    (rotates) the car, and the car's rotation and visibility are the same after several ticks."""
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        before = page.evaluate(CAR_POSE)
        page.evaluate(SPY_MEASURE)
        frame0 = page.evaluate("() => window.__mm.pause().frame")
        lines = panel_lines(page)
        page.wait_for_function(f"() => window.__mm.pause().frame >= {frame0} + 12", timeout=120000)
        page.wait_for_timeout(1500)                                            # several 250 ms ticks
        measured = page.evaluate("() => window.__measured")
        after = page.evaluate(CAR_POSE)
        br.close()
    assert any(l.startswith("size ") for l in lines), lines
    assert measured == 0, measured
    assert after == before, (before, after)


@needs_world
def test_panel_shows_world_map_extent(server):
    with sync_playwright() as p:
        br, page = open_page(p, server)
        lines = panel_lines(page)
        br.close()
    assert "map 9.44 × 4.39 km · 41.5 km²" in lines, lines


@needs_world
@pytest.mark.parametrize("bid", [BODENACKER_6, TALLEST])
def test_tall_building_label_stays_on_screen(server, bid):
    """#70: facing a tall building from close by, its height label is lowered into the screen (NDC y <= 0.8)."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    b = next(x for x in w["buildings"] if x["id"] == bid)
    cx, cz = b["rect"][0] + SPOT_DX[bid], b["rect"][1]
    label = f"window.__mm.debug().heights.find(l => l.id === {bid})"
    with sync_playwright() as p:
        br, page = open_page(p, server, query="?debug")
        page.click("#startbtn", timeout=180000)
        page.evaluate(f"() => window.__mm.sim({cx}, {cz}, Math.PI, 0, 0, [])")     # heading pi = facing west, at the building
        page.wait_for_function(CHASE_ARRIVED, timeout=120000)
        page.wait_for_function(f"() => !!{label}", timeout=60000)
        chase = page.evaluate(f"() => {label}")
        page.keyboard.press("KeyC")
        page.keyboard.press("KeyC")
        page.wait_for_function(COCKPIT_ARRIVED, timeout=120000)
        page.wait_for_function(f"() => !!{label}", timeout=60000)
        cockpit = page.evaluate(f"() => {label}")
        br.close()
    for view, l in (("chase", chase), ("cockpit", cockpit)):
        assert l.get("clamped") is True, (view, l)
        assert l.get("ny") is not None and -1 <= l["ny"] <= 0.8 + 1e-3, (view, l)
