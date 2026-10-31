"""#346: the Sunset Steel start screen and the Worlds dialog. One file, fast: no race is driven except via finishNow.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 240000
BAR = ["startbtn", "blitzbtn", "huntbtn", "carbtn"]
SECONDARY = ["worldbtn", "stylebtn2", "aboutbtn"]


def boot(p, server, viewport=(1280, 720), touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, has_touch=touch, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def ids(page, sel):
    return page.evaluate(f"() => [...document.querySelectorAll('{sel}')].map(e => e.id)")


def test_bar_order_focus_order_and_enter_starts(server):
    """The steel bar is 4 + 2 buttons in wireframe order, Tab walks it, Enter on the focused button starts."""
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        bar = ids(page, "#overlay .bar .row:not(.secondary) > button")
        secondary = ids(page, "#overlay .bar .row.secondary > button")
        first = page.evaluate("() => document.activeElement.id")
        order = []
        for _ in range(5):
            page.keyboard.press("Tab")
            order.append(page.evaluate("() => document.activeElement.id"))
        page.focus("#startbtn")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        b.close()
    assert bar == BAR, bar
    assert secondary == SECONDARY, secondary
    assert first == "startbtn"
    assert order == ["blitzbtn", "huntbtn", "carbtn", "worldbtn", "stylebtn2"], order
    assert errors == []


def test_mode_text_follows_focus_and_remembers_the_last_mode(server):
    """One slot, three modes: hover and focus swap the text, blur reverts to the focused or last played mode."""
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        trial = page.text_content("#ovtext")
        page.hover("#blitzbtn")
        blitz = page.text_content("#ovtext")
        page.mouse.move(5, 5)
        back = page.text_content("#ovtext")
        page.focus("#huntbtn")
        hunt = page.text_content("#ovtext")
        page.focus("#carbtn")
        after_car = page.text_content("#ovtext")
        live = page.get_attribute("#ovtext", "aria-live")
        page.click("#blitzbtn", no_wait_after=True)
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        stored = page.evaluate("() => localStorage.getItem('mm.lastMode')")
        page.reload(timeout=T)
        page.wait_for_function(READY, timeout=T)
        page.evaluate("() => document.activeElement.blur()")
        default = page.evaluate("() => window.__mm.startScreen()")
        b.close()
    assert "Sisseln" in trial, trial
    assert "90 seconds" in blitz, blitz
    assert back == trial
    assert "presents" in hunt, hunt
    assert after_car == trial                    # 4 CAR has no mode text of its own, so the slot falls back to the last played mode
    assert live == "polite"
    assert stored == "blitz"
    assert default["mode"] == "blitz" and "90 seconds" in default["text"], default
    assert errors == []


def test_result_view_sits_in_the_slot_and_start_reads_again(server):
    """After a race the result renders inside the slot, the played mode's button reads Again, the HUD stays hidden."""
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#startbtn")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        got = page.evaluate("""() => ({
            inSlot: !!document.querySelector('#overlay .slot #result') && !document.querySelector('#result').hidden,
            start: document.querySelector('#startbtn').textContent, blitz: document.querySelector('#blitzbtn').textContent,
            hud: getComputedStyle(document.getElementById('tl')).display })""")
        b.close()
    assert got["inSlot"], got
    assert got["start"] == "Again" and got["blitz"] == "Blitz", got
    assert got["hud"] == "none"
    assert errors == []


def test_worlds_dialog_selects_then_drives_and_esc_returns_focus(server):
    """Rows select (no reload), arrows move the selection, Esc goes back to #worldbtn, DRIVE HERE reloads."""
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#worldbtn")
        page.wait_for_function("() => !document.querySelector('#worlds').hidden", timeout=T)
        opened = page.evaluate("""() => ({ dialog: !document.querySelector('#worlds').hidden, overlay: document.querySelector('#overlay').hidden,
            role: document.querySelector('#worlds').getAttribute('role'), modal: document.querySelector('#worlds').getAttribute('aria-modal'),
            pressed: document.querySelector('#region-hochrhein').getAttribute('aria-pressed'), name: document.querySelector('#wpname').textContent,
            tabs: ['region-hochrhein', 'region-ehrendingen'].map(i => document.getElementById(i).tabIndex) })""")
        page.focus("#region-hochrhein")
        page.keyboard.press("ArrowDown")
        moved = page.evaluate("""() => ({ focus: document.activeElement.id, sel: window.__mm.startScreen().sel,
            pressed: ['region-hochrhein', 'region-ehrendingen'].map(i => document.getElementById(i).getAttribute('aria-pressed')),
            name: document.querySelector('#wpname').textContent, url: location.search })""")
        page.keyboard.press("Escape")
        closed = page.evaluate("() => ({ dialog: document.querySelector('#worlds').hidden, overlay: document.querySelector('#overlay').hidden, focus: document.activeElement.id })")
        page.click("#worldbtn")
        page.wait_for_function("() => !document.querySelector('#worlds').hidden", timeout=T)
        page.click("#region-ehrendingen")
        page.click("#drivebtn", no_wait_after=True)
        page.wait_for_url(lambda url: "region=ehrendingen" in url, wait_until="commit", timeout=T)
        b.close()
    assert opened == {"dialog": True, "overlay": True, "role": "dialog", "modal": "true", "pressed": "true", "name": "Hochrhein", "tabs": [0, -1]}, opened
    assert moved["focus"] == "region-ehrendingen", moved
    assert moved["sel"] == {"kind": "region", "id": "ehrendingen"}, moved
    assert moved["pressed"] == ["false", "true"], moved
    assert moved["name"] == "Ehrendingen" and moved["url"] == "", moved   # selecting never reloads
    assert closed == {"dialog": True, "overlay": False, "focus": "worldbtn"}, closed
    assert errors == []


def test_phone_layout_and_screenshots(server, tmp_path):
    """390x844 coarse pointer: 2x2 primary grid, full-width WORLD, sticky bar, no sticker, nothing focused."""
    with sync_playwright() as p:
        b, page, errors = boot(p, server, viewport=(390, 844), touch=True)
        got = page.evaluate("""() => { const r = (i) => document.getElementById(i).getBoundingClientRect();
            const s = r('startbtn'), bl = r('blitzbtn'), h = r('huntbtn'), w = r('worldbtn'), bar = document.querySelector('#overlay .bar').getBoundingClientRect();
            return { sameRow: Math.abs(s.top - bl.top) < 2, below: h.top > s.bottom - 1, worldFull: w.width > innerWidth * 0.8,
                     barInside: bar.bottom <= innerHeight + 1, noHScroll: document.documentElement.scrollWidth <= innerWidth,
                     sticker: getComputedStyle(document.getElementById('sticker')).display, focus: document.activeElement.id || document.activeElement.tagName.toLowerCase(),
                     sticky: getComputedStyle(document.querySelector('#overlay .bar')).position }; }""")
        page.screenshot(path=str(tmp_path / "start-390x844.png"))
        b.close()
        b2, page2, errors2 = boot(p, server)
        page2.screenshot(path=str(tmp_path / "start-1280x720.png"))
        desk = page2.evaluate("""() => { const bar = document.querySelector('#overlay .bar').getBoundingClientRect(), logo = document.querySelector('#overlay h1').getBoundingClientRect();
            return { barInside: bar.bottom <= innerHeight + 1, logoInside: logo.left >= 0 && logo.right <= innerWidth, noHScroll: document.documentElement.scrollWidth <= innerWidth,
                     sticker: getComputedStyle(document.getElementById('sticker')).display,
                     edition: document.getElementById('edition').textContent, car: document.getElementById('cartagname').textContent }; }""")
        b2.close()
    print("screenshots:", tmp_path)
    assert got["sameRow"] and got["below"] and got["worldFull"], got
    assert got["barInside"] and got["noHScroll"] and got["sticky"] == "sticky", got
    assert got["sticker"] == "none", got
    assert got["focus"] == "body", got            # touch: nothing focused, the slot shows the last mode
    assert desk["barInside"] and desk["logoInside"] and desk["noHScroll"], desk
    assert desk["sticker"] != "none", desk
    assert desk["edition"] == "Hochrhein Edition", desk
    assert desk["car"].startswith("Car: "), desk
    assert errors == [] and errors2 == []
