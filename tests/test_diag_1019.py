"""#1019 DIAGNOSTIC ONLY (throwaway branch, never merged): connect the lobby repeatedly on the CI runner and report every
WebRTC event (candidates, ICE/connection states) plus main-thread gaps. Each case fails on purpose so its log shows."""
import json, time
import pytest
from playwright.sync_api import sync_playwright
import test_multiplayer_lobby as L

INSTR = """(() => {
  const log = window.__rtclog = [];
  const add = (who, what) => log.push([Date.now() % 1000000, who, what]);
  const osend = RTCDataChannel.prototype.send; RTCDataChannel.prototype.send = function (d) { if (typeof d === 'string') add(this.label, 'send ' + this.readyState + ' ' + d.slice(0, 50)); return osend.call(this, d); };
  const Orig = window.RTCPeerConnection; let n = 0;
  window.RTCPeerConnection = function (...a) { const pc = new Orig(...a), id = 'pc' + (n++);
    add(id, 'new ' + JSON.stringify(a[0] && a[0].iceServers));
    for (const ev of ['connectionstatechange', 'iceconnectionstatechange', 'icegatheringstatechange', 'signalingstatechange'])
      pc.addEventListener(ev, () => add(id, ev + ':' + ({connectionstatechange: pc.connectionState, iceconnectionstatechange: pc.iceConnectionState, icegatheringstatechange: pc.iceGatheringState, signalingstatechange: pc.signalingState})[ev]));
    pc.addEventListener('icecandidate', (e) => add(id, 'cand:' + (e.candidate ? e.candidate.candidate.split(' ').slice(4, 8).join(' ') : 'null')));
    pc.addEventListener('datachannel', (e) => { add(id, 'dc:' + e.channel.label + ' ' + e.channel.readyState); e.channel.addEventListener('open', () => add(id, 'dcopen:' + e.channel.label)); e.channel.addEventListener('message', (m) => { if (typeof m.data === 'string') add(id, 'recv ' + m.data.slice(0, 50)); }); });
    const cdc = pc.createDataChannel.bind(pc); pc.createDataChannel = (l, o) => { const c = cdc(l, o); c.addEventListener('open', () => add(id, 'dcopen:' + l)); c.addEventListener('message', (m) => { if (typeof m.data === 'string') add(id, 'recv ' + m.data.slice(0, 50)); }); return c; };
    const srd = pc.setRemoteDescription.bind(pc); pc.setRemoteDescription = (d) => { add(id, 'SRD ' + (d && d.type)); return srd(d); };
    return pc; };
  window.RTCPeerConnection.prototype = Orig.prototype;
  let last = performance.now(); (function f() { const now = performance.now(); if (now - last > 1500) add('main', 'gap ' + Math.round(now - last)); last = now; requestAnimationFrame(f); })();
})();"""


def open_page(browser, server):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    ctx.add_init_script(INSTR)
    page = ctx.new_page()
    page._diag = []
    page.on("pageerror", lambda e: page._diag.append("pageerror " + str(e)[:200]))
    page.on("console", lambda m: page._diag.append(m.type + " " + m.text[:200]) if m.type in ("error", "warning") else None)
    page.set_default_timeout(L.T)
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html?netice=none")
    page.wait_for_function(L.READY, timeout=240000)
    return page


def state(page):
    return {"errors": page._diag[-20:], **page.evaluate("() => ({net: window.__mm.net(), ua: navigator.userAgent, names: (window.__mm.net().lobby || {players: []}).players.map(p => p.name), log: window.__rtclog})")}


@pytest.mark.parametrize("k", range(16))
def test_diag_lobby_connect(server, k):
    L.T = 90000
    with sync_playwright() as p:
        browser = p.chromium.launch(args=L.ARGS)
        host, guest = open_page(browser, server), open_page(browser, server)
        t, err = time.time(), None
        try:
            L.connect(host, guest)
        except Exception as e:   # the diagnosis wants the state either way
            err = str(e).split("\n")[0]
        took = time.time() - t
        out = {"ok": err is None, "err": err, "connect_s": round(took), "host": state(host), "guest": state(guest)}
        browser.close()
    assert False, "DIAG " + json.dumps(out)
