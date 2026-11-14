"""#551: cruise -- the default mode, no clock, no checkpoints. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent && (() => { const id = window.__mm.carsel?.().id, d = id && window.__mm.vehicles?.()[id]; return !!d && (!d.gltf || ['ready', 'failed'].includes(window.__mm.gltfVehicle(d.gltf.id).state)); })()"
T = 240000
SHOWN = "(s) => getComputedStyle(document.querySelector(s)).display !== 'none'"


def boot(p, server, query=""):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def test_cruise_is_preselected_and_enter_starts_it(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start = page.evaluate("() => ({ focus: document.activeElement.id, text: document.querySelector('#ovtext').textContent, label: document.querySelector('#cruisebtn').textContent })")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.keyboard.down("KeyW"); page.wait_for_timeout(1500); page.keyboard.up("KeyW")
        s = page.evaluate("() => ({ ...window.__mm.hunt(), mode: window.__mm.blitz().mode })")
        line = page.text_content("#tl .mode")
        shown = {sel: page.evaluate(SHOWN, sel) for sel in ["#tr", "#arrow", "#dist", "#cpname", "#pips"]}
        b.close()
    assert start["focus"] == "cruisebtn" and "No clock" in start["text"] and start["label"] == "Cruise", start
    assert s["mode"] == "cruise" and s["state"] == "armed" and not s["cpsVisible"] and s["boxesVisible"] == 0, s
    assert line == "Cruising · Hochrhein"
    assert shown == {"#tr": False, "#arrow": False, "#dist": False, "#cpname": False, "#pips": False}, shown
    assert errors == []


def test_cruise_pause_has_no_restart_and_main_menu_goes_straight_back(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#cruisebtn")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        restart_hidden = page.evaluate("() => document.querySelector('#pauserestart').hidden")
        seen = []
        for _ in range(4):
            page.keyboard.press("ArrowDown")
            seen.append(page.evaluate("() => document.activeElement.id"))
        page.click("#pausemenu")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        after = page.evaluate("() => ({ abandon: !document.querySelector('#abandon').hidden, focus: document.activeElement.id, mode: window.__mm.blitz().mode })")
        b.close()
    assert restart_hidden is True
    assert seen == ["pausevehicle", "pausestyle", "pauseabout", "pausesettings"], seen   # #773: the style switch after Change vehicle; #842: Settings after About
    assert after == {"abandon": False, "focus": "cruisebtn", "mode": "cruise"}, after
    assert errors == []


def test_mode_query_preselects_the_time_trial(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?mode=trial")
        got = page.evaluate("() => ({ focus: document.activeElement.id, mode: window.__mm.blitz().mode, line: document.querySelector('#tl .mode').textContent })")
        b.close()
    assert got == {"focus": "startbtn", "mode": "trial", "line": "Time trial · Hochrhein"}, got
    assert errors == []