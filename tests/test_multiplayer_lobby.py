"""#834: two players meet in one lobby. One browser, two contexts, the codes copied from page to page by the test --
exactly what two players do by chat. ?netice=none drops STUN, so the whole handshake stays on loopback and the test
needs no internet; --disable-features=WebRtcHideLocalIpsWithMdns keeps the host candidates readable addresses.
Hand-traced layout (world + terrain blocked): no data files needed.
Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

ARGS = [
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--disable-features=WebRtcHideLocalIpsWithMdns",
]
READY = "() => window.__mm && window.__mm.sim && window.__mm.net && document.querySelector('#worldstatus')?.textContent"
T = 120000


def open_page(browser, server):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    page = ctx.new_page()
    page.set_default_timeout(T)   # two heavy pages in one browser: the background one settles slowly, so let clicks block
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html?netice=none")
    page.wait_for_function(READY, timeout=240000)
    return page, errors


def net(page):
    return page.evaluate("() => window.__mm.net()")


def names(page):
    return [p["name"] for p in (net(page)["lobby"] or {"players": []})["players"]]


def rows(page):
    return page.evaluate("() => [...document.querySelectorAll('#mpplayers .mp-row')].map(r => r.textContent)")


def connect(host, guest):
    """Host Anna invites, guest Ben answers -- the codes travel through the test, as they would through a chat."""
    host.click("#mpbtn")
    host.fill("#mpname", "Anna")
    host.click("#mphostbtn")
    host.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R1H.')", timeout=T)
    host_code = host.input_value("#mpcode")

    guest.click("#mpbtn")
    guest.fill("#mpname", "Ben")
    guest.click("#mpguestbtn")
    guest.fill("#mpin", host_code)
    guest.click("#mpmake")
    guest.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R1G.')", timeout=T)

    host.fill("#mpanswerin", guest.input_value("#mpcode"))
    host.click("#mpaccept")
    for page in (host, guest):
        page.wait_for_function("() => !document.querySelector('#mplobby').hidden && window.__mm.net().lobby", timeout=T)
    return host_code


@pytest.fixture(name="pair")
def pair_fixture(server):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        host, host_errors = open_page(browser, server)
        guest, guest_errors = open_page(browser, server)
        yield host, guest, host_errors + guest_errors
        browser.close()


def test_two_pages_meet_in_one_lobby(pair):
    """Both devices show both players, the host star and the ready flags; a class change filters the guest's picker."""
    host, guest, errors = pair
    connect(host, guest)

    assert names(host) == ["Anna", "Ben"]
    assert names(guest) == ["Anna", "Ben"]
    assert net(host)["role"] == "H" and net(host)["you"] == 0
    assert net(guest)["role"] == "G" and net(guest)["you"] == 1
    assert net(host)["peers"] == [1]
    host_rows = rows(host)
    assert "Anna" in host_rows[0] and "Host" in host_rows[0] and "you" in host_rows[0]
    assert "Ben" in host_rows[1] and "no car yet" in host_rows[1]
    assert rows(guest)[1].count("Ben") == 1 and "you" in rows(guest)[1]
    # the host owns the class: only the host sees the buttons
    assert host.is_visible("#mpclassrow") and not guest.is_visible("#mpclassrow")
    assert host.text_content("#mplobbystatus") == "Starts when everyone is ready"   # #917: the start hint is the visible status (was a hidden title)

    # the host narrows the class to D; the guest's picker then offers only class-D cars
    host.click("#mpclassbtns button[data-cls='D']")
    guest.wait_for_function("() => window.__mm.net().lobby.cls === 'D'", timeout=T)
    guest.click("#mppick")
    guest.wait_for_function("() => !document.querySelector('#carsel').hidden && window.__mm.carsel().open", timeout=T)
    offered = guest.evaluate("() => [...document.querySelectorAll('#csgarage button')].map(b => b.dataset.id)")
    total = guest.evaluate("() => Object.keys(window.__mm.vehicles()).length")
    assert 0 < len(offered) < total, (offered, total)
    guest.click("#csgallerybtn")   # the gallery prints each tile's class, so the filter is readable
    tiles = guest.evaluate("() => [...document.querySelectorAll('#csgallery .cs-thumb .cs-tclass')].map(e => e.textContent)")
    assert len(tiles) == len(offered) and all(t.endswith("Class D") for t in tiles), tiles
    guest.keyboard.press("Escape")   # back out of the gallery, stay in the picker
    assert guest.text_content("#csrace") == "Take this car"
    picked = guest.evaluate("() => window.__mm.carsel().id")
    guest.click("#csrace")

    # the pick and the ready flag arrive on the host
    host.wait_for_function(
        "(id) => window.__mm.net().lobby.players[1].car === id", arg=picked, timeout=T)
    guest.wait_for_function("() => !document.querySelector('#mpready').disabled", timeout=T)
    guest.click("#mpready")
    host.wait_for_function("() => window.__mm.net().lobby.players[1].ready === true", timeout=T)
    assert "ready" in rows(host)[1]

    # the host picks a fitting car and is ready too: the field would be ready to go (#837 starts it)
    host.click("#mppick")
    host.wait_for_function("() => window.__mm.carsel().open", timeout=T)
    host.click("#csrace")
    host.wait_for_function("() => !document.querySelector('#mpready').disabled", timeout=T)
    host.click("#mpready")
    guest.wait_for_function(
        "() => document.querySelector('#mplobbystatus').textContent === 'Everyone ready'", timeout=T)
    assert host.text_content("#mplobbystatus") == "Everyone ready"

    assert errors == []


def test_garbage_on_the_channel_is_counted_and_a_lost_host_sends_the_guest_home(pair):
    """Anything parseMessage refuses is dropped and counted; when the host goes, the guest is told and sent back."""
    host, guest, errors = pair
    connect(host, guest)
    assert net(guest)["bad"] == 0

    # four messages the guest's parseMessage must refuse: an unknown type, an empty name, a car this build has
    # no table entry for, and a lobby whose `you` names nobody. Each is dropped and counted, none of them throws.
    host.evaluate("""() => {
        const bad = [{ type: 'eval', code: '1' }, { type: 'hello', name: '' }, { type: 'pick', car: 'tank', paint: 'navy' },
          { type: 'lobby', you: 9, region: 'hochrhein', cls: 'all', players: [{ id: 0, name: 'Anna', car: null, paint: null, ready: false }] }];
        for (const msg of bad) window.__mm.netSend(1, msg);
    }""")
    guest.wait_for_function("() => window.__mm.net().bad === 4", timeout=T)
    assert names(guest) == ["Anna", "Ben"]       # nothing of it reached the lobby

    # the host leaves: the guest reads why and is back on the start screen
    host.click("#mpleave")
    guest.wait_for_function("() => document.querySelector('#mplobby').hidden", timeout=T)
    assert guest.text_content("#toast") == "Lost the connection to the host."
    assert guest.evaluate("() => document.querySelector('#overlay').hidden") is False
    assert net(guest)["role"] is None and net(guest)["lobby"] is None
    assert errors == []
