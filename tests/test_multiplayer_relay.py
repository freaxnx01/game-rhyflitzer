"""#1198: one room code brings everybody in. The signaling relay is faked in the test process (route_web_socket, no
server and no network): it implements create/join/signal of docs/relay-protocol.md and nothing else, so what the two
pages actually do is the real WebRTC handshake -- only the two codes travel through the fake instead of through a chat.
Hand-traced layout (world + terrain blocked): no data files needed.
Slow (Playwright): run in the foreground."""
import json

from playwright.sync_api import sync_playwright

from test_multiplayer_lobby import ARGS, READY, T, names, net, open_page

ROOM = "RHY-4827"
VERSION_ERROR = "That code is from another version of the game. Both of you need to reload the page."   # mpErrVersion


class FakeRelay:
    """The relay of docs/relay-protocol.md, in a dict. One room code, peer ids from 1, nothing else.
    `mangle` rewrites what the host forwards, so a test can deliver garbage the way a broken relay would.
    `offer`, when set, stands in for a host page: every guest that joins gets it at once as the host's signal."""

    def __init__(self, mangle=None, offer=None):
        self.mangle = mangle
        self.offer = offer
        self.room = None           # {"host": ws, "guests": {peer: ws}, "next": 1}
        self.from_guests = []      # every `signal` a guest sent, so a test can assert none was

    def handler(self, ws):
        side = {"peer": None}
        ws.on_message(lambda raw: self._message(ws, side, raw))

    def _message(self, ws, side, raw):
        frame = json.loads(raw)
        if frame["t"] == "create":
            self.room = {"host": ws, "guests": {}, "next": 1}
            side["peer"] = 0
            ws.send(json.dumps({"t": "created", "room": ROOM, "ttl": 3600}))
        elif frame["t"] == "join":
            if self.room is None or frame["room"] != ROOM:
                ws.send(json.dumps({"t": "error", "code": "no-room"}))
                return
            side["peer"] = self.room["next"]
            self.room["next"] += 1
            self.room["guests"][side["peer"]] = ws
            ws.send(json.dumps({"t": "joined", "peer": side["peer"]}))
            if self.offer:
                ws.send(json.dumps({"t": "signal", "from": 0, "data": self.offer}))
            elif self.room["host"]:
                self.room["host"].send(json.dumps({"t": "guest", "peer": side["peer"]}))
        elif frame["t"] == "signal":
            self._forward(side["peer"], frame)

    def _forward(self, peer, frame):
        if self.room is None:
            return
        data = frame["data"]
        if peer == 0:
            target = self.room["guests"].get(frame["to"])
            if self.mangle:
                data = self.mangle(data)
        else:
            self.from_guests.append(data)
            target = self.room["host"]
        if target:
            target.send(json.dumps({"t": "signal", "from": peer, "data": data}))


def host_a_room(browser, server, relay):
    """Anna hosts; the relay hands her the room code and she waits in the dialog with it on screen."""
    host, errors = open_page(browser, server, relay=relay.handler)
    host.click("#mpbtn")
    host.fill("#mpname", "Anna")
    host.click("#mphostbtn")
    host.wait_for_function("(room) => document.querySelector('#mproomcode').textContent === room", arg=ROOM, timeout=T)
    return host, errors


def join_room(browser, server, relay, name, typed=ROOM):
    """A guest opens the game, types the room code and asks to join; the rest happens on its own."""
    guest, errors = open_page(browser, server, relay=relay.handler)
    guest.click("#mpbtn")
    guest.fill("#mpname", name)
    guest.click("#mpguestbtn")
    guest.fill("#mproomfield", typed)
    guest.click("#mproomjoin")
    return guest, errors


def in_lobby(page):
    page.wait_for_function("() => !document.querySelector('#mplobby').hidden && window.__mm.net().lobby", timeout=T)


def test_room_code_brings_guest_into_lobby(server):
    """Ben types the code the way a player would say it ("rhy 4827") and is in the lobby -- no code pasted anywhere."""
    relay = FakeRelay()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        host, host_errors = host_a_room(browser, server, relay)
        guest, guest_errors = open_page(browser, server, relay=relay.handler)
        guest.click("#mpbtn")
        guest.fill("#mpname", "Ben")
        guest.click("#mpguestbtn")
        guest.fill("#mproomfield", "rhy 4827")
        guest.click("#mproomjoin")

        for page in (host, guest):
            page.wait_for_function("() => !document.querySelector('#mplobby').hidden && window.__mm.net().lobby", timeout=T)
        assert names(host) == ["Anna", "Ben"]
        assert names(guest) == ["Anna", "Ben"]
        assert net(host)["peers"] == [1]
        assert host.text_content("#mproomline") == f"Room code {ROOM}"   # the host can read it out to the next friend
        assert host.input_value("#mpcode") == "" and guest.input_value("#mpin") == ""   # nothing changed hands by paste
        assert host_errors + guest_errors == []
        browser.close()


def test_relay_down_offers_manual_way(server):
    """An unreachable relay says so and offers the code way; it never switches on its own."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        host, errors = open_page(browser, server)   # the default stub closes the socket on the first frame
        host.click("#mpbtn")
        host.fill("#mpname", "Anna")
        host.click("#mphostbtn")
        host.wait_for_function(
            "() => document.querySelector('#mpstatus').textContent === 'Matchmaker unreachable'", timeout=T)
        assert host.is_visible("#mpmanual") and not host.is_visible("#mproombox")
        assert host.input_value("#mpcode") == ""     # the manual code appears on the player's click, not before
        assert host.text_content("#mpmanual") == "Connect without server"

        host.click("#mpmanual")
        host.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R')", timeout=T)
        assert errors == []
        browser.close()


def test_garbage_from_relay_never_answers(server):
    """The relay is not trusted: a payload decodeCode refuses is counted and shown, and no answer goes back."""
    relay = FakeRelay(mangle=lambda data: "R2H.garbage")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        host, host_errors = host_a_room(browser, server, relay)
        guest, guest_errors = open_page(browser, server, relay=relay.handler)
        guest.click("#mpbtn")
        guest.fill("#mpname", "Ben")
        guest.click("#mpguestbtn")
        guest.fill("#mproomfield", ROOM)
        guest.click("#mproomjoin")

        guest.wait_for_function("() => window.__mm.net().bad === 1", timeout=T)
        assert guest.text_content("#mpstatus") == VERSION_ERROR
        assert net(guest)["peers"] == []            # guestAnswer was never reached: no peer connection exists
        assert relay.from_guests == []              # and nothing was sent back for the host to accept
        assert guest.evaluate("() => document.querySelector('#mplobby').hidden") is True
        assert host_errors + guest_errors == []
        browser.close()


def test_same_room_code_admits_a_second_guest(server):
    """The headline of #1198: one code for everyone. Ben is in and playing host's lobby already; Cleo types the very same
    code afterwards and lands in the same lobby -- the host never made a second code."""
    relay = FakeRelay()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        host, host_errors = host_a_room(browser, server, relay)
        ben, ben_errors = join_room(browser, server, relay, "Ben")
        for page in (host, ben):
            in_lobby(page)
        assert net(host)["peers"] == [1]

        cleo, cleo_errors = join_room(browser, server, relay, "Cleo", typed="4827")
        in_lobby(cleo)
        host.wait_for_function("() => window.__mm.net().lobby.players.length === 3", timeout=T)
        assert names(host) == ["Anna", "Ben", "Cleo"]
        assert names(cleo) == ["Anna", "Ben", "Cleo"]
        assert net(host)["peers"] == [1, 2]
        assert relay.room["next"] == 3                # both came in through the one room Anna opened
        assert host.text_content("#mproomline") == f"Room code {ROOM}"   # and it is still open for the next friend
        assert host_errors + ben_errors + cleo_errors == []
        browser.close()


def test_region_mismatch_parks_the_room_code(server):
    """A10: the host drives another region, so the guest reloads into it. What survives the reload is the room code,
    not the offer (its answer would have no way back): the guest comes back to the room field with the code filled in.
    The relay stands in for the host page with a well-formed offer from Ehrendingen; no peer connection is made."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        relay = FakeRelay()
        guest, errors = open_page(browser, server, relay=relay.handler)
        guest.route("**/data/*_ehrendingen.*", lambda r: r.fulfill(status=404, body=""))
        relay.offer = guest.evaluate("""async () => {
          const { encodeCode } = await import('./netcodec.js');
          return encodeCode('H', 'v=0\\r\\n', 'ehrendingen', Math.floor(Date.now() / 1000));
        }""")
        relay.room = {"host": None, "guests": {}, "next": 1}   # the host's room, without a host page behind it
        guest.click("#mpbtn")
        guest.fill("#mpname", "Ben")
        guest.click("#mpguestbtn")
        guest.fill("#mproomfield", ROOM)
        guest.click("#mproomjoin")

        guest.wait_for_function("() => !document.querySelector('#mpregion').hidden", timeout=T)
        assert relay.from_guests == []               # nothing was answered to an offer from another region
        guest.click("#mpregion")
        guest.wait_for_url("**/index.html?netice=none&region=ehrendingen", timeout=T)
        guest.wait_for_function(READY, timeout=240000)
        guest.wait_for_function("() => !document.querySelector('#mproombox').hidden", timeout=T)
        assert guest.input_value("#mproomfield") == ROOM
        assert guest.is_hidden("#mpinbox")           # the room field, not the manual code inbox
        assert guest.evaluate("() => document.activeElement.id") == "mproomjoin"
        assert errors == []
        browser.close()
