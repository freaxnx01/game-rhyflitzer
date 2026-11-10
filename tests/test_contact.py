"""#853: the contact address -- footer link and About line, per language, set by JS only.
Slow (Playwright): run in the foreground, only this file."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"


def boot(p, server, locale="en-US", viewport=(1280, 720), touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale=locale, has_touch=touch)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def test_contact_follows_the_language_in_footer_and_about(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.evaluate("() => window.ggSetLang('en')")
        en_nav = page.evaluate("() => { const a = document.getElementById('navcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        page.click("#aboutbtn")
        page.click("#abouttab-game")
        en_about = page.evaluate("() => { const a = document.getElementById('aboutcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        page.evaluate("() => window.ggSetLang('de')")
        de_nav = page.evaluate("() => { const a = document.getElementById('navcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        de_about = page.evaluate("() => { const a = document.getElementById('aboutcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        b.close()
    assert en_nav == ["Contact", "mailto:hello@freax.games"], en_nav
    assert en_about == ["hello@freax.games", "mailto:hello@freax.games"], en_about
    assert de_nav == ["Kontakt", "mailto:kontakt@rhyflitzer.ch"], de_nav
    assert de_about == ["kontakt@rhyflitzer.ch", "mailto:kontakt@rhyflitzer.ch"], de_about
    assert errors == []