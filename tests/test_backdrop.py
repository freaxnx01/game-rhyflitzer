"""#593: the horizon backdrop loads after start, stays cheap, and hides under water."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_smoke import ARGS, WORLD, MMH

BACKDROP = Path(__file__).resolve().parent.parent / "data" / "backdrop_hochrhein.mmh"

needs_data = pytest.mark.skipif(not (WORLD.exists() and MMH.exists() and BACKDROP.exists()),
                                reason="run pipeline/backdrop.py first (docs/08-pipeline-terrain.md)")


@needs_data
def test_backdrop_loads_cheap_and_is_visible_on_the_surface(server):
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.backdrop && window.__mm.backdrop().loaded", timeout=240000)
        page.wait_for_function("() => window.__mm.backdrop().scale === 0.08", timeout=60000)   # camTail has applied it
        b = page.evaluate("() => window.__mm.backdrop()")
        status = page.evaluate("() => document.querySelector('#mmhstatus').textContent")
        br.close()
    print(b, status)
    assert b["visible"] and b["scale"] == pytest.approx(0.08)
    assert 40000 < b["tris"] <= 70000 and b["bytes"] <= 200000, b
    assert b["ms"] < 250, b                      # one indexed mesh, no terrain lookups
    assert "Copernicus" in status, status


@needs_data
def test_backdrop_hides_underwater_and_comes_back(server):
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 320, "height": 180})
        page.goto(f"{server}/index.html")
        page.wait_for_selector("#startbtn", timeout=240000)
        page.wait_for_function("() => window.__mm && window.__mm.backdrop && window.__mm.backdrop().loaded", timeout=240000)
        page.click("#startbtn")
        page.evaluate("() => window.__mm.place(1000, -530)")        # Sisseln Rhine (test_smoke): the car sinks, the camera follows
        page.wait_for_function("() => window.__mm.underwater().on", timeout=240000)
        hidden = page.evaluate("() => window.__mm.backdrop().visible")
        page.keyboard.press("KeyR")                                  # respawn on dry land (test_underwater's pattern)
        page.wait_for_function("() => !window.__mm.underwater().on", timeout=240000)
        page.wait_for_function("() => window.__mm.backdrop().visible", timeout=60000)
        br.close()
    assert hidden is False
