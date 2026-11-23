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


def open_page(browser, server, init=None):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    if init:
        ctx.add_init_script(init)
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


def connect(host, guest, named=True):
    """Host Anna invites, guest Ben answers -- the codes travel through the test, as they would through a chat."""
    host.click("#mpbtn")
    if named: host.fill("#mpname", "Anna")
    host.click("#mphostbtn")
    host.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R2H.')", timeout=T)
    host_code = host.input_value("#mpcode")

    guest.click("#mpbtn")
    if named: guest.fill("#mpname", "Ben")
    guest.click("#mpguestbtn")
    guest.fill("#mpin", host_code)
    guest.click("#mpmake")
    guest.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R2G.')", timeout=T)

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


def test_join_link_prefills_the_guest_and_waits_for_the_click(pair, server):
    host, guest, errors = pair
    host.click("#mpbtn"); host.fill("#mpname", "Anna"); host.click("#mphostbtn")
    host.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R2H.')", timeout=T)
    code = host.input_value("#mpcode")
    # a stub, not the real clipboard: a page served from a LAN address is no secure context, so navigator.clipboard is missing there
    host.evaluate("() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__link = t; return Promise.resolve(); } } })")
    host.click("#mpcopylink")
    assert host.evaluate("() => window.__link").endswith("#join=" + code)
    guest.goto(f"{server}/index.html?netice=none#join={code}")
    guest.wait_for_function(READY, timeout=240000)
    assert guest.input_value("#mpin") == code and "#" not in guest.url and net(guest)["peers"] == []
    guest.fill("#mpname", "Ben"); guest.click("#mpmake")
    guest.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R2G.')", timeout=T)
    assert not errors


def test_default_names_are_filled_and_unique(pair):
    """#979: no typing needed; the lobby holds two different, non-empty names."""
    host, guest, errors = pair
    connect(host, guest, named=False)
    found = names(host)
    assert len(found) == 2 and len(set(n.lower() for n in found)) == 2 and all(found), found
    assert names(guest) == found and not errors


def test_dice_rolls_a_name_and_forgets_the_typed_one(pair):
    """#1002: the dice replaces a typed name with a pool name and forgets the stored one."""
    host, guest, errors = pair
    host.click("#mpbtn"); host.fill("#mpname", "p1"); host.click("#mphostbtn")
    host.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R2H.')", timeout=T)
    host.reload(); host.wait_for_function(READY, timeout=240000)
    host.click("#mpbtn")
    assert host.input_value("#mpname") == "p1"
    host.click("#mpdice")
    rolled = host.input_value("#mpname")
    assert rolled and rolled != "p1"
    assert host.evaluate("() => localStorage.getItem('mm.mpName')") is None
    assert not errors


def test_name_field_takes_the_row_and_the_dice_stays_small(pair):
    """The dice beside the name keeps its own width; #mp .btn{width:100%} squeezed the field to nothing, so a rolled
    name was invisible and the dice looked broken."""
    host, guest, errors = pair
    host.click("#mpbtn")
    field, dice = (host.locator(s).bounding_box()["width"] for s in ("#mpname", "#mpdice"))
    assert dice <= 80 and field > 3 * dice, (field, dice)
    assert host.evaluate("() => { const i = document.querySelector('#mpname'); return i.scrollWidth <= i.clientWidth; }")
    assert not errors


DROP_FIRST_HELLO = """(() => {
  const send = RTCDataChannel.prototype.send;
  let dropped = false;
  RTCDataChannel.prototype.send = function (data) {
    if (!dropped && typeof data === 'string' && data.startsWith('{"type":"hello"')) { dropped = true; return; }
    return send.call(this, data);
  };
})();"""


def test_lost_first_hello_still_joins(server):
    """#1019: one lost hello must not strand the guest -- it repeats the hello until the lobby comes."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        host, host_errors = open_page(browser, server)
        guest, guest_errors = open_page(browser, server, init=DROP_FIRST_HELLO)
        connect(host, guest)
        assert names(host) == ["Anna", "Ben"]
        assert names(guest) == ["Anna", "Ben"]
        assert host_errors + guest_errors == []
        browser.close()
