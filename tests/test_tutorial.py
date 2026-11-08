"""#534: the tutorial mode on Hochrhein (the OSM world; terrain blocked). Slow (Playwright): run in the foreground.
A first visit needs ?firstvisit=1: tests/hermetic_api.py seeds mm.tutorialDone in every other context."""
import math

from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.tutorial && window.__mm.plattform() && document.querySelector('#worldstatus')?.textContent"
T = 240000
DEFS = "async () => (await import('./tutorial.js')).TUTORIAL_DEFS.hochrhein"
FLAG = "() => localStorage.getItem('mm.tutorialDone')"
AIMED_AT_DSM = """() => { const v = window.__mm.views(), s = v.spots.find(q => q.id === 'plattform'), p = v.pose;
  const want = Math.atan2(s.sz - p.z, s.sx - p.x), have = Math.atan2(p.dz, p.dx);
  let d = Math.abs(want - have) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d < 0.3; }"""


def boot(p, server, query="", locale="en-US", phone=False):
    b = p.chromium.launch(args=ARGS)
    size = {"width": 390, "height": 844} if phone else {"width": 1280, "height": 720}
    page = b.new_context(viewport=size, has_touch=phone, locale=locale, accept_downloads=True).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def start(page):
    page.click("#tutorialbtn")
    page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)


def wait_step(page, step):
    page.wait_for_function("(s) => window.__mm.tutorial().step === s", arg=step, timeout=T)


def hold_until(page, keys, step):
    for k in keys:
        page.keyboard.down(k)
    wait_step(page, step)
    for k in keys:
        page.keyboard.up(k)


def hint(page):
    return page.text_content("#tuthint")


def caps(page):
    """#700: the keys in the banner as key graphics -- one <kbd> per key."""
    return page.evaluate("() => [...document.querySelectorAll('#tuthint kbd')].map(k => k.textContent)")


def cross_boxes(page):
    """#700: where the cross caps actually sit -- the layout is geometry, not text order (#700 review)."""
    return page.evaluate(
        """() => [...document.querySelectorAll('#tuthint .caps.cross')].map(c => [...c.querySelectorAll('kbd')]
            .map(k => { const r = k.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom]; }))"""
    )


def assert_cross(crosses):
    """#700: the top cap on its own row, centred over the middle of the three below -- not a scrambled row."""
    for top, left, down, right in crosses:
        assert top[3] < left[1] and abs(left[1] - down[1]) < 1 and abs(left[1] - right[1]) < 1, crosses
        assert abs(top[0] + top[2] - down[0] - down[2]) < 2 and left[0] < down[0] < right[0], crosses


def test_first_visit_preselects_the_tutorial_and_a_returning_player_gets_cruise(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?firstvisit=1")
        first = page.evaluate("() => ({ ...window.__mm.startScreen(), glow: document.querySelector('#tutorialbtn').classList.contains('first'), label: document.querySelector('#tutorialbtn').textContent })")
        flag = page.evaluate(FLAG)
        b.close()
        b2, page2, errors2 = boot(p, server)
        again = page2.evaluate("() => ({ focus: document.activeElement.id, glow: document.querySelector('#tutorialbtn').classList.contains('first') })")
        b2.close()
    assert flag is None
    assert first["focus"] == "tutorialbtn" and first["mode"] == "tutorial" and first["glow"] is True and first["label"] == "Tutorial", first
    assert first["text"].startswith("New here?"), first
    assert again == {"focus": "cruisebtn", "glow": False}, again
    assert errors == [] and errors2 == []


def test_the_tutorial_runs_through_every_step_and_marks_itself_done(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?firstvisit=1")
        defs = page.evaluate(DEFS)
        start(page)
        begin = page.evaluate("() => ({ ...window.__mm.car(), road: window.__mm.roadDist(), line: document.querySelector('#tl .mode').textContent, pips: document.querySelector('#pips').children.length, clock: getComputedStyle(document.querySelector('#tr')).display })")
        page.wait_for_function("() => document.querySelector('#tuthint').textContent !== ''", timeout=T)
        hints = {"drive": hint(page)}
        kbds = {"drive": caps(page)}
        crosses = {"drive": cross_boxes(page)}
        node = page.evaluate("() => { window.__tutNode = document.querySelector('#tuthint').firstChild; return true; }")
        page.wait_for_timeout(500)
        kept = page.evaluate("() => document.querySelector('#tuthint').firstChild === window.__tutNode")   # not rewritten while the hint stays the same
        hold_until(page, ["KeyW", "KeyD"], "brake")
        hold_until(page, ["KeyS"], "checkpoints")
        hints["checkpoints"] = hint(page)
        kbds["checkpoints"] = caps(page)
        roads = []
        for k, cp in enumerate(defs["cps"], start=1):
            page.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [cp["x"], cp["z"]])
            roads.append(page.evaluate("() => window.__mm.roadDist()"))
            if k < len(defs["cps"]):
                page.wait_for_function("(k) => window.__mm.toast().text === `Checkpoint ${k}/3`", arg=k, timeout=T)
        wait_step(page, "nitro")
        hints["nitro"] = hint(page)
        kbds["nitro"] = caps(page)
        hold_until(page, ["ShiftLeft", "KeyW"], "jump")
        hints["jump"] = hint(page)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        page.keyboard.type("Plattform")
        page.click("#jumplist li:has-text('Plattform Sisslerfeld')")
        wait_step(page, "getOut")
        page.keyboard.press("z")
        wait_step(page, "climb")
        out = page.evaluate("() => window.__mm.foot()")
        hints["climb"] = hint(page)
        kbds["climb"] = caps(page)
        plat = page.evaluate("() => window.__mm.plattform()")
        u = 9.84 / (2 * math.sqrt(3)) - 1   # 1 m inside the deck edge, as in test_plattform_stair.py
        x, z = plat["x"] + u * math.cos(plat["facing"]), plat["z"] + u * math.sin(plat["facing"])
        th = math.atan2(345.1 - z, 1065.2 - x)   # the DSM chimney landmark
        page.evaluate("([x, z, th, y]) => { window.__mm.place(x, z, th); window.__mm.setFootY(y); window.__mm.footSim(0.1, []); }", [x, z, th, plat["deckY"]])
        wait_step(page, "photo")
        page.wait_for_function(AIMED_AT_DSM, timeout=120000)
        page.keyboard.press("KeyX")
        wait_step(page, "getIn")
        page.wait_for_function("() => window.__mm.tutorial().target?.label === 'Stair down'", timeout=T)
        top = page.evaluate("() => window.__mm.tutorial().target")
        hints["down"] = hint(page)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [out["x"], out["z"]])
        page.wait_for_function("() => window.__mm.tutorial().target?.label === 'Your car'", timeout=T)
        hints["back"] = hint(page)
        page.keyboard.press("z")
        page.wait_for_function("() => window.__mm.tutorial().done", timeout=T)
        end = page.evaluate("() => ({ ...window.__mm.tutorial(), flag: localStorage.getItem('mm.tutorialDone'), toast: window.__mm.toast().text })")
        b.close()
    assert math.hypot(begin["x"] - defs["start"]["x"], begin["z"] - defs["start"]["z"]) < 3, begin
    assert begin["road"] < 4 and all(r < 4 for r in roads), (begin, roads)   # start and checkpoints sit on a road
    assert begin["line"] == "Tutorial · Hochrhein" and begin["pips"] == 9 and begin["clock"] == "none", begin
    assert "WASD" in hints["drive"] and "20 km/h" in hints["drive"], hints
    assert "checkpoint 1 of 3" in hints["checkpoints"], hints
    assert "Shift" in hints["nitro"] and "J" in hints["jump"] and "WASD" in hints["climb"], hints
    assert kbds["drive"] == ["W", "A", "S", "D", "↑", "←", "↓", "→"] and " or " in hints["drive"], (kbds, hints)   # #700: the two crosses
    assert_cross(crosses["drive"])   # #700: and both really sit as a cross, not a scrambled row
    assert kbds["climb"] == kbds["drive"] and kbds["nitro"] == ["Shift"] and kbds["checkpoints"] == [], kbds
    assert node and kept, "the banner was rewritten on an unchanged hint"
    assert "stair" in hints["down"] and "mouse" in hints["down"] and "car" in hints["back"], hints
    assert math.hypot(top["x"] - plat["x"], top["z"] - plat["z"]) <= 2.41, top   # the arrow on the deck leads round the rail to the stair (2.4 m from the centre), not over the parapet at the car
    assert end["step"] == "done" and end["done"] is True and end["flag"] == "1", end
    assert end["toast"].startswith("Well done!"), end
    assert errors == []


def test_esc_offers_end_tutorial_which_marks_it_done_and_returns_to_cruise(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?firstvisit=1")
        start(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        shown = page.evaluate("() => Object.fromEntries(['pauserestart', 'pausemenu', 'pausetutorial'].map(i => [i, !document.getElementById(i).hidden]))")
        seen = []
        for _ in range(5):
            page.keyboard.press("ArrowDown")
            seen.append(page.evaluate("() => document.activeElement.id"))
        page.click("#pausetutorial")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        after = page.evaluate("() => ({ abandon: !document.querySelector('#abandon').hidden, focus: document.activeElement.id, glow: document.querySelector('#tutorialbtn').classList.contains('first'), flag: localStorage.getItem('mm.tutorialDone') })")
        b.close()
    assert shown == {"pauserestart": False, "pausemenu": False, "pausetutorial": True}, shown
    assert seen == ["pausevehicle", "pauseabout", "pausekeybar", "pausetutorial", "pauseresume"], seen
    assert after == {"abandon": False, "focus": "cruisebtn", "glow": False, "flag": "1"}, after
    assert errors == []


def test_on_a_phone_the_hint_speaks_touch_and_german(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, locale="de-CH", phone=True)
        page.tap("#tutorialbtn")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.wait_for_function("() => document.querySelector('#tuthint').textContent !== ''", timeout=T)
        got = page.evaluate("""async () => ({ hint: document.querySelector('#tuthint').textContent, pips: document.querySelector('#pips').children.length,
            kbd: document.querySelectorAll('#tuthint kbd').length,
            steps: (await import('./tutorial.js')).stepsFor(true).length - 1 })""")
        b.close()
    assert got["hint"].startswith("Fahr los mit ") and "WASD" not in got["hint"], got
    assert got["kbd"] == 0, got   # touch hints stay text (#700)
    assert got["pips"] == got["steps"], got
    assert errors == []