"""#9 German and English UI: the EN/DE toggle in #game-nav (house i18n.js, shared gg-lang key), the browser language as
fallback, live re-render without a reload, the toggle's blur fix (Enter honks), and the fishes toast following the game
language. Hand-traced layout (world + terrain blocked): no data files needed, deterministic and fast.
Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"


def open_page(p, server, locale="en-US", lang=None):
    """lang: a gg-lang value stored before the page's own scripts run (on every navigation of this context)."""
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(locale=locale, viewport={"width": 1280, "height": 720})
    if lang:
        ctx.add_init_script(f"try {{ localStorage.setItem('gg-lang', '{lang}'); }} catch (e) {{}}")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def text(page, selector):
    return page.text_content(selector)


@pytest.mark.parametrize("locale,lang,mode", [
    ("de-CH", "de", "Zeitfahren · Hochrhein"),
    ("en-US", "en", "Time trial · Hochrhein"),
])
def test_browser_language_decides_without_a_stored_choice(server, locale, lang, mode):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale=locale)
        got = page.evaluate("""() => ({ lang: window.GG_LANG, html: document.documentElement.lang,
            toggle: document.querySelector('#game-nav #gg-lang-toggle')?.textContent,
            stored: localStorage.getItem('gg-lang') })""")
        shown_mode = text(page, "#tl .mode")
        b.close()
    assert got == {"lang": lang, "html": lang, "toggle": lang.upper(), "stored": None}
    assert shown_mode == mode
    assert errors == []


def test_stored_language_wins_over_the_browser(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="en-US", lang="de")
        shown = page.evaluate("""() => ({
            lang: window.GG_LANG,
            help: document.querySelector('#help').textContent,
            jumpTitle: document.querySelector('#jump > div').textContent,
            jumpSearch: document.querySelector('#jumpq').placeholder,
            jumpHint: document.querySelector('#jump small').textContent,
            east: document.querySelector('#rose text:nth-of-type(2)').textContent,
            compass: document.querySelector('#compass').getAttribute('aria-label'),
            speedo: document.querySelector('#speedo').getAttribute('aria-label'),
            steerLeft: document.querySelector('#tL').getAttribute('aria-label'),
            map: document.querySelector('[data-i18n="map"]').textContent,
            loadTerrain: document.querySelector('label[for=mmhfile]').textContent,
            useMadeUp: document.querySelector('#mmhclear').textContent,
            sub: document.querySelector('.sub').textContent,
            cps: document.querySelector('#tl .cps').textContent,
            timeLabel: document.querySelector('#tr .lbl').textContent,
        })""")
        b.close()
    assert shown["lang"] == "de"
    assert "Blinker links · rechts" in shown["help"] and "Tasten · F1 schliesst" in shown["help"], shown["help"]
    assert shown["jumpTitle"] == "Springen nach"
    assert shown["jumpSearch"] == "Wahrzeichen suchen"
    assert shown["jumpHint"].startswith("tippen zum Suchen")
    assert shown["east"] == "O" and shown["compass"] == "Kompass" and shown["speedo"] == "Tachometer"
    assert shown["steerLeft"] == "Links lenken"
    assert shown["map"] == "Karte · Hochrhein ·"
    assert shown["loadTerrain"] == "Gelände laden (.mmh)"
    assert shown["useMadeUp"] == "Erfundenes Gelände verwenden"
    assert shown["sub"] == "Codename Rhyflitzer · Prototyp v0.2"
    assert shown["cps"] == "0 / 5 Checkpoints"
    assert shown["timeLabel"] == "Zeit"
    assert errors == []
