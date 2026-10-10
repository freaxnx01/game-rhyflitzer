"""#176: data-derived names (OSM street names, region landmark/Gemeinde data, vehicle ids) must never run script
through innerHTML. The payload is served two ways:

* the world file (`data/world_hochrhein.json`): every named road is renamed, which is the real untrusted path --
  street names reach the O/I list rows and the autopilot/Navi toasts straight from OpenStreetMap;
* `prototype/landmarks.js`: one landmark name and one Gemeinde are renamed in the served module text. Those lists
  are hand-kept constants today, so a poisoned world cannot reach them -- the region editor (#166 to #169) will
  generate them, and this is what that will look like.

Slow (Playwright): run in the foreground under a memory cap.
"""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
LANDMARKS = Path(__file__).parents[2] / "prototype" / "landmarks.js"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
WORLD_ROUTE = "**/data/world_hochrhein.json"
LANDMARKS_ROUTE = "**/prototype/landmarks.js"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

PAYLOAD = '<img src=x onerror="window.__xss=1">'
TAIL = " & Co"                                  # an ampersand too: a real OSM name may carry one (acceptance criterion)
POISON = PAYLOAD + TAIL
LANDMARK = "Smile-Kreisel"                      # the landmark whose name is poisoned (Gemeinde Sisseln, anchor-positioned)
GEMEINDE = "Sisseln"                            # the Gemeinde that is poisoned, in GEMEINDEN and in every entry that names it
XSS = "() => window.__xss"
SLOW = "(() => { const c = window.__mm.vehicles().compact; c.drive.top = 30; return c; })()"


def poisoned_world():
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    for road in w["roads"]:
        if road.get("n"):
            road["n"] = POISON + " " + road["n"]
    for body in w["water"]:
        if body.get("name"):
            body["name"] = POISON + " " + body["name"]
    w["anchors"]["cps"] = [{**c, "n": POISON + " " + c["n"]} for c in w["anchors"]["cps"]]
    return w


def poisoned_landmarks():
    """The served landmarks.js with one landmark name and one Gemeinde replaced. Quoted literals only, so
    'Bahnhof Sisseln' (which merely contains the Gemeinde name) keeps its own name."""
    src = LANDMARKS.read_text(encoding="utf-8")
    out = src.replace(f"'{LANDMARK}'", json.dumps(POISON + " " + LANDMARK)).replace(f"'{GEMEINDE}'", json.dumps(POISON + " " + GEMEINDE))
    assert out != src, "landmarks.js no longer carries the literals this test poisons"
    return out


def open_page(p, server, world=None, landmarks=False, viewport=None):
    """Returns (browser, page, page errors). world=None blocks the world file (hand layout)."""
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport=viewport or {"width": 480, "height": 270}, locale="en-US").new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if world is None:
        page.route(WORLD_ROUTE, lambda r: r.fulfill(status=404, body=""))
    else:
        body = json.dumps(world, ensure_ascii=False)
        page.route(WORLD_ROUTE, lambda r: r.fulfill(status=200, content_type="application/json", body=body))
    if landmarks:
        text = poisoned_landmarks()
        page.route(LANDMARKS_ROUTE, lambda r: r.fulfill(status=200, content_type="text/javascript", body=text))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errs


def start(page):
    """Press Start through the DOM: the same onclick, without Playwright's frame-bound stability wait, which takes
    minutes when the loaded real world draws below 1 fps."""
    page.evaluate("() => document.getElementById('startbtn').click()")
    page.wait_for_function("() => document.getElementById('overlay').hidden", polling=250, timeout=T)   # timer polling: rAF stalls under load


def wait_frames(page, n=2):
    """Wait until the game loop has drawn n more frames (a headless renderer can be slower than 1 fps)."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def clean(page, where):
    """No injected element anywhere under `where`, and the payload never ran."""
    assert page.eval_on_selector_all(f"{where} img, {where} script", "els => els.length") == 0, where
    wait_frames(page)
    assert page.evaluate(XSS) is None, where


def row_index(page, needle):
    rows = page.evaluate("() => window.__mm.jumpList()")
    for i, r in enumerate(rows):
        if needle in (r["n"] or ""):
            return i
    raise AssertionError(f"no row carrying {needle!r} in {[r['n'] for r in rows][:40]}")


@needs_world
def test_poisoned_landmark_and_gemeinde_stay_text_in_the_j_list(server):
    """J: the payload shows as visible text in the row and in its Gemeinde chip, as no element, and never runs.
    A chip click still filters, so the escaped data-g attribute round-trips back to the raw name."""
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=poisoned_world(), landmarks=True)
        start(page)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        clean(page, "#jumplist")
        clean(page, "#jumpchips")
        assert POISON + " " + LANDMARK in page.text_content("#jumplist")        # the name, literally
        assert POISON + " " + GEMEINDE in page.text_content("#jumpchips")       # the Gemeinde chip, literally
        assert "<img" not in page.inner_html("#jumplist").lower()               # escaped, not parsed
        assert "<img" not in page.inner_html("#jumpchips").lower()
        before = len(page.evaluate("() => window.__mm.jumpList()"))
        chip = page.locator("#jumpchips button", has_text=PAYLOAD)
        assert chip.count() == 1
        chip.click()
        # the escaped data-g attribute round-trips back to the raw name, so the filter keeps exactly that Gemeinde's rows
        page.wait_for_function(f"() => window.__mm.jumpList().length < {before}", timeout=T)
        rows = page.evaluate("() => window.__mm.jumpList()")
        named = [r for r in rows if r["g"]]                                     # the Random spot row has no Gemeinde
        assert named and all(PAYLOAD in r["g"] for r in named), rows
        clean(page, "#jumplist")
        assert errs == []
        b.close()


@needs_world
def test_poisoned_street_names_stay_text_in_the_drive_list_and_toasts(server):
    """O (autopilot) and I (Navi) list the world's street names. Picking one shows the name in a toast."""
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=poisoned_world())
        start(page)
        page.keyboard.press("KeyO")
        page.wait_for_function("() => !document.querySelector('#jump').hidden && window.__mm.jumpList().length", timeout=T)
        clean(page, "#jumplist")
        clean(page, "#jumpchips")
        assert PAYLOAD in page.text_content("#jumplist")
        assert "<img" not in page.inner_html("#jumplist").lower()
        page.keyboard.press("Escape")
        # the Navi toast carries the destination's name; not every street has a route from the car's start, so try a few
        started = page.evaluate("""() => { for (const r of window.__mm.jumpList().filter(e => e.n.includes('onerror')).slice(0, 12))
            if (window.__mm.naviStart(r.n)) return r.n; return null; }""")
        assert started, "no routable poisoned street"
        page.wait_for_function("() => window.__mm.toast().shown", timeout=T)
        assert PAYLOAD in page.text_content("#toast")
        clean(page, "#toast")
        assert errs == []
        b.close()


@needs_world
def test_poisoned_landmark_name_stays_text_in_the_jump_toast(server):
    """Jumping to a landmark toasts its bare name -- the path that made toast() text-only."""
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=poisoned_world(), landmarks=True)
        start(page)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        page.click(f'#jumplist li[data-i="{row_index(page, LANDMARK)}"]')
        page.wait_for_function("() => window.__mm.toast().shown", timeout=T)
        assert page.text_content("#toast") == POISON + " " + LANDMARK
        clean(page, "#toast")
        assert errs == []
        b.close()


@needs_world
def test_poisoned_checkpoint_name_stays_text_in_the_checkpoint_toast(server):
    """Checkpoint names come from the world's anchors too, and cpToast carries its own <br> + span:
    the markup survives, the name does not become markup."""
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, world=poisoned_world())
        start(page)
        page.evaluate("() => { const c = window.__mm.blitz().cps[0]; window.__mm.place(c[0], c[1]); }")
        page.wait_for_function("() => window.__mm.toast().shown && window.__mm.toast().text.includes('Checkpoint')", timeout=T)
        assert PAYLOAD in page.text_content("#toast")
        assert page.eval_on_selector_all("#toast br", "els => els.length") == 1   # the string's own markup still renders
        clean(page, "#toast")
        assert errs == []
        b.close()


def test_poisoned_vehicle_id_stays_text_in_the_garage(server):
    """A vehicle id is data (registerVehicle today, generated vehicles later) and vehicleText falls back to it."""
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, viewport={"width": 1280, "height": 720})
        page.evaluate(f"() => window.__mm.registerVehicle({json.dumps(POISON)}, {SLOW})")
        page.click("#carbtn", timeout=T)
        page.wait_for_function("() => window.__mm.carsel().open", timeout=T)
        clean(page, "#csgarage")
        labels = page.eval_on_selector_all("#csgarage button", "els => els.map(e => e.getAttribute('aria-label'))")
        assert POISON in labels, labels
        assert errs == []
        b.close()


def test_the_result_screen_and_the_present_toast_keep_their_own_markup(server):
    """Regression guard for the strings that are ours: the result screen and presentToast must still render markup."""
    with sync_playwright() as p:
        b, page, errs = open_page(p, server)
        start(page)
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_function("() => !document.querySelector('#result').hidden", timeout=T)
        assert page.eval_on_selector_all("#result small", "els => els.length") >= 1   # own <small>/<b> markup intact
        clean(page, "#result")
        page.evaluate("() => window.__mm.startHunt(3)")
        page.evaluate("() => { const [x, z] = window.__mm.hunt().spots[0]; window.__mm.place(x, z); }")
        page.wait_for_function("() => window.__mm.hunt().found > 0", timeout=T)
        assert page.text_content("#toast").startswith("Present 1/5")
        assert page.eval_on_selector_all("#toast br", "els => els.length") == 1
        assert page.eval_on_selector_all("#toast span", "els => els.length") == 1
        clean(page, "#toast")
        assert errs == []
        b.close()


def test_esc_is_imported_by_the_page():
    """index.html must actually import escape.js -- a missing import is a silent hole, not a loud error."""
    assert "from './escape.js'" in (Path(__file__).parents[1] / "index.html").read_text(encoding="utf-8")
