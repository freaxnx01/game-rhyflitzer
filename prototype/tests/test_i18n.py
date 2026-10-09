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
    page.goto(f"{server}/prototype/index.html", timeout=240000)
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


def test_toggle_switches_live_and_persists(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="en-US")
        page.click("#gg-lang-toggle")
        page.wait_for_function("() => document.querySelector('#best').textContent.startsWith('Bestzeit')", timeout=120000)
        live = page.evaluate("""() => ({
            lang: window.GG_LANG, stored: localStorage.getItem('gg-lang'), html: document.documentElement.lang,
            toggle: document.querySelector('#gg-lang-toggle').textContent,
            mode: document.querySelector('#tl .mode').textContent,
            intro: document.querySelector('#ovtext').textContent,
            startbtn: document.querySelector('#startbtn').textContent,
            style2: document.querySelector('#stylebtn2').textContent,
            stylename: document.querySelector('#stylename').textContent,
            terrain: document.querySelector('#mmhstatus').textContent,
            world: document.querySelector('#worldstatus').textContent,
            blurb: document.querySelector('#blurb').textContent,
            odo: document.querySelector('#odo').textContent,
            lastJump: [...document.querySelectorAll('#jump li')].at(-1).textContent,
        })""")
        page.keyboard.press("KeyT")
        smooth = text(page, "#stylename")
        page.reload(timeout=240000); page.wait_for_function(READY, timeout=240000)
        after_reload = text(page, "#tl .mode")
        b.close()
    assert live["lang"] == "de" and live["stored"] == "de" and live["html"] == "de" and live["toggle"] == "DE"
    assert live["mode"] == "Zeitfahren · Hochrhein"
    assert live["intro"].startswith("Sisseln → Sisslerfeld") and "Fünf Checkpoints" in live["intro"]
    assert live["startbtn"] == "Start"
    assert live["style2"] == "Stil: Original" and live["stylename"] == "Original"
    assert live["terrain"] == "Gelände: erfunden (sanfte Hügel, nicht gemessen)"
    assert live["world"] == "Welt: von Hand abgezeichnet (keine data/world_hochrhein.json)"
    assert "Die Zeit läuft" in live["blurb"]
    assert live["odo"].endswith("K setzt Trip zurück"), live["odo"]
    assert live["lastJump"] == "Zufälliger Ort"
    assert smooth == "Glatt"
    assert after_reload == "Zeitfahren · Hochrhein"
    assert errors == []


def test_enter_after_toggle_keeps_language(server):
    """Enter honks (not preventDefault'ed): a toggle that kept the focus would flip the language back on every honk."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="en-US")
        page.click("#gg-lang-toggle")
        page.keyboard.press("Enter"); page.keyboard.press("Space"); page.wait_for_timeout(200)
        lang = page.evaluate("() => window.GG_LANG")
        b.close()
    assert lang == "de"
    assert errors == []


def test_runtime_texts_follow_the_language(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="en-US", lang="de")
        page.click("#startbtn")
        page.keyboard.press("KeyC"); page.wait_for_timeout(300)
        cam = text(page, "#toast")
        page.keyboard.press("KeyM"); page.wait_for_timeout(300)
        mute = text(page, "#toast")
        page.keyboard.press("KeyJ")
        jump = page.evaluate("""() => ({ rows: window.__mm.jumpList().map(r => r.n),
            hint: document.querySelector('#jump small').textContent })""")
        b.close()
    assert cam == "Kamera: Verfolger nah"
    assert mute == "Ton aus"
    assert jump["rows"][-1] == "Zufälliger Ort"
    assert jump["hint"].startswith("tippen zum Suchen")
    assert errors == []


def test_checkpoint_and_place_names_stay(server):
    def names(lang):
        with sync_playwright() as p:
            b, page, _ = open_page(p, server, locale="en-US", lang=lang)
            page.wait_for_function("() => / · /.test(document.querySelector('#cpname').textContent)", timeout=120000)
            got = page.evaluate("""() => ({
                cp: document.querySelector('#cpname').textContent.split(' · ').slice(1).join(' · '),
                places: window.__mm.jumpList().slice(0, -1).map(r => r.n) })""")
            b.close()
            return got
    en, de = names("en"), names("de")
    assert en == de and en["cp"] and en["places"], (en, de)


@pytest.mark.parametrize("locale,lang,expected", [
    ("de-CH", "en", "Sleep with the fishes!"),
    ("en-US", "de", "Grüss mir die Fische!"),
])
def test_fishes_toast_follows_the_game_language_not_the_browser(server, locale, lang, expected):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale=locale, lang=lang)
        page.click("#startbtn")
        page.evaluate("() => window.__mm.place(863.6, -647.7)")          # middle of the hand-traced Rhine
        page.wait_for_function("() => window.__mm.car().splash > 0.6", timeout=180000)
        shown = page.evaluate("() => [document.querySelector('#toast').textContent, window.__mm.car().splash]")
        b.close()
    assert shown[0] == expected
    assert shown[1] < 2.8          # still lying in the water, not yet reset
    assert errors == []


def test_result_screen_rerenders(server):
    """Switching the language on the result screen keeps the record line and only changes its words."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, locale="en-US")
        page.click("#startbtn")
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_selector("#overlay:not([hidden])", timeout=60000)
        en = page.evaluate("() => [document.querySelector('#result').textContent, document.querySelector('#startbtn').textContent, document.querySelector('#ovtext').textContent]")
        page.click("#gg-lang-toggle")
        de = page.evaluate("() => [document.querySelector('#result').textContent, document.querySelector('#startbtn').textContent, document.querySelector('#ovtext').textContent]")
        b.close()
    assert en[1] == "Retry" and "Finished" in en[0] and "best" in en[0], en
    assert de[1] == "Nochmals" and "Im Ziel" in de[0] and "Bestzeit" in de[0], de
    assert de[2].startswith("Münsterplatz erreicht")
    assert errors == []
