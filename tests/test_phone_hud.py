"""#776: on a 390x844 touch phone nothing in the driving HUD overlaps the map, the speedometer or another plate,
in cruise and in the time trial; the footer and the style button are not shown while driving, and the pause dialog
carries the style switch the hidden button took away (a wider touch screen keeps the button instead).
Slow (Playwright): run in the foreground."""
import pytest
from itertools import combinations

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 120000

# every HUD box that can be on screen while driving; invisible ones (display:none, hidden, zero size) are skipped
RECTS_JS = """() => {
  const box = (name, e) => {
    if (!e || e.hidden) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0 ? [name, b.left, b.top, b.right, b.bottom] : null;
  };
  const byId = id => document.getElementById(id);
  const out = ['tl', 'tr', 'compass', 'bl', 'speedplate', 'br', 'pausebtn', 'stylebtn', 'game-nav', 'radiobtn', 'radiopanel']
    .map(id => box(id, byId(id)));
  for (const c of byId('tc').children) if (c.id !== 'toast' && c.id !== 'blink') out.push(box('tc>' + (c.id || c.tagName), c));
  for (const b of byId('touch').querySelectorAll('button')) out.push(box('touch>' + b.id, b));
  return out.filter(Boolean);
}"""


def open_phone(p, server, width=390, height=844):
    b = p.chromium.launch(args=ARGS)
    # has_touch without is_mobile, like tests/test_pause.py: index.html has no <meta name="viewport">, so mobile
    # emulation would lay the page out at 980 CSS px and no phone media query would fire at all.
    ctx = b.new_context(viewport={"width": width, "height": height}, has_touch=True, locale="de-CH")
    page = ctx.new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page


def intersect(a, b):
    return a[1] < b[3] and b[1] < a[3] and a[2] < b[4] and b[2] < a[4]


def siblings_in_tc(a, b):
    """#tc is a flex column the browser lays out, so its children cannot overlap each other by layout -- but #arrow
    is rotated towards the next checkpoint every frame, and a rotated 80x60 box has a bounding box up to 99x99, so it
    reaches into the row below it whatever the spacing. What matters is the arrow row's distance to everything outside #tc."""
    return a[0].startswith("tc>") and b[0].startswith("tc>")


def overlaps(page):
    boxes = page.evaluate(RECTS_JS)
    return [(a[0], b[0]) for a, b in combinations(boxes, 2) if intersect(a, b) and not siblings_in_tc(a, b)], {x[0] for x in boxes}


def start(page, button):
    page.click(button)
    page.wait_for_function("() => ['armed', 'racing'].includes(window.__mm.pause().state)", timeout=T)
    page.wait_for_function("() => window.__mm.pause().frame >= 5", timeout=T)


def test_cruise_phone_hud_nothing_overlaps(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        start(page, "#cruisebtn")
        hits, shown = overlaps(page)
        b.close()
    assert hits == []
    assert "game-nav" not in shown and "stylebtn" not in shown


def test_time_trial_phone_hud_nothing_overlaps(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        start(page, "#startbtn")
        hits, shown = overlaps(page)
        b.close()
    assert hits == []
    assert {"tl", "tr", "tc>arrow", "tc>dist", "tc>cpname"} <= shown     # the trial header really is on screen
    assert "game-nav" not in shown and "stylebtn" not in shown


PHONES = [(390, 844), (360, 640), (844, 390), (640, 360)]   # tall and short, portrait and landscape
GEOMETRY = """() => {
  const box = s => { const e = document.querySelector(s), b = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return cs.display === 'none' || cs.visibility === 'hidden' || !b.width ? null : [b.left, b.top, b.right, b.bottom]; };
  const e = document.getElementById('tE'); e.hidden = false; e.textContent = 'E';   // the context button shows at a door; it has to fit too
  const out = {}; for (const s of ['#tStick', '#tG', '#tB', '#tH', '#tMenu', '#tE', '#tl', '#tr', '#br', '#pausebtn', '#radiobtn', '#speedplate'])
    out[s] = box(s);
  return { out, dial: document.getElementById('kmh').textContent, plate: document.getElementById('kmhplate').textContent,
    speedo: getComputedStyle(document.getElementById('speedo')).display, mapEvents: getComputedStyle(document.getElementById('map')).pointerEvents,
    map: document.getElementById('map').getBoundingClientRect().toJSON() };
}"""


@pytest.mark.parametrize("width,height", PHONES)
def test_phone_controls_sit_in_the_corners_and_nothing_overlaps(server, width, height):
    """#1181: stick and gas/brake in the bottom corners, a number plate instead of the dial, a 140x70 map top right."""
    with sync_playwright() as p:
        b, page = open_phone(p, server, width, height)
        start(page, "#startbtn")
        page.evaluate("() => window.__mm.place(1810, 610, 0)")   # drive a little so the number is not just 0
        hits, shown = overlaps(page)
        g = page.evaluate(GEOMETRY)
        page.keyboard.down("Tab")
        page.wait_for_function("() => document.getElementById('br').classList.contains('full')", timeout=T)
        page.keyboard.up("Tab")
        b.close()
    boxes = g["out"]
    assert hits == []
    assert {"tl", "tr", "tc>arrow", "tc>dist", "br", "pausebtn", "radiobtn", "speedplate"} <= shown
    for name, box in boxes.items():
        assert box, name
        assert box[0] >= 0 and box[1] >= 0 and box[2] <= width and box[3] <= height, (name, box)
    assert height - boxes["#tStick"][3] <= 24 + 34 and height - boxes["#tG"][3] <= 24 + 34, boxes   # 16 px + room for a safe-area inset
    assert boxes["#tStick"][0] <= 24 + 59 and width - boxes["#tG"][2] <= 24 + 59, boxes
    assert g["speedo"] == "none" and g["plate"] == g["dial"], g
    assert 138 <= g["map"]["width"] <= 142 and 68 <= g["map"]["height"] <= 72, g["map"]
    assert g["mapEvents"] == "auto"
    # the centre of the screen stays free for the road (Review Focus 2); the checkpoint arrow of #tc is the guidance, not a panel
    cx0, cx1, cy0, cy1 = (.25, .75, .35, .70) if height > width else (.30, .70, .30, .75)
    centre = (cx0 * width, cy0 * height, cx1 * width, cy1 * height)
    for name, box in boxes.items():
        assert not (box[0] < centre[2] and centre[0] < box[2] and box[1] < centre[3] and centre[1] < box[3]), (name, box, centre)
    names = list(boxes)
    for i, a in enumerate(names):
        for c in names[i + 1:]:
            assert not (boxes[a][0] < boxes[c][2] and boxes[c][0] < boxes[a][2] and boxes[a][1] < boxes[c][3] and boxes[c][1] < boxes[a][3]), (a, c, boxes[a], boxes[c])


def test_desktop_keeps_the_dial_and_has_no_touch_controls(server):
    """#1181: only phones change -- on a fine pointer at 1280x720 the dial shows, the plate and the controls do not."""
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 1280, "height": 720}, locale="de-CH").new_page()
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function(READY, timeout=240000)
        start(page, "#startbtn")
        d = page.evaluate("""() => Object.fromEntries(['speedo', 'speedplate', 'touch'].map(id => [id, getComputedStyle(document.getElementById(id)).display]))""")
        b.close()
    assert d["speedo"] != "none" and d["speedplate"] == "none" and d["touch"] == "none", d


def test_time_trial_phone_hud_long_names_still_clear(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        start(page, "#startbtn")
        page.evaluate("""() => { document.getElementById('cpname').textContent = 'CHECKPOINT 5 · BAHNHOF BAD SÄCKINGEN';
          document.getElementById('modetext').textContent = 'ZEITFAHREN · HOCHRHEIN'; document.getElementById('best').textContent = 'Bestzeit 12:34.5';
          document.getElementById('dist').textContent = '12.8 km'; }""")
        hits, _ = overlaps(page)
        b.close()
    assert hits == []


def test_phone_pause_switches_style(server):
    """#stylebtn is hidden on a phone and there is no T key, so the pause dialog has to carry the style switch."""
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        start(page, "#cruisebtn")
        page.click("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        shown = page.evaluate("() => getComputedStyle(document.getElementById('pausestyle')).display")
        before = page.text_content("#pausestyle")
        page.click("#pausestyle")
        page.wait_for_function("() => document.getElementById('pausestyle').textContent === 'Stil: Glatt'", timeout=T)
        after = page.text_content("#pausestyle")
        b.close()
    assert shown != "none"
    assert (before, after) == ("Stil: Original", "Stil: Glatt")


def test_tablet_has_the_style_switch_in_pause_only(server):
    """#773: #stylebtn is gone on every device; the pause dialog carries the switch everywhere."""
    with sync_playwright() as p:
        b, page = open_phone(p, server, width=900, height=600)
        start(page, "#cruisebtn")
        gone = page.evaluate("() => document.getElementById('stylebtn') === null")
        page.click("#pausebtn")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        pausestyle = page.evaluate("() => getComputedStyle(document.getElementById('pausestyle')).display")
        b.close()
    assert gone
    assert pausestyle != "none"


def test_start_screen_keeps_footer_hidden(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        nav = page.evaluate("() => getComputedStyle(document.getElementById('game-nav')).display")
        b.close()
    assert nav == "none"    # start dialog: already so before #776
