"""#1080: the iOS home-screen hint shows on an iPhone in the browser, stays dismissed, never shows in the installed app or on desktop.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_start_screen import ARGS, READY, T

IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def open_page(p, server, ua, touch):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(user_agent=ua, viewport={"width": 390, "height": 844}, has_touch=touch, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def test_ios_hint_shows_dismisses_and_hides_when_installed(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, IPHONE, True)
        hint = page.locator("#ioshint")
        assert hint.is_visible()
        assert "Add to Home Screen" in hint.inner_text()
        page.locator("#ioshintx").click()
        assert not hint.is_visible()
        page.reload(timeout=T)
        page.wait_for_function(READY, timeout=T)
        assert not page.locator("#ioshint").is_visible()
        page.evaluate("() => localStorage.removeItem('mm.iosHintDismissed')")
        page.reload(timeout=T)
        page.wait_for_function(READY, timeout=T)
        assert page.locator("#ioshint").is_visible()
        page.evaluate("() => document.documentElement.classList.add('installed')")
        assert not page.locator("#ioshint").is_visible()
        assert errors == []
        b.close()


def test_ios_hint_is_hidden_on_desktop(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, DESKTOP, False)
        assert not page.locator("#ioshint").is_visible()
        assert errors == []
        b.close()