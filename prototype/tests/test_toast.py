"""#75: toasts centred below the checkpoint block, 4 s for key presses, 5 s for game events.
Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

RECTS_JS = """() => { const r = id => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
  const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
  return { vw: innerWidth, vh: innerHeight, toast: r('toast'), roadname: r('roadname'), tl: r('tl'), tr: r('tr'), compass: r('compass'), debug: r('debug') }; }"""

VIEWS = {
    "desktop": dict(viewport={"width": 1280, "height": 720}),
    "narrow-window": dict(viewport={"width": 390, "height": 844}),
    "touch-phone": dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True),
}


def start_hand(p, server, query="", **ctx):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(**({"viewport": {"width": 480, "height": 270}} | ctx)).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


@pytest.mark.parametrize("view", list(VIEWS))
def test_key_toast_is_centred_below_the_checkpoint_block(server, view):
    with sync_playwright() as p:
        b, page = start_hand(p, server, "?debug", **VIEWS[view])
        page.keyboard.press("KeyG")                                         # hand layout: "no data" toast
        page.wait_for_function("() => document.querySelector('#toast').classList.contains('show')", timeout=120000)
        page.wait_for_timeout(300)                                          # let the .2s fade-in finish
        r = page.evaluate(RECTS_JS)
        b.close()
    t = r["toast"]
    assert abs((t[0] + t[2]) / 2 - r["vw"] / 2) <= 2, r                  # horizontally centred
    assert t[1] >= r["roadname"][3], r                                   # below the checkpoint block
    assert t[3] <= r["vh"] / 2, r                                        # upper half: the road ahead stays clear
    for name in ("tl", "tr", "compass", "debug"):
        if r[name]:
            assert not overlaps(t, r[name]), (name, r)


def test_key_toast_lasts_four_seconds(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        page.keyboard.press("KeyG")
        shown = page.evaluate("() => window.__mm.toast()")
        b.close()
    assert shown["shown"]
    assert 3.5 < shown["left"] <= 4.0, shown


def test_water_toast_lasts_five_seconds(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server, locale="de-CH")
        page.evaluate("() => window.__mm.place(863.6, -647.7)")          # middle of the hand-traced Rhine
        page.wait_for_function("() => window.__mm.car().splash > 0.6", timeout=180000)
        shown = page.evaluate("() => window.__mm.toast()")
        b.close()
    assert shown["text"] == "Grüss mir die Fische!"
    assert shown["left"] > 4.2, shown                                    # 5 s minus the ~0.3 s since splash 0.35


def test_start_screen_covers_the_checkpoint_block(server):
    """Review of #111: #tc's z-index must stay inside the HUD; on the start (and result) screen the overlay paints on
    top of the arrow, the distance plate and any toast, as before #75."""
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.add_style_tag(content="#hud, #hud * { pointer-events: auto !important }")   # elementFromPoint skips pointer-events:none, the HUD's default
        on_top = page.evaluate("""() => { const r = document.querySelector('#tc').getBoundingClientRect();
            const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el && el.closest('#overlay') ? 'overlay' : (el && el.id) || el?.tagName; }""")
        b.close()
    assert on_top == "overlay", on_top


STEER_JS = """() => { const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect();
  return b.width ? [b.left, b.top, b.right, b.bottom] : null; };
  return { vw: innerWidth, vh: innerHeight, debug: r('debug'), tl: r('tl'), steer: ['tL', 'tR', 'tG', 'tB', 'tH'].map(r) }; }"""


def test_debug_panel_clears_the_hud_on_a_phone(server):
    """#178: the open panel (legend + map links) must not sit on the checkpoint block or the steering circles."""
    with sync_playwright() as p:
        b, page = start_hand(p, server, "?debug", **VIEWS["touch-phone"])
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=120000)
        page.evaluate("() => document.getElementById('debughelp').click()")
        page.wait_for_function("() => window.__mm.debug().legend", timeout=120000)
        r = page.evaluate(STEER_JS)
        b.close()
    d = r["debug"]
    assert d and d[0] >= 0 and d[1] >= 0 and d[2] <= r["vw"] and d[3] <= r["vh"], r
    assert not overlaps(d, r["tl"]), r
    for s in r["steer"]:
        assert s and not overlaps(d, s), (s, r)
