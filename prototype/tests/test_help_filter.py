"""#249: the F1 help has a search field — typing filters the key list, accent- and case-insensitively,
without any game key firing. Hand-traced layout (world + terrain blocked): no data files needed, deterministic and fast.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 120000


def open_page(p, server, locale="de-CH"):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale=locale)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def help_rows(page):
    return page.evaluate("""() => {
        const kbds = [...document.querySelectorAll('#help .keys kbd')].filter(k => !k.hidden);
        const spans = [...document.querySelectorAll('#help .keys span')].filter(s => !s.hidden);
        return { kbdCount: kbds.length, spanText: spans.map(s => s.textContent) };
    }""")


def test_f1_focuses_the_search_and_typing_filters(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="de-CH")
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=T)
        focus = page.evaluate("() => document.activeElement.id")
        page.keyboard.type("ton")
        page.wait_for_function("() => [...document.querySelectorAll('#help .keys kbd')].filter(k => !k.hidden).length === 2", timeout=T)
        rows = help_rows(page)
        b.close()
    assert focus == "helpq"
    assert rows["kbdCount"] == 2   # "ton" matches "Ton aus" (M) and "Pontonbrücke" (U): substring, per the spec
    assert any("Ton" in t for t in rows["spanText"]), rows["spanText"]   # the "Ton aus" (M) row is kept
    assert errors == []


def test_f1_search_filters_in_english_too(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="en-US")
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=T)
        page.keyboard.type("mute")
        page.wait_for_function("() => [...document.querySelectorAll('#help .keys kbd')].filter(k => !k.hidden).length === 1", timeout=T)
        rows = help_rows(page)
        b.close()
    assert rows["kbdCount"] == 1
    assert any("mute" in t.lower() for t in rows["spanText"]), rows["spanText"]
    assert errors == []


def test_typing_in_the_help_fires_no_game_key(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="de-CH")
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=T)
        page.keyboard.type("tonjoin")
        state = page.evaluate("""() => ({
            keysDown: window.__mm.keysDown(),
            jump: !document.querySelector('#jump').hidden,
            overlay: !document.querySelector('#overlay').hidden,
            help: window.__mm.hud().help
        })""")
        b.close()
    assert state["keysDown"] == []
    assert state["jump"] is False
    assert state["overlay"] is False
    assert state["help"] is True
    assert errors == []


def test_no_match_shows_the_hint_and_escape_closes(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="de-CH")
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=T)
        page.keyboard.type("zzzz")
        page.wait_for_function("() => !document.querySelector('#helpnone').hidden", timeout=T)
        none_visible = page.is_visible("#helpnone")
        rows = help_rows(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => document.querySelector('#help').hidden", timeout=T)
        closed = page.evaluate("() => window.__mm.hud().help")
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=T)
        reopened_field = page.evaluate("() => document.querySelector('#helpq').value")
        reopened_rows = help_rows(page)
        b.close()
    assert none_visible
    assert rows["kbdCount"] == 0
    assert closed is False
    assert reopened_field == ""
    assert reopened_rows["kbdCount"] > 1
    assert errors == []


def test_question_mark_is_typed_not_toggling(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="de-CH")
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=T)
        page.keyboard.type("?")
        page.wait_for_timeout(200)
        help_open = page.evaluate("() => !document.querySelector('#help').hidden")
        field_value = page.evaluate("() => document.querySelector('#helpq').value")
        b.close()
    assert help_open is True
    assert field_value == "?"
    assert errors == []
