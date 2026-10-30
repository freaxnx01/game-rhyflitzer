"""#564: the About dialog in tabs -- roles, keyboard, touch, footer always visible, Kiscsi's ideas, the agent list.
Slow (Playwright): run in the foreground, only this file and test_about.py."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
IDS = ["people", "game", "credits", "built"]


def boot(p, server, locale="en-US", viewport=(1280, 720), touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale=locale, has_touch=touch)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def shown(page):
    return page.evaluate("() => [...document.querySelectorAll('#about [role=tabpanel]')].filter(p => !p.hidden).map(p => p.id)")


def test_tab_roles_and_first_tab_active_on_open(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        info = page.evaluate("""() => ({
          list: document.querySelector('#about [role=tablist]') !== null,
          tabs: [...document.querySelectorAll('#about [role=tab]')].map(t => [t.id, t.getAttribute('aria-selected'), t.tabIndex, t.getAttribute('aria-controls'), t.textContent.trim()]),
          labelled: [...document.querySelectorAll('#about [role=tabpanel]')].map(p => [p.id, p.getAttribute('aria-labelledby')]),
          dedicationAboveTabs: !!(document.querySelector('#aboutdedication').compareDocumentPosition(document.querySelector('#about [role=tablist]')) & Node.DOCUMENT_POSITION_FOLLOWING),
          tab: window.__mm.aboutTab() })""")
        open_panels = shown(page)
        b.close()
    assert info["list"] and info["dedicationAboveTabs"]
    assert info["tabs"] == [
        ["abouttab-people", "true", 0, "aboutpanel-people", "People"],
        ["abouttab-game", "false", -1, "aboutpanel-game", "The game"],
        ["abouttab-credits", "false", -1, "aboutpanel-credits", "Credits"],
        ["abouttab-built", "false", -1, "aboutpanel-built", "How it is built"]], info["tabs"]
    assert info["labelled"] == [[f"aboutpanel-{i}", f"abouttab-{i}"] for i in IDS], info["labelled"]
    assert info["tab"] == "people" and open_panels == ["aboutpanel-people"], (info, open_panels)
    assert errors == []


def test_arrow_keys_home_end_and_the_game_never_sees_them(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        page.focus("#abouttab-people")
        seen = []
        for key in ["ArrowRight", "ArrowRight", "End", "ArrowRight", "ArrowLeft", "Home"]:
            page.keyboard.press(key)
            seen.append((page.evaluate("() => window.__mm.aboutTab()"), page.evaluate("() => document.activeElement.id")))
        page.keyboard.press("ArrowRight")
        page.keyboard.press("KeyW")
        held = page.evaluate("() => window.__mm.keysDown()")
        b.close()
    assert seen == [("game", "abouttab-game"), ("credits", "abouttab-credits"), ("built", "abouttab-built"),
                    ("people", "abouttab-people"), ("built", "abouttab-built"), ("people", "abouttab-people")], seen
    assert held == [], held
    assert errors == []


def test_click_and_tap_select_a_tab_and_show_only_its_panel(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, touch=True)
        page.tap("#aboutbtn")
        page.tap("#abouttab-credits")
        after_tap = (page.evaluate("() => window.__mm.aboutTab()"), shown(page))
        page.click("#abouttab-built")
        after_click = (page.evaluate("() => window.__mm.aboutTab()"), shown(page))
        b.close()
    assert after_tap == ("credits", ["aboutpanel-credits"]), after_tap
    assert after_click == ("built", ["aboutpanel-built"]), after_click


def test_escape_still_goes_back_and_reopening_starts_on_the_first_tab(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        page.click("#abouttab-built")
        page.keyboard.press("Escape")
        closed = page.evaluate("() => ({ about: window.__mm.about(), overlay: !document.getElementById('overlay').hidden, focus: document.activeElement.id })")
        page.click("#aboutbtn")
        again = (page.evaluate("() => window.__mm.aboutTab()"), shown(page))
        b.close()
    assert closed == {"about": {"open": False, "from": "start"}, "overlay": True, "focus": "aboutbtn"}, closed
    assert again == ("people", ["aboutpanel-people"]), again


def test_footer_and_tabs_stay_in_view_on_every_tab_desktop_and_phone(server):
    with sync_playwright() as p:
        for viewport in [(1280, 720), (375, 740)]:
            b, page, errors = boot(p, server, viewport=viewport)
            page.click("#aboutbtn")
            for i in IDS:
                page.click(f"#abouttab-{i}")
                r = page.evaluate("""() => { const q = s => document.querySelector(s).getBoundingClientRect();
                  return { foot: [q('.ab-foot').top, q('.ab-foot').bottom], tabs: [q('[role=tablist]').top, q('[role=tablist]').bottom], vh: innerHeight,
                           side: [document.getElementById('about').scrollWidth, document.getElementById('about').clientWidth, document.documentElement.scrollWidth, innerWidth] }; }""")
                assert 0 <= r["tabs"][0] and r["tabs"][1] <= r["foot"][0] and r["foot"][1] <= r["vh"] + 1, (viewport, i, r)
                assert r["side"][0] <= r["side"][1] and r["side"][2] <= r["side"][3], (viewport, i, r)
            b.close()


def test_kiscsis_ideas_and_the_agent_list(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        people = page.inner_text("#aboutpanel-people")
        page.click("#abouttab-built")
        built = page.inner_text("#aboutpanel-built")
        b.close()
    for word in ["Holzbrücke", "Robidogs", "poo piles", "many other ideas …"]:
        assert word in people, (word, people)
    for word in ["OpenCode", "GLM 5.3", "Claude Sonnet", "Claude Fable", "Claude Opus", "Claude Haiku", "Claude Design"]:
        assert word in built, (word, built)


def test_german_tabs_and_ideas(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, locale="de-CH")
        page.click("#aboutbtn")
        labels = page.evaluate("() => [...document.querySelectorAll('#about [role=tab]')].map(t => t.textContent.trim())")
        people = page.inner_text("#aboutpanel-people")
        b.close()
    assert labels == ["Leute", "Das Spiel", "Credits", "So ist es gebaut"], labels
    assert "Robidogs" in people and "fliegende Häufchen" in people and "viele andere Ideen mehr …" in people, people
