"""#48: Gemeinde boundaries, toggled with G (3D strip + minimap overlay). Slow (Playwright): run in the foreground.
The tests patch `boundaries` into the served world, so they do not depend on the world rebuild (Task 5)."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
LAND = {"id": 1, "names": ["Eiken", "Sisseln"], "pts": [[1500, 300], [1700, 360], [1900, 420]]}   # near the real Sisseln | Eiken border


def open_page(p, server, block_world=False, world=None, block_mmh=True):
    """world: a dict served instead of the file. Returns (browser, page, page errors)."""
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    if block_mmh:
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    elif world is not None:
        body = json.dumps(world, ensure_ascii=False)
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errs


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (a headless renderer can be slower than 1 fps)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=120000)


def rhine_point(w):
    rh = next(x for x in w["water"] if x["name"] == "Rhein" and len(x["rings"][0]) > 20)
    ring = rh["rings"][0]
    return sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring)


def with_boundaries(w):
    x, z = rhine_point(w)
    return {**w, "boundaries": [LAND, {"id": 2, "names": ["Bad Säckingen", "Sisseln"], "pts": [[x, z - 150], [x, z + 150]]}]}


STATE = "() => window.__mm.boundaries()"


@needs_world
def test_g_toggles_the_boundaries(server):
    w = with_boundaries(json.loads(WORLD.read_text(encoding="utf-8")))
    x, z = LAND["pts"][1]
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=w)
        s = page.evaluate(STATE)
        assert s["lines"] == 2 and s["verts"] > 0 and not s["on"] and not s["groupVisible"]
        assert page.evaluate("() => window.__mm.hud().bounds") is False
        g0 = page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [x, z])
        page.keyboard.press("KeyG")
        s = page.evaluate(STATE)
        assert s["on"] and s["groupVisible"] and page.evaluate("() => window.__mm.hud().bounds") is True
        assert "Gemeinde boundaries on" in page.text_content("#toast")
        assert page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [x, z]) == g0      # physics untouched
        page.keyboard.press("KeyT")                                                            # style swap keeps the strip
        s = page.evaluate(STATE)
        assert s["groupVisible"] and s["color"] == "ff3fb4"
        page.keyboard.press("KeyG")
        s = page.evaluate(STATE)
        assert not s["on"] and not s["groupVisible"]
        assert "Gemeinde boundaries off" in page.text_content("#toast")
        assert errs == []
        b.close()
