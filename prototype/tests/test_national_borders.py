"""#397: the national borders (new yellow, old white), toggled with Y -- hidden by default, 3D strips + minimap lines; G stays the Gemeinde boundaries.
Real world (the CH/DE border is derived from the OSM Gemeinde boundaries), terrain blocked. Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
STATE = "() => window.__mm.borders()"
PIXELS = """([x, z]) => { const [px, py] = window.__mm.worldToMap(x, z), d = document.getElementById('map').getContext('2d').getImageData(Math.round(px) - 3, Math.round(py) - 3, 7, 7).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 190 && d[i + 2] < 60) n++; return n; }"""


def wait_frames(page, n=2):
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=120000)


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errs


@needs_world
def test_y_toggles_both_lines_in_3d_and_g_does_not(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server)
        s = page.evaluate(STATE)
        assert not s["on"] and not s["groupVisible"] and s["newPts"] > 100 and s["apartRuns"] >= 2   # bridge and island
        assert sorted(m["color"] for m in s["meshes"]) == ["ffd400", "ffffff"]
        page.keyboard.press("KeyG")
        assert not page.evaluate(STATE)["groupVisible"] and page.evaluate("() => window.__mm.boundaries()")["on"]
        page.keyboard.press("KeyG")
        page.keyboard.press("KeyY")
        s = page.evaluate(STATE)
        assert s["on"] and s["groupVisible"] and not page.evaluate("() => window.__mm.boundaries()")["groupVisible"]
        assert "National borders on" in page.text_content("#toast")
        page.keyboard.press("KeyY")
        assert not page.evaluate(STATE)["groupVisible"] and "National borders off" in page.text_content("#toast")
        assert errs == []
        b.close()


@needs_world
def test_old_line_crosses_the_bridge_at_the_old_deck_line_and_runs_through_the_island(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server)
        r = page.evaluate("""() => { const nl = window.__mm.natLines(), old = window.__mm.borderLines.find(l => l.kind === 'old');
          const d = (pts, x, z) => Math.min(...pts.map(q => Math.hypot(q[0] - x, q[1] - z)));
          return { deckOld: d(nl.old, old.x, old.z), deckNew: d(nl.new, old.x, old.z), island: nl.old.filter(q => q[0] > -1300 && q[0] < -1100 && q[1] > 130 && q[1] < 200).length }; }""")
        assert r["deckOld"] < 2.5 and r["deckNew"] > 5 and r["island"] > 5, r
        b.close()


@needs_world
def test_minimap_draws_the_lines_only_while_y_is_on(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server)
        x, z = page.evaluate("() => window.__mm.natLines().new[150]")
        wait_frames(page); assert page.evaluate(PIXELS, [x, z]) == 0
        page.keyboard.press("KeyY"); wait_frames(page); assert page.evaluate(PIXELS, [x, z]) > 0
        px = page.evaluate("() => window.__mm.mapBorderPixels()"); assert px["yellow"] > 0 and px["white"] > 0
        page.keyboard.press("KeyY"); wait_frames(page); assert page.evaluate(PIXELS, [x, z]) == 0
        assert errs == []
        b.close()


def test_hand_layout_y_says_no_data(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, block_world=True)
        page.keyboard.press("KeyY")
        assert "no data" in page.text_content("#toast")
        page.keyboard.press("F1")
        assert "national borders" in page.inner_text("#help")
        assert errs == []
        b.close()
