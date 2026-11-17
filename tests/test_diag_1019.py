"""#1019 DIAGNOSTIC ONLY (throwaway branch, never merged): connect the lobby repeatedly on the CI runner and report every
WebRTC event (candidates, ICE/connection states) plus main-thread gaps. Each case fails on purpose so its log shows."""
import json, time
import pytest
from playwright.sync_api import sync_playwright
import test_multiplayer_lobby as L

INSTR = """(() => {
  const t0 = performance.now(), log = window.__rtclog = [];
  const add = (who, what) => log.push([Math.round(performance.now() - t0), who, what]);
  const Orig = window.RTCPeerConnection; let n = 0;
  window.RTCPeerConnection = function (...a) { const pc = new Orig(...a), id = 'pc' + (n++);
    add(id, 'new ' + JSON.stringify(a[0] && a[0].iceServers));
    for (const ev of ['connectionstatechange', 'iceconnectionstatechange', 'icegatheringstatechange', 'signalingstatechange'])
      pc.addEventListener(ev, () => add(id, ev + ':' + ({connectionstatechange: pc.connectionState, iceconnectionstatechange: pc.iceConnectionState, icegatheringstatechange: pc.iceGatheringState, signalingstatechange: pc.signalingState})[ev]));
    pc.addEventListener('icecandidate', (e) => add(id, 'cand:' + (e.candidate ? e.candidate.candidate.split(' ').slice(4, 8).join(' ') : 'null')));
    pc.addEventListener('datachannel', (e) => { add(id, 'dc:' + e.channel.label); e.channel.addEventListener('open', () => add(id, 'dcopen:' + e.channel.label)); });
    const cdc = pc.createDataChannel.bind(pc); pc.createDataChannel = (l, o) => { const c = cdc(l, o); c.addEventListener('open', () => add(id, 'dcopen:' + l)); return c; };
    return pc; };
  window.RTCPeerConnection.prototype = Orig.prototype;
  let last = performance.now(); (function f() { const now = performance.now(); if (now - last > 1500) add('main', 'gap ' + Math.round(now - last)); last = now; requestAnimationFrame(f); })();
})();"""


def open_page(browser, server):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    ctx.add_init_script(INSTR)
    page = ctx.new_page()
    page.set_default_timeout(L.T)
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html?netice=none")
    page.wait_for_function(L.READY, timeout=240000)
    return page


def state(page):
    return page.evaluate("() => ({net: window.__mm.net(), ua: navigator.userAgent, status: document.querySelector('#mpstatus')?.textContent, log: window.__rtclog})")


@pytest.mark.parametrize("k", range(6))
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
