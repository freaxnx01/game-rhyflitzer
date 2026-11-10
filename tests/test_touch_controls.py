"""#535 phase 2: the phone controls -- the joystick steers while gas is held, Z switches the set to the walker's,
the context button shows up at a glowing door, the menu lists every other action, and it all fits a tall and a short phone.
Hand-traced layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
ROAD = (1810, 610)      # on the hand Bahnhofstrasse, 56 m past checkpoint 1 (Sisseln): its toast cannot replace a "Stop first"
VP = {"width": 390, "height": 844}
T = 120000
CONTROLS = ["#tStick", "#tG", "#tB", "#tH", "#tZ", "#tJ", "#tC", "#tMenu"]

# a synthetic touch pointer at an offset from the element's centre: two of them at once is what a real thumb pair does,
# and Playwright's own tap/mouse cannot hold two
PTR = """([sel, type, id, dx, dy]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true,
    clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 + dy })); }"""

BOXES = """(sels) => { const out = {}; for (const s of sels) { const el = document.querySelector(s);
    const st = getComputedStyle(el), b = el.getBoundingClientRect();
    out[s] = st.display === 'none' || !b.width ? null : [b.left, b.top, b.right, b.bottom]; } return out; }"""


def ptr(page, sel, kind, pointer_id, dx=0, dy=0):
    page.evaluate(PTR, [sel, kind, pointer_id, dx, dy])


def overlap(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def open_phone(p, server, vp=VP):
    """has_touch without is_mobile (see test_pause.py): index.html has no <meta name="viewport">, so is_mobile would lay out at 980 px."""
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport=vp, has_touch=True, locale="de-CH")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def get_out(page):
    x, z = ROAD
    page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
    page.tap("#tZ")
    page.wait_for_function("() => window.__mm.foot().on", timeout=T)


def test_joystick_steers_while_gas_is_held(server):
    with sync_playwright() as p:
        b, page, errors = open_phone(p, server)
        ptr(page, "#tStick", "pointerdown", 1)
        ptr(page, "#tStick", "pointermove", 1, dx=56)
        ptr(page, "#tG", "pointerdown", 2)
        page.wait_for_function("() => window.__mm.drive().gas === 1", timeout=T)
        held = page.evaluate("() => window.__mm.touch()")
        ptr(page, "#tG", "pointerup", 2)
        ptr(page, "#tStick", "pointerup", 1)
        released = page.evaluate("() => window.__mm.touch()")
        b.close()
    assert errors == []
    assert held["x"] == 1 and held["g"] == 1, held                  # steering full right and gas, together
    assert released["x"] == 0 and released["g"] == 0, released


def test_z_button_gets_out_and_the_controls_switch_to_foot(server):
    with sync_playwright() as p:
        b, page, errors = open_phone(p, server)
        get_out(page)
        ctx = page.evaluate("() => window.__mm.touch().ctx")
        boxes = page.evaluate(BOXES, CONTROLS)
        gas_label = page.get_attribute("#tG", "aria-label")
        before = page.evaluate("() => window.__mm.foot().x")
        ptr(page, "#tStick", "pointerdown", 1)
        ptr(page, "#tStick", "pointermove", 1, dy=-56)
        page.evaluate("() => window.__mm.footSim(1, [])")
        walked = page.evaluate("() => window.__mm.foot().x")
        ptr(page, "#tStick", "pointerup", 1)
        b.close()
    assert errors == []
    assert ctx == "foot", ctx
    assert boxes["#tB"] is None and boxes["#tH"] is None and boxes["#tC"] is None, boxes   # brake, handbrake and the camera are the car's
    assert boxes["#tStick"] and boxes["#tG"] and boxes["#tZ"] and boxes["#tJ"], boxes
    assert gas_label == "springen", gas_label                        # on foot Gas is the jump
    assert abs(walked - before) > 1, (before, walked)                # the stick walked him, with no key held


def test_context_button_appears_at_a_glowing_door(server):
    with sync_playwright() as p:
        b, page, errors = open_phone(p, server)
        get_out(page)
        x, z = ROAD
        page.evaluate(f"() => window.__mm.enterables.setReady('plattform-sisslerfeld', true, [{x + 12}, {z}])")
        page.evaluate(f"() => window.__mm.place({x + 10}, {z}, 0)")
        page.wait_for_function("() => window.__mm.enterables.prompt() === 'plattform-sisslerfeld'", timeout=60000)
        page.wait_for_selector("#tE", state="visible", timeout=T)
        label = page.text_content("#tE")
        page.tap("#tE")
        page.wait_for_timeout(200)
        toast = page.text_content("#toast")
        page.evaluate("() => window.__mm.enterables.setReady('plattform-sisslerfeld', false)")
        b.close()
    assert errors == []
    assert label == "eintreten", label
    assert toast == "Die Treppe ist offen -- einfach hineingehen", toast   # the entrance's own handler, i.e. the same E the keyboard presses


def test_menu_lists_the_rest_and_runs_a_row(server):
    with sync_playwright() as p:
        b, page, errors = open_phone(p, server)
        page.tap("#tMenu")
        page.wait_for_selector("#tMenuList", state="visible", timeout=T)
        expected = page.evaluate("async () => (await import('./controls.js')).menuEntries('car').length")
        rows = page.evaluate("""() => [...document.querySelectorAll('#tMenuList button')]
            .map(x => ({ cmd: x.dataset.cmd, h: x.getBoundingClientRect().height }))""")
        page.tap("#tMenuList button[data-cmd=KeyV]")
        page.wait_for_function("() => window.__mm.hud().carVisible === false", timeout=T)
        closed = page.evaluate("() => document.querySelector('#tMenuList').hidden")
        b.close()
    assert errors == []
    assert len(rows) == expected and expected > 0, (len(rows), expected)
    assert all(r["h"] >= 44 for r in rows), rows
    assert "KeyV" in [r["cmd"] for r in rows], rows
    assert closed is True                                            # a chosen action closes the menu again


@pytest.mark.parametrize("vp", [VP, {"width": 360, "height": 640}])   # a tall and a short phone: the short one is where a column runs out of room
def test_phone_layout_fits(server, vp):
    with sync_playwright() as p:
        b, page, errors = open_phone(p, server, vp)
        scroll_width = page.evaluate("() => document.documentElement.scrollWidth")
        boxes = page.evaluate(BOXES, CONTROLS + ["#pausebtn"])
        bars = page.evaluate("""() => ({ keybar: getComputedStyle(document.querySelector('#keybar')).display,
            pausekeybar: getComputedStyle(document.querySelector('#pausekeybar')).display })""")
        b.close()
    shown = {k: v for k, v in boxes.items() if v}
    assert errors == []
    assert scroll_width <= vp["width"], scroll_width
    assert set(shown) == set(CONTROLS + ["#pausebtn"]), boxes         # every control of the car context is there
    for name, box in shown.items():
        assert box[0] >= 0 and box[1] >= 0 and box[2] <= vp["width"] and box[3] <= vp["height"], (name, box)
        assert box[2] - box[0] >= 44 and box[3] - box[1] >= 44, (name, box)
    names = list(shown)
    for i, a in enumerate(names):
        for c in names[i + 1:]:
            assert not overlap(shown[a], shown[c]), (a, c, shown[a], shown[c])
    assert bars == {"keybar": "none", "pausekeybar": "none"}          # the key bar is the desktop's
