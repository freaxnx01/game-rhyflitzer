"""#106: I picks a destination (the J landmarks + streets), the Navi shows the route on the minimap and a turn arrow
with a text instruction, plans again when the player leaves the route and announces the arrival. It guides only —
the autopilot (#18) drives. Slow (Playwright): run in the foreground."""
import json
import re
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
# a software 2D canvas: on a GPU-backed one each minimap getImageData waits for the queued WebGL frames,
# 1-4 minutes per read on a loaded box (same pixels, read in milliseconds)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-accelerated-2d-canvas"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
ROUTE_RGB = (0x3D, 0xDC, 0xFF)
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"

VIEWS = {
    "desktop": dict(viewport={"width": 1280, "height": 720}),
    "narrow-window": dict(viewport={"width": 390, "height": 844}),
    "touch-phone": dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True),
}

# the panel's three instruction forms, en and de
PANEL_EN = re.compile(r"^(In \d+(\.\d+)? (m|km) .+|.+ now|Destination in \d+(\.\d+)? (m|km))$")
PANEL_DE = re.compile(r"^(In \d+(\.\d+)? (m|km) (leicht |scharf )?(links|rechts)|In \d+(\.\d+)? (m|km) wenden|Jetzt .+|Ziel in \d+(\.\d+)? (m|km))$")

RECTS_JS = """() => { const r = e => { if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
  const b = e.getBoundingClientRect(); return b.width && b.height ? [b.left, b.top, b.right, b.bottom] : null; };
  const byId = id => r(document.getElementById(id));
  return { vw: innerWidth, vh: innerHeight, navi: byId('navi'),
    others: Object.fromEntries([...['tl', 'tr', 'compass', 'br', 'debug', 'toast', 'pausebtn', 'stylebtn'].map(id => [id, byId(id)]),
      ...[...document.getElementById('tc').children].map((c, i) => ['tc' + i, r(c)])]) }; }"""


def open_page(p, server, block_world=False, lang=None, **ctx):
    b = p.chromium.launch(args=ARGS)
    context = b.new_context(**({"viewport": {"width": 1280, "height": 720}, "locale": "en-US"} | ctx))
    if lang:
        context.add_init_script(f"try {{ localStorage.setItem('gg-lang', '{lang}'); }} catch (e) {{}}")
    page = context.new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html?debug")
    page.wait_for_function(READY, timeout=240000)
    page.click("#startbtn", timeout=180000)      # I only works with the start overlay hidden
    return b, page


def anchor(name):
    lm = json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"][name]
    return lm["x"], lm["z"]


def navi(page):
    return page.evaluate("() => window.__mm.navi()")


def pick_dest(page, query, place=None):
    """With the dialog already open: type, choose the row (by place if given), Enter."""
    page.keyboard.type(query)
    rows = page.evaluate("() => window.__mm.jumpList()")
    i = next(k for k, r in enumerate(rows) if place is None or r["g"] == place)
    for _ in range(i):
        page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    return rows[i]


def navigate_to(page, query, place=None):
    """Pick a destination the way a player does: I, type, choose the row, Enter. Needs the dialog closed —
    I on an open dialog with an empty search field closes it again (#86)."""
    page.keyboard.press("KeyI")
    return pick_dest(page, query, place)


def route_pixels(page):
    return page.evaluate("""([r, g, b]) => { const c = document.getElementById('map'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) < 24 && Math.abs(d[i + 1] - g) < 24 && Math.abs(d[i + 2] - b) < 24) n++; return n; }""", list(ROUTE_RGB))


def frames(page, n=3):
    page.evaluate("(n) => new Promise(res => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : res()); f(); })", n)


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


@needs_world
def test_i_opens_the_navigate_dialog_and_enter_starts_the_navi(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyI")
        assert page.is_visible("#jump")
        assert page.text_content("#jumptitle") == "Navigate to"
        assert "I / Esc closes" in page.text_content("#jumphint")
        assert page.evaluate("() => document.activeElement.id") == "jumpq"
        rows = page.evaluate("() => window.__mm.jumpList()")
        names = [r["n"] for r in rows]
        assert "Smile-Kreisel" in names and "Fridolinsmünster" in names      # the J landmarks
        assert {"n": "Bodenackerstrasse", "g": "Sisseln"} in rows            # then the streets
        assert "Random spot" not in names
        chips = page.eval_on_selector_all("#jumpchips button", "bs => bs.map(b => b.textContent)")
        assert chips[0] == "All" and "Sisseln" in chips
        row = pick_dest(page, "Smile")                                   # the dialog is already open from the I above
        assert row["n"] == "Smile-Kreisel"
        assert not page.is_visible("#jump")
        n = navi(page)
        assert n["on"] is True and n["dest"]["n"] == "Smile-Kreisel" and n["len"] > 300
        assert "Navi on: Smile-Kreisel" in page.inner_html("#toast")
        frames(page)
        assert page.is_visible("#navi")
        b.close()


@needs_world
def test_the_panel_shows_arrow_distance_and_text(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        navigate_to(page, "Smile")
        page.evaluate("() => window.__mm.naviWalk(20, 6)")       # 120 m along the route, so there is a maneuver to show
        frames(page)
        panel = page.evaluate("""() => ({ dist: document.getElementById('navdist').textContent,
            text: document.getElementById('navtext').textContent, dest: document.getElementById('navdest').textContent,
            arrow: document.getElementById('navarrow').style.transform })""")
        b.close()
    assert PANEL_EN.match(panel["text"]), panel
    assert re.match(r"^(\d+(\.\d+)? (m|km)|▲)$", panel["dist"]), panel
    assert panel["dest"].startswith("Smile-Kreisel · "), panel
    assert re.match(r"^rotate\(-?\d+(\.\d+)?deg\)$", panel["arrow"]), panel


@needs_world
def test_instructions_are_only_turns_at_junctions(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        navigate_to(page, "Fridolinsm")                                 # across the Rhine: a long route with several junctions
        walked = page.evaluate("() => window.__mm.naviWalk(20, 2000)")
        b.close()
    assert walked["on"] is False, walked                                # drove the whole route
    kinds = {s.split(":")[1] for s in walked["seen"]}
    assert kinds - {""}, walked                                         # a long route announces at least one turn
    # every announced maneuver is one of the seven turn classes — bends without a junction and straight junctions are silent
    assert kinds <= {"", "slightLeft", "turnLeft", "sharpLeft", "slightRight", "turnRight", "sharpRight", "uturn"}, walked
    assert {s.split(":")[0] for s in walked["seen"]} <= {"in", "now", "dest"}, walked


@needs_world
def test_i_again_turns_the_navi_off(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        navigate_to(page, "Smile")
        page.keyboard.press("KeyI")                                     # with the Navi on, I turns it off (no dialog)
        assert not page.is_visible("#jump")
        assert navi(page)["on"] is False
        assert "Navi off" in page.inner_html("#toast")
        frames(page)
        assert not page.is_visible("#navi")
        page.keyboard.press("KeyI")                                     # and I opens the list again
        assert page.is_visible("#jump")
        b.close()


@needs_world
def test_the_route_is_drawn_on_the_minimap(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        frames(page)
        assert route_pixels(page) < 20
        navigate_to(page, "Fridolinsm")
        frames(page)
        assert route_pixels(page) > 200
        page.keyboard.press("KeyI")
        frames(page)
        assert route_pixels(page) < 20
        b.close()


@needs_world
def test_leaving_the_route_plans_a_new_one(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        start = page.evaluate("() => window.__mm.car()")
        # a point 2 km west that is certainly on the routable network: drive a real route there and remember where we land.
        # (A landmark's nearest road is no good — the Münsterplatz is `pedestrian`, which route.js does not route over.)
        navigate_to(page, "Fridolinsm")
        page.evaluate("() => window.__mm.naviWalk(20, 100)")
        far = page.evaluate("() => window.__mm.car()")
        page.evaluate(f"() => window.__mm.place({start['x']}, {start['z']})")
        assert page.evaluate("() => window.__mm.naviStart('Smile-Kreisel')") is True
        assert navi(page)["replans"] == 0
        page.evaluate(f"() => window.__mm.place({far['x']}, {far['z']})")
        r = page.evaluate("() => window.__mm.naviSim(4)")               # 1.5 s off the route, then a new plan
        assert r["replans"] == 1 and r["on"] is True, r
        assert "Recalculating" in page.inner_html("#toast")
        r2 = page.evaluate("() => window.__mm.naviSim(2)")              # on the new route again: no second plan
        assert r2["replans"] == 1 and r2["on"] is True, r2
        b.close()


@needs_world
def test_arrival_ends_the_navi_with_a_toast(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        navigate_to(page, "Smile")
        r = page.evaluate("() => window.__mm.naviWalk()")
        assert r["on"] is False and r["replans"] == 0, r
        assert "Arrived: Smile-Kreisel" in page.inner_html("#toast")
        frames(page)
        assert not page.is_visible("#navi")
        b.close()


@needs_world
def test_the_navi_does_not_touch_the_race_the_car_or_the_turn_signals(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        state = "() => ({ flags: window.__mm.raceFlags(), blinker: window.__mm.hud().blinker, keys: window.__mm.keysDown() })"
        before = page.evaluate(state)
        navigate_to(page, "Smile")
        assert page.evaluate(state) == before
        page.evaluate("() => window.__mm.naviSim(2)")
        assert page.evaluate(state) == before
        assert before == {"flags": {"jumped": False, "flown": False, "auto": False, "swapped": False}, "blinker": None, "keys": []}
        assert page.evaluate("() => window.__mm.auto().on") is False
        b.close()


@needs_world
def test_o_starts_the_autopilot_and_the_navi_and_taking_over_ends_only_the_autopilot(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyO")
        page.keyboard.type("Smile")
        page.keyboard.press("Enter")
        a, n = page.evaluate("() => window.__mm.auto()"), navi(page)
        assert a["on"] is True and n["on"] is True
        assert n["dest"]["n"] == a["dest"] and abs(n["len"] - a["len"]) < 1e-6, (a, n)
        page.keyboard.press("KeyA")                                     # the player takes over
        assert page.evaluate("() => window.__mm.auto().on") is False
        assert "Autopilot off" in page.inner_html("#toast")
        assert navi(page)["on"] is True                                 # the Navi keeps guiding
        page.keyboard.press("KeyO")
        page.keyboard.press("Enter")                                    # O opens the drive list again, Enter starts both
        assert page.evaluate("() => window.__mm.auto().on") is True and navi(page)["on"] is True
        page.keyboard.press("KeyO")                                     # O switched both on, so O switches both off
        assert page.evaluate("() => window.__mm.auto().on") is False
        assert navi(page)["on"] is False
        b.close()


@needs_world
def test_start_navi_takes_a_plain_destination_for_the_delivery_mode(server):
    """#107 uses startNavi({ n, x, z }) / stopNavi() directly, without the dialog."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        x, z = anchor("smileKreisel")
        ok = page.evaluate(f"() => window.__mm.naviStart({{ n: 'Paket 1', x: {x}, z: {z} }})")
        assert ok is True
        n = navi(page)
        assert n["on"] is True and n["dest"]["n"] == "Paket 1" and n["len"] > 300
        assert "Navi on: Paket 1" in page.inner_html("#toast")
        b.close()


@needs_world
@pytest.mark.parametrize("view", list(VIEWS))
def test_the_navi_panel_overlaps_nothing(server, view):
    with sync_playwright() as p:
        b, page = open_page(p, server, **VIEWS[view])
        navigate_to(page, "Smile")
        page.evaluate("() => window.__mm.naviWalk(20, 6)")
        page.wait_for_function("() => document.querySelector('#toast').classList.contains('show')", timeout=120000)
        frames(page)
        page.wait_for_timeout(300)                                      # let the toast's .2 s fade-in finish
        r = page.evaluate(RECTS_JS)
        b.close()
    n = r["navi"]
    assert n, r
    assert 0 <= n[0] and n[2] <= r["vw"] and 0 <= n[1] and n[3] <= r["vh"], r     # inside the viewport
    for name, box in r["others"].items():
        if box:
            assert not overlaps(n, box), (name, r)


@needs_world
def test_german_texts(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, locale="de-CH", lang="de")
        page.keyboard.press("KeyI")
        assert page.text_content("#jumptitle") == "Navigieren nach"
        assert "I / Esc schliesst" in page.text_content("#jumphint")
        pick_dest(page, "Smile")                                         # the dialog is already open from the I above
        assert "Navi an: Smile-Kreisel" in page.inner_html("#toast")
        page.evaluate("() => window.__mm.naviWalk(20, 6)")
        frames(page)
        text = page.text_content("#navtext")
        assert PANEL_DE.match(text), text
        r = page.evaluate("() => window.__mm.naviWalk()")
        assert r["on"] is False
        assert "Angekommen: Smile-Kreisel" in page.inner_html("#toast")
        b.close()


def test_hand_layout_says_the_navi_needs_the_world(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True)
        page.keyboard.press("KeyI")
        assert not page.is_visible("#jump")
        assert "The Navi needs the OSM world" in page.inner_html("#toast")
        assert navi(page)["on"] is False
        assert not page.is_visible("#navi")
        b.close()


@needs_world
def test_the_j_and_o_dialogs_are_unchanged(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        assert page.text_content("#jumptitle") == "Jump to"
        assert "J / Esc closes" in page.text_content("#jumphint")
        assert "Random spot" in [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
        page.keyboard.press("KeyJ")
        page.keyboard.press("KeyO")
        assert page.text_content("#jumptitle") == "Drive to"
        assert "O / Esc closes" in page.text_content("#jumphint")
        assert "Random spot" not in [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
        b.close()


@pytest.mark.parametrize("lang,text", [("en", "navigation: route"), ("de", "Navi: Route")])
def test_help_lists_i(server, lang, text):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True, lang=lang)
        assert text in page.inner_html("#help")
        b.close()


# the autopilot and the Navi stepped together, frame by frame, until the autopilot is done. Records every frame where the
# Navi had already ended while the autopilot was still driving — that is where the Navi's own "Arrived" toast used to
# come before the autopilot's (two arrival toasts for one arrival).
AUTO_AND_NAVI_JS = """(secs) => { const early = []; let n = 0;
  for (; n < secs * 60 && window.__mm.auto().on; n++) { window.__mm.autoSim(1 / 60); window.__mm.naviSim(1 / 60);
    const a = window.__mm.auto(), v = window.__mm.navi(); if (a.on && !v.on) early.push(a.left); }
  return { early: early.length, firstEarlyLeft: early[0] ?? null, auto: window.__mm.auto(), navi: window.__mm.navi(), toast: window.__mm.toast().text }; }"""


@needs_world
def test_with_the_autopilot_driving_its_arrival_is_the_only_one(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyO")
        page.keyboard.type("Smile")
        page.keyboard.press("Enter")
        assert page.evaluate("() => window.__mm.auto().on") is True and navi(page)["on"] is True
        r = page.evaluate(AUTO_AND_NAVI_JS, 150)
        b.close()
    assert r["auto"]["last"] == "arrived", r
    assert r["early"] == 0, r                                         # the Navi never announced an arrival of its own
    assert r["navi"]["on"] is False, r                                # the autopilot's arrival ended it, silently
    assert r["toast"] == "Arrived: Smile-Kreisel", r


def navi_on(page, dest="Smile-Kreisel"):
    assert page.evaluate(f"() => window.__mm.naviStart('{dest}')") is True
    assert navi(page)["on"] is True


def ended_silently(page):
    """The Navi is off, its panel is gone, and a few seconds later it has not come back with "Recalculating…"."""
    r = page.evaluate("() => window.__mm.naviSim(3)")
    frames(page)
    return r["on"] is False and r["replans"] == 0 and not page.is_visible("#navi") and "Recalculating" not in page.inner_html("#toast")


@needs_world
def test_r_j_and_the_map_double_click_end_the_navi(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        navi_on(page)
        page.keyboard.press("KeyR")
        assert ended_silently(page)
        navi_on(page)
        c = page.evaluate("() => window.__mm.car()")
        px, py = page.evaluate(f"() => window.__mm.worldToMap({c['x'] + 150}, {c['z']})")
        assert 0 < px < 800 and 0 < py < 400, (px, py)                 # the spot is on the minimap
        box = page.locator("#map").bounding_box()
        page.mouse.dblclick(box["x"] + px * box["width"] / 800, box["y"] + py * box["height"] / 400)
        assert ended_silently(page)
        navi_on(page)
        page.keyboard.press("KeyJ")                                   # last: the Münsterplatz is no start for a new route
        pick_dest(page, "Fridolinsm")
        assert ended_silently(page)
        b.close()


@needs_world
def test_the_main_menu_and_start_end_the_navi(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        navi_on(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        page.click("#pausemenu", timeout=120000)
        if page.is_visible("#abandon"):
            page.click("#abandonok", timeout=120000)
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=120000)
        assert ended_silently(page)                                   # no Navi panel over the main menu
        navi_on(page)                                                 # (#107 may start it without the dialog)
        page.click("#startbtn", timeout=120000)
        assert ended_silently(page)
        b.close()
