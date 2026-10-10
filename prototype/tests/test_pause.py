"""#83: Esc / P / the II button pause a run; the menu resumes, restarts or goes back to the start screen (asking
"Abandon this run?" first while the race clock runs); a hidden tab pauses. Hand-traced layout (world + terrain blocked): no data files needed, deterministic and fast.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 120000
HIDE = """(h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}"""


def open_page(p, server, phone=False, start=True):
    b = p.chromium.launch(args=ARGS)
    if phone:
        # has_touch without is_mobile, like every other test here: index.html has no <meta name="viewport">, so
        # mobile emulation would lay the page out at 980 CSS px and no phone media query would fire at all.
        ctx = b.new_context(viewport={"width": 360, "height": 640}, has_touch=True, locale="de-CH")
    else:
        ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    if start:
        page.click("#startbtn")
    return b, page, errors


def pause(page):
    return page.evaluate("() => window.__mm.pause()")


def wait_frames(page, n=5):
    f = pause(page)["frame"]
    page.wait_for_function(f"() => window.__mm.pause().frame >= {f + n}", timeout=T)


def drive(page):
    page.keyboard.down("Space")
    page.wait_for_function("() => window.__mm.pause().state === 'racing' && window.__mm.pause().t > 0.3", timeout=T)


def test_esc_freezes_timer_car_and_sound(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        drive(page)
        page.keyboard.press("Escape")
        page.keyboard.up("Space")   # released while paused: must not press the focused Resume button
        page.wait_for_function("() => window.__mm.pause().on && window.__mm.pause().audio === 'suspended'", timeout=T)
        s1 = pause(page)
        visible = page.is_visible("#pause")
        wait_frames(page)
        s2 = pause(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.pause().on && window.__mm.pause().audio === 'running'", timeout=T)
        hidden = not page.is_visible("#pause")
        page.keyboard.down("Space")
        page.wait_for_function(f"() => window.__mm.pause().t > {s1['t']}", timeout=T)
        b.close()
    assert visible and hidden
    assert s1["focus"] == "pauseresume"
    assert s2["on"] and (s2["t"], s2["x"], s2["z"]) == (s1["t"], s1["x"], s1["z"])
    assert errors == []


def test_p_pauses_and_game_keys_are_silent(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        view = page.evaluate("() => window.__mm.cam().view")
        page.keyboard.down("KeyP")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.keyboard.down("KeyP")   # auto-repeat: must not resume
        page.keyboard.up("KeyP")
        still = pause(page)["on"]
        for k in ["KeyW", "KeyC", "KeyJ", "KeyH", "F1", "Tab"]:
            page.keyboard.down(k)
        silent = page.evaluate("""() => ({ keys: window.__mm.keysDown(), jump: !document.querySelector('#jump').hidden,
            help: !document.querySelector('#help').hidden, view: window.__mm.cam().view, focus: window.__mm.pause().focus })""")
        for k in ["KeyW", "KeyC", "KeyJ", "KeyH", "F1", "Tab"]:
            page.keyboard.up(k)
        dbg0 = page.evaluate("() => window.__mm.debug().on")
        page.keyboard.press("F3")
        dbg1 = page.evaluate("() => window.__mm.debug().on")
        page.keyboard.press("KeyP")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=T)
        b.close()
    assert still
    assert silent == {"keys": [], "jump": False, "help": False, "view": view, "focus": "pauserestart"}   # Tab moved the focus
    assert dbg1 != dbg0
    assert errors == []


def test_keyboard_navigation_and_main_menu_asks_first(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start = page.evaluate("() => window.__mm.car()")
        drive(page)
        page.keyboard.up("Space")
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        seen = [pause(page)["focus"]]
        for k in ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "Tab", "Shift+Tab"]:
            page.keyboard.press(k)
            seen.append(pause(page)["focus"])
        before = pause(page)
        page.keyboard.press("Enter")   # on "Main menu" with the clock running: the question, not the start screen
        page.wait_for_function("() => window.__mm.pause().confirm", timeout=T)
        q = pause(page)
        q_shown = page.is_visible("#abandon") and not page.is_visible("#pause") and page.is_hidden("#overlay")
        q_text = [page.text_content(sel) for sel in ["#abandontitle", "#abandoncancel", "#abandonok"]]
        role = page.get_attribute("#abandon", "role")
        page.keyboard.press("KeyP")   # ignored in the question
        still = pause(page)
        page.keyboard.press("Escape")   # Esc = Cancel: back to the pause menu, focus on Main menu
        page.wait_for_function("() => !window.__mm.pause().confirm", timeout=T)
        back = pause(page)
        back_shown = page.is_visible("#pause") and not page.is_visible("#abandon")
        page.keyboard.press("Enter")
        page.wait_for_function("() => window.__mm.pause().confirm", timeout=T)
        page.keyboard.press("ArrowDown")
        on_abandon = pause(page)["focus"]
        page.keyboard.press("Enter")   # Abandon
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        s = pause(page)
        car = page.evaluate("() => window.__mm.car()")
        start_text = page.text_content("#startbtn")
        gone = not page.is_visible("#pause") and not page.is_visible("#abandon")
        b.close()
    assert seen == ["pauseresume", "pausevehicle", "pauserestart", "pausemenu", "pauseresume", "pausemenu", "pauseresume", "pausemenu"]
    assert q_shown and role == "alertdialog" and q_text == ["Abandon this run?", "Cancel", "Abandon"]
    assert (q["on"], q["confirm"], q["focus"], q["t"], q["state"]) == (True, True, "abandoncancel", before["t"], "racing")
    assert (still["on"], still["confirm"]) == (True, True)
    assert back_shown and (back["on"], back["focus"], back["t"]) == (True, "pausemenu", before["t"])
    assert on_abandon == "abandonok"
    assert (s["on"], s["confirm"], s["state"], s["t"], s["focus"], s["best"]) == (False, False, "ready", 0, "startbtn", before["best"])
    assert gone and start_text == "Start"
    assert abs(car["x"] - start["x"]) < 0.5 and abs(car["z"] - start["z"]) < 0.5   # back at START (an armed car may settle a little)
    assert errors == []


def test_main_menu_without_a_running_race_goes_straight_back(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)   # started, car not moved: 'armed', no clock
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on && window.__mm.pause().state === 'armed'", timeout=T)
        page.click("#pausemenu")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        s = pause(page)
        asked = page.is_visible("#abandon")
        b.close()
    assert (s["on"], s["confirm"], s["state"]) == (False, False, "ready") and not asked
    assert errors == []


def test_restart_race(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start = page.evaluate("() => window.__mm.car()")
        drive(page)
        page.keyboard.up("Space")
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.click("#pauserestart")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=T)
        s = pause(page)
        car = page.evaluate("() => window.__mm.car()")
        overlay_hidden = page.evaluate("() => document.querySelector('#overlay').hidden")
        flags = page.evaluate("() => window.__mm.raceFlags()")
        b.close()
    assert (s["state"], s["t"]) == ("armed", 0)
    assert overlay_hidden and not any(flags.values())
    assert abs(car["x"] - start["x"]) < 0.5 and abs(car["z"] - start["z"]) < 0.5   # back at START (an armed car may settle a little)
    assert errors == []


def test_esc_with_the_help_open_closes_the_help_first(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("F1")
        page.keyboard.press("Escape")
        first = page.evaluate("() => ({ help: !document.querySelector('#help').hidden, paused: window.__mm.pause().on })")
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        b.close()
    assert first == {"help": False, "paused": False}
    assert errors == []


def test_hidden_tab_pauses_and_stays_paused_but_not_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, start=False)
        page.evaluate(HIDE, True)
        on_start_screen = pause(page)["on"]
        page.evaluate(HIDE, False)
        page.click("#startbtn")
        page.evaluate(HIDE, True)
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.evaluate(HIDE, False)
        wait_frames(page)
        back = pause(page)["on"]
        b.close()
    assert on_start_screen is False
    assert back is True
    assert errors == []


def test_phone_pause_button_and_menu_fit(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, phone=True)
        btn = page.locator("#pausebtn").bounding_box()
        page.tap("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        fit = page.evaluate("""() => ({
            buttons: ['pauseresume', 'pausevehicle', 'pauserestart', 'pausemenu'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect();
              return { text: e.textContent, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, clipped: e.scrollWidth > e.clientWidth }; }),
            pageWidth: document.documentElement.scrollWidth,
            nav: getComputedStyle(document.getElementById('game-nav')).display,
            label: document.getElementById('pausebtn').getAttribute('aria-label') })""")
        page.tap("#pauseresume")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=T)
        b.close()
    assert btn["x"] >= 0 and btn["x"] + btn["width"] <= 360 and btn["width"] >= 44 and btn["height"] >= 44
    assert [x["text"] for x in fit["buttons"]] == ["Weiter", "Fahrzeug wechseln", "Rennen neu starten", "Hauptmenü"]
    assert all(x["inside"] and not x["clipped"] for x in fit["buttons"])
    assert fit["pageWidth"] <= 360 and fit["nav"] == "none" and fit["label"] == "Pause"
    assert errors == []


def test_phone_abandon_confirmation_fits_and_taps(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, phone=True)
        drive(page)
        page.keyboard.up("Space")
        page.tap("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        page.tap("#pausemenu")
        page.wait_for_function("() => window.__mm.pause().confirm", timeout=T)
        fit = page.evaluate("""() => ({
            title: document.getElementById('abandontitle').textContent,
            buttons: ['abandoncancel', 'abandonok'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect();
              return { text: e.textContent, h: r.height, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, clipped: e.scrollWidth > e.clientWidth }; }),
            pageWidth: document.documentElement.scrollWidth,
            nav: getComputedStyle(document.getElementById('game-nav')).display,
            focus: document.activeElement.id })""")
        page.tap("#abandoncancel")
        page.wait_for_function("() => window.__mm.pause().on && !window.__mm.pause().confirm", timeout=T)
        back = page.is_visible("#pause")
        page.tap("#pausemenu")
        page.wait_for_function("() => window.__mm.pause().confirm", timeout=T)
        page.tap("#abandonok")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        s = pause(page)
        b.close()
    assert fit["title"] == "Diesen Lauf abbrechen?" and fit["focus"] == "abandoncancel"
    assert [x["text"] for x in fit["buttons"]] == ["Abbrechen", "Verwerfen"]
    assert all(x["inside"] and not x["clipped"] and x["h"] >= 44 for x in fit["buttons"])
    assert fit["pageWidth"] <= 360 and fit["nav"] == "none"
    assert back and (s["on"], s["state"]) == (False, "ready")
    assert errors == []


def test_pause_freezes_a_flight(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("KeyF")
        page.wait_for_function("() => window.__mm.fly().on", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        f1 = page.evaluate("() => window.__mm.fly()")
        page.keyboard.press("KeyF")   # ignored while paused
        wait_frames(page)
        f2 = page.evaluate("() => window.__mm.fly()")
        b.close()
    assert f2["on"] and (f2["x"], f2["y"], f2["z"]) == (f1["x"], f1["y"], f1["z"])
    assert errors == []


def test_pause_closes_an_open_jump_dialog(server):
    """Review of #90: pausing with the J dialog open must close it, or every key keeps going to the J dialog behind the
    pause menu (Esc closes J instead of resuming, Enter could teleport the car in a frozen run)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        page.click("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        jump_after_pause = page.evaluate("() => !document.querySelector('#jump').hidden")
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=T)
        b.close()
    assert not jump_after_pause, "J dialog still open behind the pause menu"
    assert not errors, errors
