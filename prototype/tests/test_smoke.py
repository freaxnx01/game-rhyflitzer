from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def load(server, block_world: bool):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 640, "height": 360})
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
        # own-page errors only: the missing world file is an accepted 404 (docs/11); third-party resources (the Star button's
        # api.github.com call gets rate-limited to 403 after a few runs) are not under test. Page errors carry no URL and stay.
        return info, [t for t, u in msgs if "world_hochrhein.json" not in u and (not u or u.startswith(server))]


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
