"""#241: the Holzbrücke follows its S-shaped line, stands on six piers and carries three chapels."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

pytestmark = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def bridge_line():
    """The bridge's OSM line, from the Stein (eastern) end."""
    w = json.loads(WORLD.read_text(encoding="utf-8")); hb = w["anchors"]["landmarks"]["holzbruecke"]
    road = min((r for r in w["roads"] if r.get("bridge")), key=lambda r: min(math.dist((hb["x"], hb["z"]), p) for p in r["pts"]))
    return road["pts"] if road["pts"][0][0] >= road["pts"][-1][0] else road["pts"][::-1]


def at(pts, t, s=0.0):
    """([x, z], heading) at arc length t along pts, s metres to one side of the line."""
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if acc + seg >= t or b is pts[-1]:
            u = (t - acc) / seg; ux, uz = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
            return [a[0] + (b[0] - a[0]) * u + uz * s, a[1] + (b[1] - a[1]) * u - ux * s], math.atan2(uz, ux)
        acc += seg


@pytest.fixture(scope="module")
def bridge(server):
    pts = bridge_line(); length = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    inside = [(t, s) for t in range(10, int(length) - 9, 5) for s in (-2.2, 2.2)]
    outside = [(t, s) for t in range(60, 141, 10) for s in (-4.5, 4.5)]
    starts = [(t, *at(pts, t)) for t in (5, 40, 70, 120)]
    msgs = []
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.on("pageerror", lambda e: msgs.append((str(e), "")))
        page.on("console", lambda m: msgs.append((m.text, m.location.get("url", ""))) if m.type in ("error", "warning") else None)
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        counts = page.evaluate("() => window.__mm.counts.holzbruecke || null")
        feet = page.evaluate("() => ((window.__mm.counts.holzbruecke || {}).pierFeet || []).map(f => ({ ...f, bed: window.__mm.bed(f.x, f.z) }))")
        ground = lambda ps: page.evaluate(f"() => {json.dumps([at(pts, t, s)[0] for t, s in ps])}.map(([x, z]) => window.__mm.ground(x, z, 1e4))")
        g_in, g_out = ground(inside), ground(outside)
        runs = [(t, [x, z], page.evaluate(f"() => window.__mm.sim({x}, {z}, {th}, 15, 3)")) for t, (x, z), th in starts]
        br.close()
    # own-page messages only, as in test_smoke.load: the terrain 404 is on purpose, third-party resources are not under test
    own = [t for t, u in msgs if "terrain_hochrhein.mmh" not in u and (not u or u.startswith(server))]
    return {"counts": counts, "feet": feet, "inside": list(zip(inside, g_in)), "outside": list(zip(outside, g_out)), "runs": runs, "msgs": own}


def assert_piers_reach_the_bed(feet, n):
    """Playtest 2026-10-11, under water: "nicht alle Pfeiler gehen in den Flussboden rein". Every pier's base lies at least a metre
    under the drawn terrain beneath the bridge (window.__mm.bed(...).drawn, the riverbed mesh seen from above; the water lookup there
    is None because the deck is in the way)."""
    assert len(feet) == n, feet
    for f in feet:
        assert f["bed"]["drawn"] is not None and f["base"] < f["bed"]["drawn"] - 1, f


def test_every_pier_is_sunk_into_the_riverbed(bridge):
    assert_piers_reach_the_bed(bridge["feet"], 6)


def test_six_piers_three_chapels_and_a_frame_every_five_metres(bridge):
    assert bridge["counts"] is not None, "window.__mm.counts.holzbruecke is not set"
    assert bridge["counts"]["piers"] == 6
    assert bridge["counts"]["chapels"] == 3
    assert bridge["counts"]["frames"] >= 40


def test_deck_follows_the_line(bridge):
    """2.2 m either side of the line is deck all the way; 4.5 m either side over the Rhine is water, so the deck is not just wider."""
    holes = [(ts, g) for ts, g in bridge["inside"] if g <= -1]
    widened = [(ts, g) for ts, g in bridge["outside"] if g >= -1]
    assert holes == [], holes
    assert widened == [], widened


def test_car_crosses_every_bend(bridge):
    """Started on the line at 15 m/s with the gas held, the car runs through the bends at 32, 56, 82 and 141 m without stopping on a
    rail joint and without ending in the Rhine."""
    for t, start, r in bridge["runs"]:
        assert r["y"] > -1, (t, r)                                          # not in the river
        assert math.dist(start, (r["x"], r["z"])) > 35 and r["speed"] > 10, (t, r)   # kept going


def test_no_console_errors(bridge):
    assert bridge["msgs"] == []


def test_border_lines_are_always_shown_at_102_and_110_2_metres_from_saeckingen(server):
    """#396: the old (white) and the new (yellow) CH/DE border are painted across the deck, visible with the G boundaries off."""
    pts = bridge_line(); length = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        lines = page.evaluate("() => (window.__mm.borderLines || []).map(l => ({ kind: l.kind, t: l.t, visible: l.mesh.visible, color: l.mesh.material.color.getHex(), inScene: !!l.mesh.parent }))")
        br.close()
    by = {l["kind"]: l for l in lines}
    assert set(by) == {"old", "new"}, lines
    assert by["old"]["color"] == 0xffffff and by["new"]["color"] == 0xffd400
    assert all(l["visible"] and l["inScene"] for l in lines)
    assert abs((length - by["old"]["t"]) - 102) < 0.01 and abs((length - by["new"]["t"]) - 110.2) < 0.01


# ---- #396: the info popup on the two border lines ----
POPUP_VIEW = {"width": 1280, "height": 720}
READY_396 = "() => window.__mm && window.__mm.sim && window.__mm.borderPick && document.querySelector('#worldstatus')?.textContent"
T = 120000


def open_on_the_bridge(p, server, touch=False):
    """The game started, the car standing on the deck 20 m before the old line (Stein side), facing Säckingen, chase camera settled."""
    pts = bridge_line(); length = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    (x, z), th = at(pts, length - 102 - 20)
    br = p.chromium.launch(args=ARGS); page = br.new_context(viewport=POPUP_VIEW, has_touch=touch).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY_396, timeout=180000)
    page.click("#startbtn")
    page.evaluate(f"() => window.__mm.place({x}, {z}, {th})")
    settle_camera(page)
    return br, page, errors


def wait_frames(page, n=2):
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def settle_camera(page):
    """The chase camera glides after a placement; the pick uses the camera of the moment, so wait until it stands still."""
    last = None
    for _ in range(40):
        wait_frames(page, 3)
        d = page.evaluate("() => window.__mm.cam().d")
        if last is not None and math.dist(last, d) < 0.02:
            return
        last = d
    raise AssertionError(f"the camera did not settle: {d}")


def screen_point(page, want):
    """A screen point whose pick is `want` ('old' / 'new' a border line, None ground that beams), the middle of the hit run on its row."""
    found = page.evaluate("""(want) => { const rows = {}; for (let y = 40; y < innerHeight - 40; y += 6) for (let x = 20; x < innerWidth - 20; x += 6) {
        const line = window.__mm.borderPick(x, y); if (want ? line === want : (line === null && window.__mm.beamPick(x, y))) (rows[y] = rows[y] || []).push(x); }
      const ys = Object.keys(rows).map(Number); if (!ys.length) return null; const y = ys[ys.length >> 1], xs = rows[y]; return [xs[xs.length >> 1], y]; }""", want)
    assert found is not None, f"no screen point picks {want!r}"
    return found


def test_double_click_on_a_border_line_opens_the_popup_and_does_not_beam(server):
    with sync_playwright() as p:
        br, page, errors = open_on_the_bridge(p, server)
        before = page.evaluate("() => window.__mm.car()")
        x, y = screen_point(page, "new")
        page.mouse.dblclick(x, y)
        page.wait_for_function("() => window.__mm.borderInfo().open", timeout=T)
        opened = page.evaluate("() => ({ ...window.__mm.borderInfo(), beam: window.__mm.beam(), pause: window.__mm.pause().on, keys: window.__mm.keysDown(), "
                               "sel: [...document.querySelectorAll('#borderinfo .bline.sel')].map(e => e.dataset.kind), title: document.querySelector('#borderinfotitle').textContent, "
                               "links: [...document.querySelectorAll('#borderinfosrc a')].map(a => [a.target, a.rel]), text: document.querySelector('#borderinfotext').textContent })")
        after = page.evaluate("() => window.__mm.car()")
        page.keyboard.press("Space")                                    # a game key while open: swallowed, the popup stays
        still = page.evaluate("() => window.__mm.borderInfo().open")
        page.evaluate("() => window.ggSetLang('de')")
        de_title = page.evaluate("() => document.querySelector('#borderinfotitle').textContent")
        page.evaluate("() => window.ggSetLang('en')")
        page.keyboard.press("Escape")
        closed = page.evaluate("() => ({ ...window.__mm.borderInfo(), hidden: document.querySelector('#borderinfo').hidden, pause: window.__mm.pause().on })")
        # the other line, closed with the ✕
        x2, y2 = screen_point(page, "old")
        page.mouse.dblclick(x2, y2)
        page.wait_for_function("() => window.__mm.borderInfo().open", timeout=T)
        old = page.evaluate("() => ({ ...window.__mm.borderInfo(), sel: [...document.querySelectorAll('#borderinfo .bline.sel')].map(e => e.dataset.kind) })")
        page.click("#borderinfox")
        closed_x = page.evaluate("() => window.__mm.borderInfo().open")
        # elsewhere on the ground: the beam, as before, no popup
        gx, gy = screen_point(page, None)
        page.mouse.dblclick(gx, gy)
        page.wait_for_function("() => window.__mm.beam() !== null", timeout=T)
        beamed = page.evaluate("() => ({ beam: window.__mm.beam(), open: window.__mm.borderInfo().open })")
        br.close()
    assert opened["open"] and opened["line"] == "new" and opened["sel"] == ["new"], opened
    assert opened["beam"] is None and opened["pause"] is False and opened["keys"] == []
    assert math.dist((before["x"], before["z"]), (after["x"], after["z"])) < 0.01
    assert opened["title"] == "National border on the Holzbrücke" and "consultation 2025." in opened["text"]
    assert opened["links"] == [["_blank", "noopener"]] * 3
    assert still is True
    assert de_title == "Landesgrenze auf der Holzbrücke"
    assert closed["open"] is False and closed["hidden"] is True and closed["pause"] is False
    assert old["line"] == "old" and old["sel"] == ["old"]
    assert closed_x is False
    assert beamed["beam"] is not None and beamed["open"] is False
    assert errors == []


def test_double_tap_on_a_border_line_opens_the_popup(server):
    with sync_playwright() as p:
        br, page, errors = open_on_the_bridge(p, server, touch=True)
        x, y = screen_point(page, "old")
        page.touchscreen.tap(x, y)
        page.touchscreen.tap(x, y)
        page.wait_for_function("() => window.__mm.borderInfo().open", timeout=T)
        state = page.evaluate("() => ({ ...window.__mm.borderInfo(), beam: window.__mm.beam() })")
        page.mouse.click(8, 8)                                          # the backdrop: outside the box
        closed = page.evaluate("() => window.__mm.borderInfo().open")
        br.close()
    assert state["line"] == "old" and state["beam"] is None, state
    assert closed is False
    assert errors == []
