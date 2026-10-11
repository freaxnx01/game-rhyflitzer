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


def car(page):
    return page.evaluate("() => window.__mm.car()")


def go(page, target_id):
    page.evaluate("(id) => window.ggTesthub.regs[id].fn()", target_id)


def reg_ids(page):
    return page.evaluate("() => Object.keys(window.ggTesthub.regs)")


def test_registers_j_entries_and_wrecks_and_jumps_flag_the_race(server):
    with sync_playwright() as p:
        b, page, errors, _ = new_page(p, server, "?dev=1", block_world=True)
        start(page)
        page.wait_for_function("() => window.ggTesthub && Object.keys(window.ggTesthub.regs).length > 0", timeout=30000)
        ids, info = reg_ids(page), page.evaluate("() => window.ggTesthub.info")
        wreck = page.evaluate("() => window.__mm.underwater().wreck")
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is False

        go(page, "uw.boat")                                  # the wreck, 8 m east of it, facing it
        c1, th = car(page), page.evaluate("() => window.__mm.heading()")
        flags = page.evaluate("() => window.__mm.raceFlags()")
        go(page, [i for i in ids if i.startswith("j.")][-1])
        c2 = car(page)
        b.close()
    assert errors == []
    assert info == {"game": "rhyflitzer", "version": "0.2.0"}, info
    assert {"uw.boat", "uw.car"} <= set(ids) and not any(i.startswith("hideout.") for i in ids), ids
    assert len([i for i in ids if i.startswith("j.")]) >= 2, ids
    assert math.hypot(c1["x"] - (wreck[0] + 8), c1["z"] - wreck[1]) < 2, (c1, wreck)
    assert math.cos(th - math.pi) > 0.99, th
    assert flags["jumped"] is True, "a Testhub jump counts like a J jump"
    assert math.hypot(c2["x"] - c1["x"], c2["z"] - c1["z"]) > 20, "the j.* target moved the car"


def test_registers_when_the_client_was_there_before_the_game(server):
    with sync_playwright() as p:
        b, page, errors, requests = new_page(p, server, "", block_world=True, init_script=STUB_FIRST)   # no ?dev: nothing is fetched
        start(page)
        ids = reg_ids(page)
        b.close()
    assert requests == [] and errors == []
    assert "uw.boat" in ids and any(i.startswith("j.") for i in ids), ids


def test_screenshot_hook_returns_a_png_data_url_and_rejects_a_second_request(server):
    with sync_playwright() as p:
        b, page, errors, _ = new_page(p, server, "?dev=1", block_world=True)
        start(page)
        page.wait_for_function("() => window.ggTesthub && window.ggTesthub.shot", timeout=30000)
        downloads = []
        page.on("download", lambda d: downloads.append(d))
        url = page.evaluate("""() => Promise.race([window.ggTesthub.shot(),
            new Promise((_, no) => setTimeout(() => no(new Error('no frame in 90 s')), 90000))])""")
        both = page.evaluate("""async () => {
            const first = window.ggTesthub.shot();
            const second = await window.ggTesthub.shot().then(() => 'resolved', e => e.message);
            await first; return second; }""")
        page.wait_for_timeout(1000)
        b.close()
    assert errors == []
    assert url.startswith("data:image/png;base64,"), url[:40]
    assert len(url) > 5000, len(url)                      # a blank frame compresses to ~1 kB (see test_photo.py)
    assert both == "screenshot already pending", both
    assert downloads == [], "the hook returns the picture instead of downloading it"
