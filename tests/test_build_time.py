"""Version badge tooltip: when the page was last deployed (GitHub Pages serves the build time as Last-Modified), in the
visitor's own time zone and language, plus how long ago — refreshed on every hover. The page is served with a fixed
Last-Modified and the browser clock is pinned, so the texts are exact. Only the nav is needed, so three.js is blocked
and the game itself never starts: fast. Playwright: run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

BUILT = "Sun, 11 Oct 2026 06:59:45 GMT"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def open_page(p, server, locale, tz, now, last_modified=BUILT):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(locale=locale, timezone_id=tz, viewport={"width": 1280, "height": 720})
    page = ctx.new_page()
    page.clock.set_fixed_time(now)
    page.route("https://**", lambda r: r.abort())   # no three.js, so no game: the nav is plain markup and classic scripts

    def stamp(route):
        response = route.fetch()
        headers = {k: v for k, v in response.headers.items() if k.lower() != "last-modified"}
        if last_modified:
            headers["last-modified"] = last_modified
        route.fulfill(response=response, headers=headers)

    page.route("**/index.html", stamp)
    page.goto(f"{server}/index.html", wait_until="domcontentloaded", timeout=240000)
    page.wait_for_selector("#version-badge a", state="attached", timeout=240000)
    page.wait_for_function("() => window.__buildTimeReady === true", timeout=240000)   # #353: built from the header
    return b, page


def titles(page):
    """Both titles, with the narrow no-break space some locales put before AM/PM turned into a plain one."""
    got = page.evaluate("""() => [document.querySelector('#version-badge').title,
                                  document.querySelector('#version-badge a').title]""")
    return [t.replace(" ", " ") for t in got]


@pytest.mark.parametrize("locale,tz,expected", [
    ("de-CH", "Europe/Zurich", "Build: 11.10.2026, 08:59 (vor 1 Stunde 35 Minuten) · Changelog"),
    ("en-US", "America/New_York", "Build: Oct 11, 2026, 2:59 AM (1 hour 35 minutes ago) · Changelog"),
])
def test_hover_shows_the_build_time_in_the_visitors_zone_and_language(server, locale, tz, expected):
    with sync_playwright() as p:
        b, page = open_page(p, server, locale, tz, "2026-10-11T08:34:45Z")
        page.hover("#version-badge a")
        got = titles(page)
        b.close()
    assert got == [expected, expected]


@pytest.mark.parametrize("lang,cases", [
    ("en", [("2026-10-11T06:59:50Z", "just now"),
            ("2026-10-11T07:00:45Z", "1 minute ago"),
            ("2026-10-11T07:34:45Z", "35 minutes ago"),
            ("2026-10-11T08:59:45Z", "2 hours ago"),
            ("2026-10-12T08:59:45Z", "1 day 2 hours ago"),
            ("2026-10-13T07:20:45Z", "2 days ago"),
            ("2026-10-11T06:00:00Z", "just now")]),          # visitor's clock behind the server's
    ("de", [("2026-10-11T06:59:50Z", "gerade eben"),
            ("2026-10-11T07:00:45Z", "vor 1 Minute"),
            ("2026-10-11T07:34:45Z", "vor 35 Minuten"),
            ("2026-10-11T08:59:45Z", "vor 2 Stunden"),
            ("2026-10-12T08:59:45Z", "vor 1 Tag 2 Stunden"),
            ("2026-10-13T07:20:45Z", "vor 2 Tagen")]),
])
def test_the_age_is_recomputed_on_every_hover(server, lang, cases):
    locale = "de-CH" if lang == "de" else "en-GB"
    got = []
    with sync_playwright() as p:
        b, page = open_page(p, server, locale, "Europe/Zurich", cases[0][0])
        for now, _ in cases:
            page.clock.set_fixed_time(now)
            page.dispatch_event("#version-badge a", "mouseover")
            got.append(titles(page)[1].split("(")[1].split(")")[0])
        b.close()
    assert got == [age for _, age in cases]


def test_the_language_toggle_switches_the_tooltip(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, "en-US", "Europe/Zurich", "2026-10-11T08:34:45Z")
        page.evaluate("window.ggSetLang('de')")
        page.hover("#version-badge a")
        got = titles(page)[1]
        b.close()
    assert got == "Build: 11.10.2026, 08:59 (vor 1 Stunde 35 Minuten) · Changelog"


def test_the_changelog_link_keeps_its_plain_tooltip_until_hovered(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, "en-US", "Europe/Zurich", "2026-10-11T08:34:45Z")
        got = titles(page)
        href = page.get_attribute("#version-badge a", "href")
        b.close()
    assert got == ["Version", "Changelog"]
    assert href.endswith("/CHANGELOG.md")
