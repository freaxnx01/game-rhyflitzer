"""#7: the car selection screen -- Choose car opens it, the live car turns on the stage, stat bars and texts come from the
vehicle table, paint swatches recolour the body, the choice is remembered, a third table entry appears by itself. main has two
vehicles: the compact (paintable) and the DeLorean look-alike (#126, brushed steel, paint fixed).
Hand-traced layout (world + terrain blocked): no data files needed, deterministic and fast.
Slow (Playwright): run in the foreground."""
import json

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && window.__mm.carsel && document.querySelector('#worldstatus')?.textContent"
T = 120000
SLOW = "(() => { const c = window.__mm.vehicles().compact; c.drive.top = 30; c.mass = 2; return c; })()"


def open_page(p, server, phone=False, stored=None, query=""):
    b = p.chromium.launch(args=ARGS)
    if phone:
        # has_touch without is_mobile (see test_pause.py): index.html has no <meta name="viewport">, so is_mobile would lay out at 980 px
        ctx = b.new_context(viewport={"width": 360, "height": 740}, has_touch=True, locale="de-CH")
    else:
        ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    if stored is not None:
        ctx.add_init_script(f"try {{ localStorage.setItem('mm.car', {json.dumps(stored)}); }} catch (e) {{}}")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def carsel(page):
    return page.evaluate("() => window.__mm.carsel()")


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (see test_vehicles.py: a headless renderer can draw under 1 fps)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def open_carsel(page):
    page.click("#carbtn")
    page.wait_for_function("() => !document.querySelector('#carsel').hidden && window.__mm.carsel().open", timeout=T)


def lit_counts(page):
    return page.evaluate("() => [...document.querySelectorAll('#csstats .cs-stat')].map(s => ({ lit: s.querySelectorAll('.cs-cells i.lit, .cs-cells i.tip').length, score: +s.querySelector('.cs-score').textContent }))")


def test_choose_car_opens_the_screen_with_the_compact(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        assert page.evaluate("() => [...document.querySelector('#overlay .row').children].map(b => b.id)") == ["startbtn", "blitzbtn", "huntbtn", "carbtn", "stylebtn2"]
        open_carsel(page)
        wait_frames(page)
        got = carsel(page)
        shown = page.evaluate("""() => ({
            overlayHidden: document.querySelector('#overlay').hidden,
            role: document.querySelector('#carsel').getAttribute('role'), modal: document.querySelector('#carsel').getAttribute('aria-modal'),
            title: document.querySelector('#carseltitle').textContent, mode: document.querySelector('#carselmode').textContent,
            count: document.querySelector('#cscount').textContent,
            name: document.querySelector('#csname').textContent, cls: document.querySelector('#csclass').textContent,
            desc: document.querySelector('#csdesc').textContent,
            paintName: document.querySelector('#cspaintname').textContent,
            swatches: [...document.querySelectorAll('#cspaints button')].map(b => b.getAttribute('aria-pressed')),
            tiles: [...document.querySelectorAll('#csgarage button')].map(b => b.getAttribute('aria-pressed')),
            garage: document.querySelector('#csgaragelabel').textContent,
            back: document.querySelector('#csback').textContent, race: document.querySelector('#csrace').textContent })""")
        bars = lit_counts(page)
        b.close()
    assert shown["overlayHidden"] is True and shown["role"] == "dialog" and shown["modal"] == "true"
    assert shown["title"] == "Choose car" and shown["mode"] == "Time trial · Hochrhein" and shown["count"] == "Car 1 of 2"
    assert shown["name"] == "Sissle Speedster" and shown["cls"] == "Compact · Class B" and shown["desc"].startswith("Small, light")
    assert shown["paintName"] == "Navy" and shown["swatches"] == ["true"] + ["false"] * 10 and shown["tiles"] == ["true", "false"]
    assert shown["garage"] == "Garage · 2 vehicles" and shown["back"] == "‹ Back" and shown["race"] == "Race! ›"
    assert bars == [{"lit": 8, "score": 8}, {"lit": 8, "score": 8}, {"lit": 8, "score": 8}, {"lit": 3, "score": 3}]
    assert got["open"] is True and got["id"] == "compact" and got["paint"] == "navy" and got["focus"] == "csrace"
    assert got["carVisible"] is True and got["bodyColor"] == "1b2d5e" and got["paintable"] is True
    assert errors == []


def test_turntable_spins_and_esc_goes_back(server):
    """V before opening: the car must still show on the turntable and be hidden again after Back."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("KeyV"); wait_frames(page)
        assert page.evaluate("() => window.__mm.hud().carVisible") is False
        view_before = page.evaluate("() => window.__mm.cam().view")
        open_carsel(page)
        wait_frames(page); a0 = carsel(page)["angle"]
        wait_frames(page, 3); a1 = carsel(page)["angle"]              # idle: the turntable turns by itself
        page.keyboard.down("ArrowRight"); wait_frames(page, 3); a2 = carsel(page)["angle"]
        page.keyboard.up("ArrowRight"); wait_frames(page); a3 = carsel(page)["angle"]
        wait_frames(page, 2); a4 = carsel(page)["angle"]              # just released: still, auto resumes only after 2 s
        visible_on_stage = carsel(page)["carVisible"]
        no_game_key = page.evaluate("() => window.__mm.cam().view")
        page.keyboard.press("KeyC"); page.keyboard.press("KeyB"); wait_frames(page)
        view_inside = page.evaluate("() => window.__mm.cam().view")
        page.keyboard.press("Escape")
        page.wait_for_function("() => document.querySelector('#carsel').hidden && !document.querySelector('#overlay').hidden", timeout=T)
        wait_frames(page, 2)
        after = page.evaluate("() => ({ focus: document.activeElement?.id, view: window.__mm.cam().view, carVisible: window.__mm.hud().carVisible, open: window.__mm.carsel().open })")
        b.close()
    assert a1 != a0 and a2 != a1 and a4 == a3, (a0, a1, a2, a3, a4)
    assert visible_on_stage is True
    assert view_inside == view_before == no_game_key            # C is ignored while choosing
    assert after == {"focus": "carbtn", "view": view_before, "carVisible": False, "open": False}
    assert errors == []


def test_paint_recolours_and_persists(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_carsel(page)
        page.click("#cspaints button[data-paint=sunflower]")
        got = carsel(page)
        shown = page.evaluate("""() => ({ stored: localStorage.getItem('mm.car'), name: document.querySelector('#cspaintname').textContent,
            pressed: document.querySelector('#cspaints button[data-paint=sunflower]').getAttribute('aria-pressed'),
            focus: document.activeElement?.dataset?.paint })""")
        page.reload(timeout=240000, wait_until="commit"); page.wait_for_function(READY, timeout=240000)   # like test_i18n: the load event is slow on a loaded box
        reloaded = carsel(page)
        b.close()
    assert got["bodyColor"] == "ffc61a" and got["paint"] == "sunflower"
    assert json.loads(shown["stored"]) == {"id": "compact", "paint": "sunflower"} and shown["name"] == "Sunflower" and shown["pressed"] == "true"
    assert shown["focus"] == "sunflower"                        # the re-render kept the focus on the clicked swatch
    assert reloaded["bodyColor"] == "ffc61a" and reloaded["paint"] == "sunflower" and reloaded["open"] is False
    assert errors == []


@pytest.mark.parametrize("stored,query", [
    ('{"id":"tank","paint":"zebra"}', ""),
    ("not json", ""),
    (None, "?vehicle=tank"),
])
def test_bad_stored_choice_or_unknown_query_falls_back(server, stored, query):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, stored=stored, query=query)
        got = carsel(page)
        top = page.evaluate("() => window.__mm.vehicle().drive.top")
        b.close()
    assert got["id"] == "compact" and got["paint"] == "navy" and got["bodyColor"] == "1b2d5e" and top == 60
    assert errors == []


def test_third_vehicle_and_race(server):
    """A third table entry appears in the counter, ‹ ›, the garage and the bars without any change to the screen; Race! starts
    the run with it, in the current mode. The entry has no strings, so its id is the name. ‹ from the first car wraps to it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate(f"() => window.__mm.registerVehicle('slow', {SLOW})")
        open_carsel(page)
        count1 = page.text_content("#cscount")
        page.click("#csprev")
        page.wait_for_function("() => window.__mm.carsel().id === 'slow'", timeout=T)
        shown = page.evaluate("""() => ({ count: document.querySelector('#cscount').textContent, name: document.querySelector('#csname').textContent,
            cls: document.querySelector('#csclass').textContent, tiles: [...document.querySelectorAll('#csgarage button')].map(b => b.getAttribute('aria-pressed')),
            garage: document.querySelector('#csgaragelabel').textContent, top: window.__mm.vehicle().drive.top })""")
        bars = lit_counts(page)
        page.click("#csnext")                                       # wraps back to compact
        page.wait_for_function("() => window.__mm.carsel().id === 'compact'", timeout=T)
        page.click("#csgarage button[data-id=slow]")                # a tile selects too, and keeps the focus
        page.wait_for_function("() => window.__mm.carsel().id === 'slow'", timeout=T)
        tile_focus = page.evaluate("() => document.activeElement?.dataset?.id")
        page.click("#csrace")
        page.wait_for_function("() => document.querySelector('#carsel').hidden && document.querySelector('#overlay').hidden", timeout=T)
        raced = page.evaluate("() => ({ open: window.__mm.carsel().open, top: window.__mm.vehicle().drive.top, stored: localStorage.getItem('mm.car'), mode: window.__mm.blitz().mode })")
        b.close()
    assert count1 == "Car 1 of 3"
    assert shown["count"] == "Car 3 of 3" and shown["name"] == "slow" and shown["cls"] == "" and shown["tiles"] == ["false", "false", "true"]
    assert shown["garage"] == "Garage · 3 vehicles" and shown["top"] == 30
    assert bars[0] == {"lit": 4, "score": 4} and bars[3] == {"lit": 7, "score": 7}, bars
    assert tile_focus == "slow"
    assert raced["open"] is False and raced["top"] == 30 and raced["mode"] == "trial" and json.loads(raced["stored"]) == {"id": "slow", "paint": "navy"}
    assert errors == []


def test_delorean_has_fixed_paint_and_its_own_texts_and_bars(server):
    """#126's brushed-steel DeLorean look-alike: › shows it with real name / class / description, 7 / 5 / 7 / 3 and no paint choice."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_carsel(page)
        page.click("#csnext")
        page.wait_for_function("() => window.__mm.carsel().id === 'delorean'", timeout=T)
        fixed = page.evaluate("() => ({ disabled: [...document.querySelectorAll('#cspaints button')].every(b => b.disabled), name: document.querySelector('#cspaintname').textContent, paintable: window.__mm.carsel().paintable })")
        texts = page.evaluate("() => ({ count: document.querySelector('#cscount').textContent, name: document.querySelector('#csname').textContent, cls: document.querySelector('#csclass').textContent, desc: document.querySelector('#csdesc').textContent, model: window.__mm.vehicle().model })")
        bars = lit_counts(page)
        page.click("#csprev")
        page.wait_for_function("() => window.__mm.carsel().id === 'compact'", timeout=T)
        back = page.evaluate("() => ({ disabled: [...document.querySelectorAll('#cspaints button')].some(b => b.disabled), paintable: window.__mm.carsel().paintable })")
        b.close()
    assert fixed == {"disabled": True, "name": "fixed", "paintable": False}
    assert texts["count"] == "Car 2 of 2" and texts["model"] == "delorean" and texts["name"] == "Rhy Gullwing" and texts["cls"] == "Stainless coupé · Class B" and texts["desc"].startswith("Brushed steel")
    assert [b["score"] for b in bars] == [7, 5, 7, 3], bars
    assert back == {"disabled": False, "paintable": True}
    assert errors == []


def test_phone_layout_de(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, phone=True)
        open_carsel(page)
        wait_frames(page)
        got = page.evaluate("""() => { const cs = document.querySelector('#carsel'); return {
            title: document.querySelector('#carseltitle').textContent, count: document.querySelector('#cscount').textContent,
            labels: [...document.querySelectorAll('#csstats .cs-label')].map(e => e.textContent),
            scrollW: cs.scrollWidth, docScrollW: document.documentElement.scrollWidth,
            minBtn: Math.min(...[...cs.querySelectorAll('button')].map(b => b.getBoundingClientRect().height)),
            swatchRows: new Set([...document.querySelectorAll('#cspaints button')].map(b => Math.round(b.getBoundingClientRect().top))).size,
            nav: getComputedStyle(document.querySelector('#game-nav')).display, touch: getComputedStyle(document.querySelector('#touch')).display,
            race: document.querySelector('#csrace').textContent }; }""")
        b.close()
    assert got["title"] == "Auto wählen" and got["count"] == "Auto 1 von 2" and got["race"] == "Los! ›"
    assert got["labels"] == ["Höchsttempo", "Beschleunigung", "Handling", "Masse"]
    assert got["scrollW"] <= 360 and got["docScrollW"] <= 360, got
    assert got["minBtn"] >= 44, got
    assert got["swatchRows"] == 2, got                          # eleven swatches in a fixed six-column grid: 6 + 5
    assert got["nav"] == "none" and got["touch"] == "none"
    assert errors == []


def test_language_toggle_rerenders_the_open_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_carsel(page)
        page.click("#gg-lang-toggle")
        page.wait_for_function("() => document.querySelector('#cscount').textContent === 'Auto 1 von 2'", timeout=T)
        got = page.evaluate("""() => ({ title: document.querySelector('#carseltitle').textContent, name: document.querySelector('#csname').textContent,
            cls: document.querySelector('#csclass').textContent, paint: document.querySelector('#cspaintname').textContent,
            garage: document.querySelector('#csgaragelabel').textContent, race: document.querySelector('#csrace').textContent,
            prev: document.querySelector('#csprev').getAttribute('aria-label'), carbtn: document.querySelector('#carbtn').textContent })""")
        b.close()
    assert got == {"title": "Auto wählen", "name": "Sissle Speedster", "cls": "Kompakt · Klasse B", "paint": "Marine",
                   "garage": "Garage · 2 Fahrzeuge", "race": "Los! ›", "prev": "Vorheriges Fahrzeug", "carbtn": "Auto wählen"}
    assert errors == []


def test_car_mesh_follows_the_reset_after_a_run_is_abandoned(server):
    """#210: Main menu sends P back to the start; the mesh must go with it, or Choose car shows only the shadow."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("() => document.getElementById('startbtn').click()")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", polling=250, timeout=T)
        page.evaluate("() => window.__mm.step(2, ['KeyW', 'KeyA'])")        # drive off and turn: mesh and P leave the start
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", polling=250, timeout=T)
        page.evaluate("() => document.getElementById('pausemenu').click()")  # state is 'racing' after step: confirm the abandon
        page.wait_for_function("() => window.__mm.pause().confirm", polling=250, timeout=T)
        page.evaluate("() => document.getElementById('abandonok').click()")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", polling=250, timeout=T)
        got = page.evaluate("""() => { const c = window.__mm.car(), p = window.__mm.carPose();
            return { dx: p.pos[0] - c.x, dy: p.pos[1] - c.y, dz: p.pos[2] - c.z, yaw: p.rot[1] + window.__mm.heading() }; }""")
        b.close()
    assert max(abs(got["dx"]), abs(got["dy"]), abs(got["dz"])) < 1e-6, got
    assert abs(got["yaw"]) < 1e-6, got
    assert errors == []
