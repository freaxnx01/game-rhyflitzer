"""#251: Testhub integration -- dev-mode loader, jump targets, screenshot hook.
The hub client (/testhub/client.js) lives in another repo; here page.route() serves a minimal stub for that URL.
Slow (Playwright): run in the foreground; act through page.evaluate, rAF can stall headless."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
WORLD_ROUTE = "**/data/world_hochrhein.json"
CLIENT_ROUTE = "**/testhub/client.js"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")

# What the real client.js promises (plan "Contract for the hub client"): window.ggTesthub, then the ready event.
STUB = """
window.ggTesthub = {
  regs: {}, info: null, shot: null,
  register(id, fn, label) { this.regs[id] = { fn, label }; },
  setInfo(i) { this.info = i; },
  onScreenshot(fn) { this.shot = fn; },
};
window.__stubLoaded = true;
window.dispatchEvent(new Event('gg-testhub-ready'));
"""
# the same object, but already there before any page script runs (client.js beat the game module)
STUB_FIRST = """
window.ggTesthub = { regs: {}, info: null, shot: null,
  register(id, fn, label) { this.regs[id] = { fn, label }; }, setInfo(i) { this.info = i; }, onScreenshot(fn) { this.shot = fn; } };
"""


def new_page(p, server, query, block_world, viewport=(480, 270), serve_stub=True, init_script=None):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": viewport[0], "height": viewport[1]})
    if init_script:
        page.add_init_script(init_script)
    errors, client_requests = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda r: client_requests.append(r.url) if r.url.endswith("/testhub/client.js") else None)
    if serve_stub:
        page.route(CLIENT_ROUTE, lambda r: r.fulfill(status=200, content_type="text/javascript", body=STUB))
    if block_world:
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route(WORLD_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}", wait_until="domcontentloaded")
    return b, page, errors, client_requests


def start(page):
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)   # the first frame can take 30 s+ on a busy box


def test_loader_loads_the_client_only_in_dev_mode(server):
    with sync_playwright() as p:
        b, page, errors, requests = new_page(p, server, "", block_world=True)
        page.wait_for_timeout(3000)
        assert requests == [], "a player (no ?dev=1) must not request the hub client"
        assert page.evaluate("() => localStorage.getItem('gg-dev')") is None

        page.goto(f"{server}/prototype/index.html?dev=1", wait_until="domcontentloaded")
        page.wait_for_function("() => window.__stubLoaded === true", timeout=30000)
        assert page.evaluate("() => localStorage.getItem('gg-dev')") == "1"
        assert len(requests) == 1 and requests[0].endswith("/testhub/client.js"), requests

        requests.clear()
        page.goto(f"{server}/prototype/index.html", wait_until="domcontentloaded")   # the flag persists on the shared origin
        page.wait_for_function("() => window.__stubLoaded === true", timeout=30000)

        requests.clear()
        page.goto(f"{server}/prototype/index.html?dev=0", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        assert requests == [], "?dev=0 switches dev mode off again"
        assert page.evaluate("() => localStorage.getItem('gg-dev')") is None
        b.close()
    assert errors == []


def test_loader_survives_blocked_local_storage(server):
    blocked = "Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });"
    with sync_playwright() as p:
        b, page, errors, requests = new_page(p, server, "?dev=1", block_world=True, init_script=blocked)
        page.wait_for_function("() => window.__stubLoaded === true", timeout=30000)
        b.close()
    assert len(requests) == 1, requests
    assert not any("blocked" in e and "testhub" in e.lower() for e in errors), errors
