"""#1111: an invite link clicked while the game already runs in another tab joins in that tab, not in the new one.
The two pages share one browser context -- a BroadcastChannel does not cross contexts -- and the invite code comes
from a third page in a context of its own, exactly the friend's device that sent the link; that page closes once its
code is carried over, so the handoff runs between two pages, not three heavy ones.
The waits poll on a 500 ms timer: a background tab's rAF starves under software GL, and an ambient game toast can
overwrite the handoff notices at any time -- the two text waits run first, so they catch the moment the notice stands.
Hand-traced layout (world + terrain blocked): no data files needed.
Slow (Playwright, heavy pages): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

from test_multiplayer_cruise import NO_THROTTLE
from test_multiplayer_lobby import ARGS, READY, T, net, open_page

JOINED_ELSEWHERE = "Joined in your other tab"   # mpJoinedElsewhere -- the pages run with locale="en-US"
JOIN_RECEIVED = "Invitation received"           # mpJoinReceived
PREFILLED = "(code) => !document.querySelector('#mpinbox').hidden && document.querySelector('#mpin').value === code"
TOAST_IS = "(t) => document.querySelector('#toast').textContent === t"


def open_tab(ctx, url):
    """A page in the shared context: the one context whose tabs hear each other's BroadcastChannel."""
    page = ctx.new_page()
    page.set_default_timeout(T)   # heavy pages in one browser: let clicks block generously
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(url)
    page.wait_for_function(READY, timeout=240000)
    return page, errors


def make_code(browser, server):
    """A third page, in a context of its own, hosts and makes a real invite code; the test carries it like a chat.
    The page closes once the code is out: the handoff below must not fight a third heavy page for the CPU."""
    host, _ = open_page(browser, server)
    host.click("#mpbtn"); host.fill("#mpname", "Anna"); host.click("#mphostbtn")
    host.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R4H.')", timeout=T)
    code = host.input_value("#mpcode")
    host.close()
    return code


@pytest.fixture(name="tabs")
def tabs_fixture(server):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS + NO_THROTTLE)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
        yield browser, ctx
        browser.close()


def test_linkInSecondTab_opensGuestScreenInFirstTab(tabs, server):
    """The open tab takes the offered code and shows the guest screen; the new tab only says so and stays empty."""
    browser, ctx = tabs
    code = make_code(browser, server)
    a, a_errors = open_tab(ctx, f"{server}/index.html?netice=none")
    b, b_errors = open_tab(ctx, f"{server}/index.html?netice=none#join={code}")

    b.wait_for_function(TOAST_IS, arg=JOINED_ELSEWHERE, timeout=T, polling=500)   # the handoff: offer, ready, go
    a.wait_for_function(TOAST_IS, arg=JOIN_RECEIVED, timeout=T, polling=500)
    a.wait_for_function(PREFILLED, arg=code, timeout=T, polling=500)

    assert b.evaluate("() => document.querySelector('#mp').hidden") is True   # no guest screen in the new tab
    assert b.evaluate("() => document.querySelector('#mpinbox').hidden") is True
    assert "#" not in a.url and "#" not in b.url                            # the fragment is gone, a reload cannot re-offer
    assert a_errors + b_errors == []


def test_linkInOnlyTab_joinsItself(tabs, server):
    """Nobody answers the offer, so the tab with the link joins itself, as before."""
    browser, ctx = tabs
    code = make_code(browser, server)
    page, errors = open_tab(ctx, f"{server}/index.html?netice=none#join={code}")

    page.wait_for_function(PREFILLED, arg=code, timeout=T, polling=500)   # after the 500 ms without a ready
    assert "#" not in page.url
    assert errors == []


def test_openTabAlreadyInSession_newTabJoinsItself(tabs, server):
    """A tab busy hosting never answers, so the new tab fills its own guest screen; the host stays untouched."""
    browser, ctx = tabs
    a, a_errors = open_tab(ctx, f"{server}/index.html?netice=none")
    a.click("#mpbtn"); a.fill("#mpname", "Anna"); a.click("#mphostbtn")
    a.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R4H.')", timeout=T, polling=500)
    code = a.input_value("#mpcode")
    assert net(a)["role"] == "H"

    b, b_errors = open_tab(ctx, f"{server}/index.html?netice=none#join={code}")
    b.wait_for_function(PREFILLED, arg=code, timeout=T, polling=500)
    assert a.evaluate("() => document.querySelector('#mpinbox').hidden") is True   # the host never opened a guest box
    assert a.input_value("#mpin") == ""
    assert "#" not in b.url and "#" not in a.url
    assert a_errors + b_errors == []
