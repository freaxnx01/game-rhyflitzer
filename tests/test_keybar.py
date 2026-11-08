"""#535: the key bar -- car entries, foot entries after Z, E eintreten at a glowing door, the pause toggle survives a reload.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
ROAD = (1810, 610)      # on the Bahnhofstrasse, 56 m past checkpoint 1 (Sisseln, trigger radius 7 m): its toast cannot replace a "Stop first"


def open_hand(p, server, start="#startbtn"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    if start:
        page.click(start)
    return b, page, errors


def press_z(page):
    page.keyboard.press("z")
    page.wait_for_timeout(200)


BAR = "() => window.__mm.keybar()"


def test_bar_follows_the_context_and_the_language(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.evaluate("() => window.ggSetLang('de')")
        car = page.evaluate(BAR)
        car_kbd = page.evaluate("() => [...document.querySelector('#keybar span').querySelectorAll('kbd')].map(k => k.textContent)")
        boxes = page.evaluate("""() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
          return { bar: r('#keybar'), bl: r('#bl'), br: r('#br'), pe: getComputedStyle(document.querySelector('#keybar')).pointerEvents }; }""")
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        foot = page.evaluate(BAR)
        page.evaluate(f"() => window.__mm.enterables.setReady('plattform-sisslerfeld', true, [{x + 12}, {z}])")
        page.evaluate(f"() => window.__mm.place({x + 10}, {z}, 0)")
        page.wait_for_function("() => window.__mm.enterables.prompt() === 'plattform-sisslerfeld'", timeout=60000)
        door = page.evaluate(BAR)
        page.evaluate("() => window.ggSetLang('en')")
        door_en = page.evaluate(BAR)
        page.evaluate("() => window.__mm.enterables.setReady('plattform-sisslerfeld', false)")
        b.close()
    overlap = lambda a, c: not (a[2] <= c[0] or c[2] <= a[0] or a[3] <= c[1] or c[3] <= a[1])
    assert errors == []
    assert car["shown"] and car["text"] == "WASD fahrenShift NitroZ aussteigenJ springenC KameraF1 alle Tasten", car
    assert car_kbd == ["W", "A", "S", "D"], car_kbd   # #700: four caps, not one "WASD"
    assert boxes["pe"] == "none" and not overlap(boxes["bar"], boxes["bl"]) and not overlap(boxes["bar"], boxes["br"]), boxes
    assert foot["ctx"] == "foot" and foot["text"].startswith("WASD gehenSpace springenZ einsteigen") and "Kamera" not in foot["text"], foot
    assert door["action"] == "enter" and door["text"].startswith("E eintreten"), door
    assert door_en["text"].startswith("E enter"), door_en


def test_bar_hidden_on_the_start_screen_and_in_the_help(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server, start=None)
        start = page.evaluate(BAR)
        page.click("#startbtn")
        racing = page.evaluate(BAR)
        page.keyboard.press("F1")
        page.wait_for_function("() => window.__mm.hud().help", timeout=60000)
        help_open = page.evaluate(BAR)
        page.keyboard.press("F1")
        page.wait_for_function("() => !window.__mm.hud().help", timeout=60000)
        back = page.evaluate(BAR)
        b.close()
    assert errors == []
    assert (start["shown"], racing["shown"], help_open["shown"], back["shown"]) == (False, True, False, True)


def test_pause_toggle_hides_the_bar_and_survives_a_reload(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        page.click("#pausekeybar")
        label = page.text_content("#pausekeybar")
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=120000)
        off = page.evaluate(BAR)
        page.reload()
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.click("#startbtn")
        reloaded = page.evaluate(BAR)
        page.evaluate("() => localStorage.removeItem('mm.keybar')")
        b.close()
    assert errors == []
    assert label in ("Key bar: off", "Tastenleiste: aus"), label
    assert off["on"] is False and off["shown"] is False, off
    assert reloaded["on"] is False and reloaded["shown"] is False, reloaded
