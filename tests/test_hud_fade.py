"""#773: the secondary HUD fades to a ghost after 4 s of game time and wakes for 3 s on a change; damage only above 0;
the key bar ghosts after 30 s and returns on a new context; cruise hides the clock and the target; the compass lives
in the minimap; #stylebtn is gone; the footer hides while driving. Hand layout (terrain + world blocked), game time
through window.__mm.hudFade(secs) -- never wall-clock waits. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && window.__mm.hudFade && document.querySelector('#worldstatus')?.textContent"
T = 120000
SHOWN = "(s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }"
FADE = "(secs) => window.__mm.hudFade(secs)"


def open_hand(p, server, start="#cruisebtn", query=""):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=240000)
    page.click(start)
    page.wait_for_function("() => ['armed', 'racing'].includes(window.__mm.pause().state) && window.__mm.pause().frame >= 5", timeout=T)
    return b, page, errors


def ghost(page, sel):
    return page.evaluate("(s) => document.querySelector(s).classList.contains('ghost')", sel)


def test_secondary_hud_ghosts_after_four_seconds_and_wakes_on_change(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        lit = page.evaluate(FADE, 0)
        after = page.evaluate(FADE, 5)                       # 5 s of game time, no change
        classes = {s: ghost(page, s) for s in ["#tl", "#gearplate", "#tripplate", "#roadname"]}
        kept = page.evaluate("() => ['speedo', 'br', 'pausebtn'].map(id => document.getElementById(id).classList.contains('ghost'))")
        page.evaluate("() => window.__mm.sim(1882.9, -292.2, Math.PI, 20, 1, [])")   # rolls at 72 km/h: a gear, not N
        page.wait_for_function("() => document.querySelector('#gearn').textContent !== 'N'", timeout=T)
        woke = page.evaluate(FADE, 0)
        still = page.evaluate(FADE, 2.5)                     # frames between the calls add up to 0.05 s each, so stay clear of the 3 s edge
        faded = page.evaluate(FADE, 0.6)
        b.close()
    assert lit["phases"]["tl"] == "awake" and lit["phases"]["gearplate"] == "awake", lit
    assert after["phases"]["tl"] == "ghost" and after["phases"]["gearplate"] == "ghost" and after["phases"]["tripplate"] == "ghost", after
    assert all(classes.values()), classes
    assert kept == [False, False, False]                      # speed, map, pause never fade
    assert woke["phases"]["gearplate"] == "awake" and woke["phases"]["tl"] == "ghost"], woke   # only the changed plate wakes
    assert still["phases"]["gearplate"] == "awake" and faded["phases"]["gearplate"] == "ghost"], (still, faded)
    assert errors == []


def test_damage_plate_appears_only_above_zero(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        fresh = page.evaluate(FADE, 0)
        gone = page.evaluate("() => getComputedStyle(document.getElementById('dmgplate')).display")
        page.evaluate("() => window.__mm.setDamage(0.3)")
        page.wait_for_function("() => document.querySelector('#dmgpct').textContent !== '0%'", timeout=T)
        hurt = page.evaluate(FADE, 0)
        shown = page.evaluate("() => getComputedStyle(document.getElementById('dmgplate')).display")
        later = page.evaluate(FADE, 4)
        b.close()
    assert fresh["phases"]["dmgplate"] == "hidden" and gone == "none", (fresh, gone)
    assert hurt["phases"]["dmgplate"] == "awake" and shown != "none", (hurt, shown)
    assert later["phases"]["dmgplate"] == "ghost", later
    assert errors == []


def test_key_bar_ghosts_after_thirty_seconds_and_returns_on_a_new_context(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        car = page.evaluate(FADE, 0)
        later = page.evaluate(FADE, 31)
        page.evaluate("() => window.__mm.place(1810, 610, 0)")
        page.keyboard.press("z")                               # out of the car: the foot context
        page.wait_for_function("() => window.__mm.keybar().ctx === 'foot'", timeout=T)
        foot = page.evaluate(FADE, 0)
        b.close()
    assert car["keybar"] == "awake" and later["keybar"] == "ghost" and foot["keybar"] == "awake"], (car, later, foot)
    assert errors == []


def test_cruise_hides_the_clock_and_the_target_and_the_trial_shows_them(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        cruise = {s: page.evaluate(SHOWN, s) for s in ["#tr", "#pips", "#arrow", "#dist", "#cpname", "#tl", "#bl", "#br"]}
        cruise_phases = page.evaluate(FADE, 0)["phases"]
        b.close()
    with sync_playwright() as p:
        b, page, errors2 = open_hand(p, server, start="#startbtn", query="?mode=trial")
        trial = {s: page.evaluate(SHOWN, s) for s in ["#tr", "#pips", "#arrow", "#tl"]}
        trial_phases = page.evaluate(FADE, 5)["phases"]
        time_ghost = ghost(page, "#time"); best_ghost = ghost(page, "#best")
        b.close()
    assert cruise == {"#tr": False, "#pips": False, "#arrow": False, "#dist": False, "#cpname": False, "#tl": True, "#bl": True, "#br": True}, cruise
    assert cruise_phases["best"] == "hidden"                   # the fader never wakes what the mode hides
    assert trial == {"#tr": True, "#pips": True, "#arrow": True, "#tl": True}, trial
    assert trial_phases["best"] == "ghost" and best_ghost and not time_ghost   # Bestzeit fades, the clock stays lit
    assert errors == [] and errors2 == []


def test_compass_is_in_the_minimap_and_the_style_button_and_footer_are_gone(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = page.evaluate("() => { const c = window.__mm.car(); return [c.x, c.z]; }")
        page.evaluate(f"() => window.__mm.sim({x}, {z}, 0, 0, 0.02, [])")      # heading +x = east
        page.wait_for_function("() => document.getElementById('maphead').textContent.startsWith('E ')", timeout=T)
        east = page.evaluate(FADE, 0)
        page.evaluate(f"() => window.__mm.sim({x}, {z}, -Math.PI / 2, 0, 0.02, [])")   # heading -z = north
        page.wait_for_function("() => document.getElementById('maphead').textContent === 'N 0°'", timeout=T)
        gone = page.evaluate("() => ['compass', 'stylebtn'].map(id => document.getElementById(id) === null)")
        nav_driving = page.evaluate(SHOWN, "#game-nav")
        page.click("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        nav_paused = page.evaluate(SHOWN, "#game-nav")
        pausestyle = page.evaluate(SHOWN, "#pausestyle")
        b.close()
    assert east["compass"] is False and east["heading"] == "E 90°", east
    assert gone == [True, True]
    assert nav_driving is False and nav_paused is True and pausestyle is True
    assert errors == []
