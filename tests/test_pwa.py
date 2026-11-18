"""#1076: the installed app shows a Reload button on the start screen and in the pause menu; the website does not.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_start_screen import boot, READY, T


def test_pwa_reload_button_only_in_the_installed_app(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        assert not page.locator("#reloadbtn").is_visible()
        assert page.locator("#pausereload").count() == 1
        assert page.evaluate("() => document.documentElement.classList.contains('installed')") is False
        page.evaluate("() => document.documentElement.classList.add('installed')")
        assert page.locator("#reloadbtn").is_visible()
        assert page.locator("#reloadbtn").inner_text().strip() == "Reload"
        page.locator("#reloadbtn").click()
        page.wait_for_function(READY, timeout=T)
        assert page.evaluate("() => performance.getEntriesByType('navigation')[0].type") == "reload"
        assert errors == []
        b.close()
