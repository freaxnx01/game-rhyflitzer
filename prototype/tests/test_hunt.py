"""#108: the surprise hunt. Hand-traced layout (world + terrain blocked): deterministic and fast.
Slow (Playwright): run in the foreground under a memory cap."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.hunt && document.querySelector('#worldstatus')?.textContent"
T = 120000


def open_page(p, server, locale="en-US", osm=False, init=None):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale=locale).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    if init:
        page.add_init_script(init)
    if not osm:
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def collect(page, k):
    """Teleport onto spot k and let a few frames run."""
    page.evaluate("(k) => { const [x, z] = window.__mm.hunt().spots[k]; window.__mm.place(x, z); }", k)
    page.wait_for_function(f"() => window.__mm.hunt().found > {k}", timeout=T)


def test_hunt_button_starts_a_hunt_with_five_spots(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        assert page.text_content("#huntbtn") == "Surprise hunt"
        page.click("#huntbtn")
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "hunt" and h["total"] == 5 and h["found"] == 0
        assert h["boxesVisible"] == 5 and not h["cpsVisible"]
        assert "Find the 5 presents" in page.text_content("#toast")
        assert page.text_content("#tl .mode") == "Surprise hunt · Hochrhein"
        assert errors == []
        b.close()


def test_spots_differ_by_seed_and_sit_on_roads(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("window.__mm.startHunt(1)"); a = page.evaluate("window.__mm.hunt().spots")
        page.evaluate("window.__mm.startHunt(2)"); c = page.evaluate("window.__mm.hunt().spots")
        assert a != c
        for x, z, _y in a:
            page.evaluate("([x, z]) => window.__mm.place(x, z)", [x, z])
            assert page.evaluate("window.__mm.roadDist()") < 1
        b.close()


def test_collecting_all_five_ends_with_a_result_and_a_best(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("localStorage.removeItem('mm.huntBest')")
        page.evaluate("window.__mm.startHunt(3)")
        kinds = []
        for k in range(5):
            collect(page, k)
            assert page.text_content("#toast").startswith(f"Present {k + 1}/5")
            kinds.append(page.text_content("#toast").split("/5", 1)[1])   # the surprise line, without "Present n/5"
        assert len(set(kinds[:4])) == 4
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        assert "All presents found!" in page.text_content("#result") or "New record!" in page.text_content("#result")
        assert page.text_content("#huntbtn") == "Retry" and page.text_content("#startbtn") == "Start"
        assert page.evaluate("localStorage.getItem('mm.huntBest')") is not None
        assert errors == []
        b.close()


def test_a_box_is_not_collected_from_30_m_away(server):
    """The flying and height rules are unit-tested in presents.test.mjs (canCollect); here only the wiring."""
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("window.__mm.startHunt(4)")
        page.evaluate("() => { const [x, z] = window.__mm.hunt().spots[0]; window.__mm.place(x + 30, z); }")
        page.wait_for_timeout(300)
        assert page.evaluate("window.__mm.hunt().found") == 0
        b.close()


def test_surprises_change_the_car(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("window.__mm.startHunt(5)")
        page.evaluate("window.__mm.surprise('moon')")
        assert page.evaluate("window.__mm.hunt().gravity") == 0.35
        page.evaluate("window.__mm.surprise('repair')")
        assert page.evaluate("window.__mm.hunt().dmg") == 0
        page.evaluate("window.__mm.surprise('turbo')")
        assert page.evaluate("window.__mm.hunt().timers.turbo") > 5
        page.keyboard.press("Escape")  # pause freezes the timers
        t1 = page.evaluate("window.__mm.hunt().timers.turbo"); page.wait_for_timeout(500)
        assert page.evaluate("window.__mm.hunt().timers.turbo") == t1
        page.keyboard.press("Escape")
        page.evaluate("window.__mm.surprise('hop')")
        page.wait_for_function("() => { const c = window.__mm.car(); return c.y > c.ground + 0.3; }", timeout=T)
        b.close()


def test_pause_restart_starts_a_new_hunt(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.click("#huntbtn")
        page.keyboard.press("Escape"); page.click("#pauserestart")
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "hunt" and h["found"] == 0 and h["total"] == 5
        b.close()


def test_german_labels_survive_a_language_switch(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server, locale="de-CH")
        page.evaluate("localStorage.removeItem('gg-lang')")
        page.click("#huntbtn")
        assert page.text_content("#tl .mode") == "Überraschungsjagd · Hochrhein"
        page.wait_for_function("() => document.querySelector('#cpname').textContent === 'Nächstes Geschenk'", timeout=T)
        page.evaluate("window.ggSetLang('en')")
        assert page.text_content("#tl .mode") == "Surprise hunt · Hochrhein"
        page.wait_for_function("() => document.querySelector('#cpname').textContent === 'Nearest present'", timeout=T)
        b.close()


def test_trial_is_unchanged(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.click("#startbtn")
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "trial" and h["cpsVisible"] and h["boxesVisible"] == 0
        assert page.text_content("#tl .mode") == "Time trial · Hochrhein"
        b.close()


def test_osm_layout_boxes_sit_on_the_road_never_on_a_deck(server):
    """The served OSM world: every box stands on the road the car drives on (not on a bridge deck above it), for many seeds."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, osm=True)
        bad = page.evaluate("""() => { const out = []; let n = 0;
            for (let seed = 1; seed <= 300; seed++) { window.__mm.startHunt(seed); const h = window.__mm.hunt(); n += h.total;
              if (h.total !== 5) out.push([seed, 'total', h.total]);
              for (const [x, z, y] of h.spots) { const road = window.__mm.ground(x, z, -Infinity); if (Math.abs(y - road) > 0.5) out.push([seed, x, z, y, road]); } }
            return { n, out }; }""")
        assert bad["n"] == 1500
        assert bad["out"] == []
        assert errors == []
        b.close()


def test_main_menu_after_a_hunt_is_the_time_trial_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("window.__mm.startHunt(3)")
        collect(page, 0)
        assert page.evaluate("window.__mm.hunt().confetti")
        page.keyboard.press("Escape"); page.click("#pausemenu")
        if page.is_visible("#abandon"):
            page.click("#abandonok")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "trial" and h["total"] == 0 and h["boxesVisible"] == 0 and not h["confetti"]
        assert page.text_content("#tl .mode") == "Time trial · Hochrhein"
        assert "checkpoints" in page.text_content("#tl .cps")
        assert errors == []
        b.close()


def test_a_time_trial_started_right_after_a_pickup_shows_no_confetti(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("window.__mm.startHunt(3)")
        collect(page, 0)
        assert page.evaluate("window.__mm.hunt().confetti")
        page.evaluate("document.querySelector('#startbtn').click()")   # straight into a trial, while the cloud still flies
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "trial" and not h["confetti"]
        page.wait_for_timeout(300)
        assert not page.evaluate("window.__mm.hunt().confetti")
        assert errors == []
        b.close()


def test_a_hunt_with_fewer_spots_counts_to_its_own_total(server):
    """pickPresentSpots returns what exists when five cannot be found; the HUD's total and pips follow it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("""() => { window.__mm.startHunt(1); const c = window.__mm.car();
            window.__mm.startHunt(1, [[c.x + 300, c.z], [c.x - 300, c.z], [c.x, c.z + 300]]); }""")
        assert page.evaluate("window.__mm.hunt().total") == 3
        assert " ".join(page.text_content("#tl .cps").split()) == "0 / 3 presents"
        assert page.evaluate("document.querySelectorAll('#pips div').length") == 3
        for k in range(3):
            collect(page, k)
        assert " ".join(page.text_content("#tl .cps").split()) == "3 / 3 presents"
        assert page.evaluate("document.querySelectorAll('#pips div.on').length") == 3
        page.evaluate("document.querySelector('#startbtn').click()")
        assert " ".join(page.text_content("#tl .cps").split()) == "0 / 5 checkpoints"
        assert page.evaluate("document.querySelectorAll('#pips div').length") == 5
        assert errors == []
        b.close()


def test_a_corrupt_stored_hunt_best_is_ignored(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, init="localStorage.setItem('mm.huntBest', 'garbage')")
        page.evaluate("window.__mm.startHunt(3)")
        assert page.evaluate("window.__mm.hunt().best") is None
        assert "NaN" not in page.text_content("#best")
        for k in range(5):
            collect(page, k)
        best = page.evaluate("window.__mm.hunt().best")
        assert isinstance(best, (int, float)) and best >= 0
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        assert "NaN" not in page.text_content("#result")
        assert errors == []
        b.close()


def test_the_arrow_and_target_clear_once_every_present_is_found(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("window.__mm.startHunt(3)")
        page.wait_for_function("() => document.querySelector('#cpname').textContent === 'Nearest present'", timeout=T)
        assert page.evaluate("getComputedStyle(document.querySelector('#arrow')).visibility") == "visible"
        for k in range(5):
            collect(page, k)
        page.wait_for_function("""() => getComputedStyle(document.querySelector('#arrow')).visibility === 'hidden'
            && document.querySelector('#dist').textContent === '' && document.querySelector('#cpname').textContent === ''""", timeout=T)
        page.evaluate("document.querySelector('#startbtn').click()")   # the next run brings the arrow back
        page.wait_for_function("() => getComputedStyle(document.querySelector('#arrow')).visibility === 'visible' && document.querySelector('#dist').textContent !== ''", timeout=T)
        assert errors == []
        b.close()
