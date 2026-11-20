"""#1090: the discovery hint card. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 240000
HINTS = "() => window.__mm.hints()"


def cruise(p, server, touch=False):
    b = p.chromium.launch(args=ARGS)
    view = {"width": 390, "height": 844} if touch else {"width": 1280, "height": 720}
    page = b.new_context(viewport=view, has_touch=touch, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    for r in ("**/data/terrain_*.mmh", "**/data/world_hochrhein.json"):
        page.route(r, lambda x: x.fulfill(status=404, body=""))
    page.add_init_script("localStorage.setItem('mm.tutorialDone', '1')")
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hintsStep && document.querySelector('#worldstatus')?.textContent", timeout=T)
    (page.tap if touch else page.click)("#cruisebtn", timeout=T)
    page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
    return b, page, errors


def first_card(page):
    return page.evaluate("() => window.__mm.hintsStep(0.1, { cruiseS: 1000 })")


def test_heli_card_shows_with_its_key_and_times_out_unseen(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        h = first_card(page)
        key = page.inner_text("#hintcard .hc-key"); shown = page.is_visible("#hintcard")
        page.keyboard.press("Escape")                                  # pause: card hides, timer frozen
        paused = page.evaluate("() => [window.__mm.hintsStep(30), document.getElementById('hintcard').hidden]")
        page.keyboard.press("Escape")
        out = page.evaluate("() => window.__mm.hintsStep(21)")
        b.close()
    assert h["card"] == "heli" and shown and key == "F", h
    assert paused[0]["card"] == "heli" and paused[1] is True, paused
    assert out["card"] is None and out["store"]["heli"] == {"shown": 1, "seen": False}, out
    assert errors == []


def test_tap_runs_the_action_and_marks_it_seen(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        page.evaluate("() => window.__mm.hintsSeen(['heli'])")
        h = first_card(page)
        page.click("#hintcard .hc-text")
        after = page.evaluate("() => [window.__mm.hints(), !document.getElementById('jump').hidden, document.getElementById('hintcard').hidden]")
        b.close()
    assert h["card"] == "jumpTo", h
    assert after[0]["card"] is None and after[0]["store"]["jumpTo"]["seen"] is True, after
    assert after[1] is True and after[2] is True, after                # J's jump list is open, the card is not over it
    assert errors == []


def test_close_marks_seen_and_the_key_counts_as_acted(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        first_card(page); page.click("#hintcard .hc-close")
        closed = page.evaluate(HINTS)
        h = page.evaluate("() => window.__mm.hintsStep(200)")         # past the 2-3 min pace
        page.keyboard.press("KeyJ")
        keyed = page.evaluate(HINTS)
        b.close()
    assert closed["card"] is None and closed["store"]["heli"]["seen"] is True, closed
    assert h["card"] == "jumpTo" and keyed["store"]["jumpTo"]["seen"] is True, (h, keyed)
    assert errors == []


def test_no_more_hints_switches_them_off(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        first_card(page); page.click("#hintcard .hc-off")
        off = page.evaluate("() => [window.__mm.hints(), localStorage.getItem('mm.hintsOn')]")
        again = page.evaluate("() => window.__mm.hintsStep(300)")
        b.close()
    assert off[0]["on"] is False and off[1] == "0" and off[0]["card"] is None and "heli" not in off[0]["store"], off
    assert again["card"] is None
    assert errors == []


def test_phone_skips_heli_says_tap_and_covers_no_button(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server, touch=True)
        h = first_card(page)
        cap = page.inner_text("#hintcard .hc-key")
        boxes = page.evaluate("""() => Object.fromEntries(['#hintcard', '#tE', '#tMenu', '#radiobtn', '#pausebtn', '#map']
            .map(s => [s, document.querySelector(s)]).filter(([, e]) => e && getComputedStyle(e).display !== 'none' && e.offsetWidth)
            .map(([s, e]) => { const r = e.getBoundingClientRect(); return [s, [r.left, r.top, r.right, r.bottom]]; }))""")
        b.close()
    assert h["card"] == "jumpTo" and cap == "Tap", (h, cap)
    c = boxes.pop("#hintcard")
    for k, o in boxes.items():
        assert c[2] <= o[0] or o[2] <= c[0] or c[3] <= o[1] or o[3] <= c[1], (k, c, o)
    assert errors == []
