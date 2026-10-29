"""#509: the About dialog -- dedication, people, the game, credits, how it is built. Hand-traced layout (world and
terrain blocked): fast and deterministic. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"


def boot(p, server, locale="en-US", viewport=(1280, 720)):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale=locale)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def test_about_opens_from_the_start_screen_and_esc_returns(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        assert page.inner_text("#aboutbtn") == "About"
        page.click("#aboutbtn")
        state = page.evaluate("() => window.__mm.about()")
        visible = page.is_visible("#about") and not page.is_visible("#overlay")
        title = page.inner_text("#abouttitle")
        dedication = page.inner_text("#aboutdedication")
        people = page.inner_text("#about .ab-people")
        order = page.evaluate("() => !!(document.querySelector('#aboutdedication').compareDocumentPosition(document.querySelector('#about .ab-people')) & Node.DOCUMENT_POSITION_FOLLOWING)")
        page.keyboard.press("KeyW")
        held = page.evaluate("() => window.__mm.keysDown()")
        page.keyboard.press("Escape")
        after = page.evaluate("() => ({ about: window.__mm.about(), overlay: !document.getElementById('overlay').hidden, focus: document.activeElement.id })")
        b.close()
    assert state == {"open": True, "from": "start"}, state
    assert visible
    assert title == "About Map Madness"
    assert dedication == "This game is dedicated to Juliska"
    assert 'Tschosi "forwardare"' in people and "Ätti aka L.A. Brace" in people and "Tester" in people and "Kiscsi" in people, people
    assert order, "the dedication comes before the people"
    assert held == [], held                                             # game keys never reach the game behind the dialog
    assert after == {"about": {"open": False, "from": "start"}, "overlay": True, "focus": "aboutbtn"}, after
    assert errors == []


def test_links_point_to_the_listed_sites_and_open_in_a_new_tab(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        links = page.evaluate("() => [...document.querySelectorAll('#about a')].map(a => ({ id: a.dataset.link, href: a.href, target: a.target, rel: a.rel }))")
        listed = page.evaluate("async () => (await import('/prototype/about.js')).ABOUT_LINKS")
        b.close()
    assert {l["id"] for l in links} == set(listed), links                # every listed link is shown, nothing else
    for l in links:
        assert l["href"] == listed[l["id"]] and l["target"] == "_blank" and "noopener" in l["rel"].split(), l
    assert any(l["href"] == "https://www.plattform-sisslerfeld.com/" for l in links)


def test_every_credit_moved_from_the_help_to_about(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        keys = page.evaluate("async () => Object.keys((await import('/prototype/strings.js')).STRINGS.en).filter(k => /^credit[A-Z]/.test(k))")
        in_help = page.evaluate("() => document.querySelectorAll('#help [data-i18n^=\"credit\"]').length")
        in_about = page.evaluate("() => [...document.querySelectorAll('#about [data-i18n^=\"credit\"]')].map(e => e.dataset.i18n)")
        b.close()
    assert in_help == 0
    assert sorted(in_about) == sorted(keys), (in_about, keys)


def test_german_texts(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, locale="de-CH")
        btn = page.inner_text("#aboutbtn")
        page.click("#aboutbtn")
        title, dedication = page.inner_text("#abouttitle"), page.inner_text("#aboutdedication")
        b.close()
    assert btn == "Über" and title == "Über Map Madness" and dedication == "Dieses Spiel ist Juliska gewidmet"


def test_phone_width_never_scrolls_sideways(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, viewport=(375, 740))
        page.click("#aboutbtn")
        wide = page.evaluate("() => { const a = document.getElementById('about'); return [a.scrollWidth, a.clientWidth, document.documentElement.scrollWidth, innerWidth]; }")
        b.close()
    assert wide[0] <= wide[1] and wide[2] <= wide[3], wide

def start_race(page):
    page.click("#startbtn")
    page.wait_for_function("() => window.__mm.pause().state === 'armed' || window.__mm.pause().state === 'racing'", timeout=120000)


def test_pause_menu_opens_about_and_back_returns_to_the_pause_menu(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_race(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=60000)
        order = page.evaluate("() => [...document.querySelectorAll('#pause .col > button')].map(e => e.id)")
        page.click("#pauseabout")
        opened = page.evaluate("() => ({ about: window.__mm.about(), pause: !document.getElementById('pause').hidden })")
        page.keyboard.press("Escape")
        after = page.evaluate("() => ({ about: window.__mm.about().open, pauseShown: !document.getElementById('pause').hidden, paused: window.__mm.pause().on, focus: document.activeElement.id })")
        b.close()
    assert order == ["pauseresume", "pausevehicle", "pauseabout", "pauserestart", "pausemenu"], order
    assert opened == {"about": {"open": True, "from": "pause"}, "pause": False}, opened
    assert after == {"about": False, "pauseShown": True, "paused": True, "focus": "pauseabout"}, after   # Esc goes back, it does not resume
    assert errors == []


def test_command_search_opens_about_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.keyboard.press("Control+KeyP")
        page.wait_for_function("() => !document.getElementById('help').hidden", timeout=60000)
        page.fill("#helpq", "about")
        page.keyboard.press("Enter")
        state = page.evaluate("() => ({ about: window.__mm.about(), help: !document.getElementById('help').hidden })")
        b.close()
    assert state == {"about": {"open": True, "from": "start"}, "help": False}, state


def test_command_search_during_a_race_pauses_first(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_race(page)
        page.keyboard.press("Control+KeyP")
        page.wait_for_function("() => !document.getElementById('help').hidden", timeout=60000)
        page.fill("#helpq", "about")
        page.keyboard.press("Enter")
        state = page.evaluate("() => ({ about: window.__mm.about(), paused: window.__mm.pause().on })")
        page.click("#aboutback")
        back = page.evaluate("() => ({ pauseShown: !document.getElementById('pause').hidden, paused: window.__mm.pause().on })")
        b.close()
    assert state == {"about": {"open": True, "from": "pause"}, "paused": True}, state   # the clock never runs behind the dialog
    assert back == {"pauseShown": True, "paused": True}, back
