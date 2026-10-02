"""#39: debug overlay (F3 or ?debug) with car coordinates and building heights. Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
BODENACKER_6 = 171822634


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
