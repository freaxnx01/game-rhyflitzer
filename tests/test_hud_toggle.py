"""#305: Ctrl+H hides every HUD element and shows them again; the toast still speaks, a bare H stays the horn.
Hand-traced layout (world + terrain blocked): no data files needed. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
HUD_PARTS = ["#tl", "#tr", "#compass", "#bl", "#br", "#pausebtn", "#arrow", "#game-nav"]
SHOWN = "(ids) => ids.map(id => { const e = document.querySelector(id); return !!e && getComputedStyle(e).visibility !== 'hidden'; })"


def test_ctrl_h_hides_the_hud_and_brings_it_back(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US").new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function(READY, timeout=240000)
        page.click("#startbtn", timeout=180000)
        before = page.evaluate(SHOWN, HUD_PARTS)
        page.keyboard.press("Control+h")
        page.wait_for_function("() => document.body.classList.contains('hud-off')", timeout=60000)
        hidden = page.evaluate(SHOWN, HUD_PARTS)
        toast = page.evaluate("() => [getComputedStyle(document.querySelector('#toast')).visibility, document.querySelector('#toast').textContent]")
        page.keyboard.press("Control+h")
        page.wait_for_function("() => !document.body.classList.contains('hud-off')", timeout=60000)
        after = page.evaluate(SHOWN, HUD_PARTS)
        b.close()
    assert all(before) and all(after), (before, after)
    assert not any(hidden), hidden
    assert toast[0] != "hidden" and "Ctrl+H" in toast[1], toast   # the toast says how to get it back
    assert errors == []
