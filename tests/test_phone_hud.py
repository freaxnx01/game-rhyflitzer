"""#776: on a 390x844 touch phone nothing in the driving HUD overlaps the map, the speedometer or another plate,
in cruise and in the time trial; the footer and the style button are not shown while driving.
Slow (Playwright): run in the foreground."""
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
  const out = ['tl', 'tr', 'compass', 'bl', 'br', 'pausebtn', 'stylebtn', 'game-nav', 'radiobtn', 'radiopanel']
    .map(id => box(id, byId(id)));
  for (const c of byId('tc').children) if (c.id !== 'toast' && c.id !== 'blink') out.push(box('tc>' + (c.id || c.tagName), c));
  for (const b of byId('touch').querySelectorAll('button')) out.push(box('touch>' + b.id, b));
  return out.filter(Boolean);
}"""


def open_phone(p, server):
    b = p.chromium.launch(args=ARGS)
    # has_touch without is_mobile, like tests/test_pause.py: index.html has no <meta name="viewport">, so mobile
    # emulation would lay the page out at 980 CSS px and no phone media query would fire at all.
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, locale="de-CH")
    page = ctx.new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page


def intersect(a, b):
    return a[1] < b[3] and b[1] < a[3] and a[2] < b[4] and b[2] < a[4]


def overlaps(page):
    boxes = page.evaluate(RECTS_JS)
    return [(a[0], b[0]) for a, b in combinations(boxes, 2) if intersect(a, b)], {x[0] for x in boxes}


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


def test_start_screen_keeps_footer_hidden(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        nav = page.evaluate("() => getComputedStyle(document.getElementById('game-nav')).display")
        b.close()
    assert nav == "none"    # start dialog: already so before #776
