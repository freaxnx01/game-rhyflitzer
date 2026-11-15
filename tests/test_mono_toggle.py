"""#530: Ctrl+B shows the 3D view (#gl) in black and white and back; HUD and minimap stay in colour; a bare B stays look-back.
Hand-traced layout (world + terrain blocked): no data files needed. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
STYLE = "(sel) => { const s = getComputedStyle(document.querySelector(sel)); return { filter: s.filter, display: s.display, pe: s.pointerEvents }; }"


def test_ctrl_b_turns_the_3d_view_grey_and_back(server):
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
        page.keyboard.press("Control+b")
        page.wait_for_function("() => document.body.classList.contains('mono')", timeout=60000)
        gl, mp, photo = page.evaluate(STYLE, "#gl"), page.evaluate(STYLE, "#map"), page.evaluate(STYLE, "#oldphoto")
        toast = page.evaluate("() => document.querySelector('#toast').textContent")
        back = page.evaluate("() => window.__mm.cam().back")
        page.keyboard.press("Control+b")
        page.wait_for_function("() => !document.body.classList.contains('mono')", timeout=60000)
        gl2, photo2 = page.evaluate(STYLE, "#gl"), page.evaluate(STYLE, "#oldphoto")
        b.close()
    assert "grayscale(1)" in gl["filter"], gl
    assert mp["filter"] == "none", mp
    assert photo["display"] != "none" and photo["pe"] == "none", photo
    assert "Ctrl+B" in toast, toast
    assert not back
    assert gl2["filter"] == "none" and photo2["display"] == "none", (gl2, photo2)
    assert errors == []
