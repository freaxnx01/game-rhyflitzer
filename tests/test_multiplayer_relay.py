"""#1198: one room code brings everybody in. The signaling relay is faked in the test process (route_web_socket, no
server and no network): it implements create/join/signal of docs/relay-protocol.md and nothing else, so what the two
pages actually do is the real WebRTC handshake -- only the two codes travel through the fake instead of through a chat.
Hand-traced layout (world + terrain blocked): no data files needed.
Slow (Playwright): run in the foreground."""
import json

from playwright.sync_api import sync_playwright

from test_multiplayer_lobby import ARGS, T, names, net, open_page

ROOM = "RHY-4827"
VERSION_ERROR = "That code is from another version of the game. Both of you need to reload the page."   # mpErrVersion


class FakeRelay:
    """The relay of docs/relay-protocol.md, in a dict. One room code, peer ids from 1, nothing else.
    `mangle` rewrites what the host forwards, so a test can deliver garbage the way a broken relay would."""

    def __init__(self, mangle=None):
        self.mangle = mangle
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
        host, errors = open_page(browser, server)   # the default stub closes the socket at once
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
