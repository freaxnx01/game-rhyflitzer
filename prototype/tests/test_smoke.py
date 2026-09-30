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
        return info, [t for t, u in msgs if "world_hochrhein.json" not in u]


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
    print("physMs hand", hand, "osm", osm)
    assert osm <= hand * 1.5 + 0.5, (hand, osm)
