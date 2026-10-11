"""#105: damage rises with impact strength; at 100 % the wheels fall off, the engine smokes, the car is dead and 3 s later a new
car stands on the last road position; the race clock runs on. Hand-traced layout. Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
CRASH = "() => window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, [])"      # island at x 1217.4: strength 0.397 -> 11.9 % damage


def open_hand(p, server, start=False):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 640, "height": 360}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    if start:
        page.click("#startbtn", timeout=T)
    return b, page, errors


def dmg(page):
    return page.evaluate("() => window.__mm.damage()")


def wait_frames(page, n=5):
    f = page.evaluate("() => window.__mm.pause().frame")
    page.wait_for_function(f"() => window.__mm.pause().frame >= {f + n}", timeout=T)


def test_a_hit_costs_damage_by_strength_and_a_slow_bump_is_free(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate(CRASH)
        hard = dmg(page)["dmg"]
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate("() => window.__mm.sim(1219, -127, Math.PI, 2.9, 1, [])")     # 1.6 m short of the island, under 3 m/s on arrival
        soft = dmg(page)["dmg"]
        b.close()
    assert hard == pytest.approx(0.119, abs=0.01), hard
    assert soft == 0, soft
    assert not errors, errors


def test_contact_is_charged_once_not_every_frame(server):
    """Gas held into the island for 4 s: one hard hit, then pressing against it (under 3 m/s) must cost nothing more."""
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate("() => window.__mm.sim(1236.5, -127, Math.PI, 15, 4, ['KeyW'])")
        held = dmg(page)["dmg"]
        b.close()
    assert held < 0.35, held      # one hit of strength ~0.9 is 0.27; 240 steps of the old per-step formula would have wrecked it


def test_heavier_vehicle_takes_less(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0)")
        page.evaluate(CRASH)
        light = dmg(page)["dmg"]
        page.evaluate("() => { const c = window.__mm.vehicles().compact; c.mass = 8; window.__mm.setVehicle(c); window.__mm.setDamage(0); }")
        page.evaluate(CRASH)
        heavy = dmg(page)["dmg"]
        b.close()
    assert heavy == pytest.approx(light / 8, rel=0.1), (light, heavy)


SEQUENCE = """() => {
  const m = window.__mm;
  m.setDamage(0.95);
  const safe = [...m.damage().safe];
  m.sim(1236.5, -127, Math.PI, 15, 1.6, []);
  const hit = m.damage();
  m.wreckSim(1.5);
  const mid = m.damage(), car = m.car();
  const ground = mid.wheels.map((w) => m.ground(w.x, w.z, w.y));
  const speedAfter = m.sim(1836, -292, 0, 0, 2.5, ['KeyW']).speed;      // gas held on the straight: a wreck does not drive
  m.wreckSim(1.6);                                                     // 3.1 s in all: the new car
  return { safe, hit, speedAfter, mid, car, ground, end: m.damage(), carEnd: m.car() };
}"""


def test_wreck_sequence(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        r = page.evaluate(SEQUENCE)
        b.close()
    assert r["hit"]["wrecked"] and r["hit"]["dmg"] == 1 and r["hit"]["wheelsOff"] == 4, r["hit"]
    assert r["speedAfter"] < 1.0, r["speedAfter"]
    assert r["mid"]["smoke"] > 0, r["mid"]
    for w, ground in zip(r["mid"]["wheels"], r["ground"]):
        assert w["y"] >= ground - 0.01, (w, ground)          # never below the ground
    assert max(abs(w["x"] - r["car"]["x"]) + abs(w["z"] - r["car"]["z"]) for w in r["mid"]["wheels"]) > 2, "the wheels flew off the car"
    assert not r["end"]["wrecked"] and r["end"]["dmg"] == 0 and r["end"]["wheelsOff"] == 0, r["end"]
    assert (r["carEnd"]["x"], r["carEnd"]["z"]) == pytest.approx(tuple(r["safe"][:2]), abs=0.5), (r["carEnd"], r["safe"])
    assert not errors, errors


def test_f_is_ignored_during_a_wreck(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server, start=True)       # F only works once the start screen is gone
        page.evaluate("() => window.__mm.setDamage(1)")
        assert dmg(page)["wrecked"]
        page.keyboard.press("KeyF")
        flying = page.evaluate("() => window.__mm.fly().on")
        b.close()
    assert flying is False


def test_r_ends_a_wreck_at_once(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(1)")
        page.keyboard.press("KeyR")
        d = dmg(page)
        b.close()
    assert not d["wrecked"] and d["dmg"] == 0 and d["wheelsOff"] == 0, d


def test_r_without_a_wreck_keeps_the_damage(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0.4)")
        page.keyboard.press("KeyR")
        d = dmg(page)
        b.close()
    assert d["dmg"] == pytest.approx(0.4, abs=0.001), d


def test_changing_the_vehicle_during_a_wreck_ends_it_cleanly(server):
    """The pause menu's Change vehicle rebuilds the car (buildCar): the detached wheels must not be left behind in the scene."""
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(1)")
        page.evaluate("() => { const c = window.__mm.vehicles().delorean; window.__mm.setVehicle(c); }")
        d = dmg(page)
        b.close()
    assert not d["wrecked"] and d["wheelsOff"] == 0 and d["dmg"] == 0, d
    assert not errors, errors


def test_the_race_clock_runs_through_a_wreck_and_a_pause_freezes_it(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server, start=True)
        page.keyboard.down("Space")
        page.wait_for_function("() => window.__mm.pause().state === 'racing' && window.__mm.pause().t > 0.3", timeout=T)
        page.evaluate("() => window.__mm.setDamage(1)")
        t0 = page.evaluate("() => window.__mm.pause().t")
        wait_frames(page, 10)
        t1 = page.evaluate("() => window.__mm.pause().t")
        assert t1 > t0, (t0, t1)
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is False
        page.keyboard.press("Escape")
        page.keyboard.up("Space")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        w0 = dmg(page)
        wait_frames(page, 10)
        w1 = dmg(page)
        b.close()
    assert w0["t"] == w1["t"] and w0["wheels"] == w1["wheels"], "countdown and wheels freeze while paused"


def test_hud_shows_the_damage(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        page.evaluate("() => window.__mm.setDamage(0.8)")
        wait_frames(page, 3)
        pct = page.text_content("#dmgpct")
        crit = page.evaluate("() => document.querySelector('#dmg').classList.contains('crit')")
        b.close()
    assert "80" in pct, pct
    assert crit


def test_wreck_and_respawn_leave_gpu_memory_flat(server):
    with sync_playwright() as p:
        b, page, _ = open_hand(p, server)
        before = page.evaluate("() => window.__mm.gpu()")
        for _ in range(2):
            page.evaluate("() => { window.__mm.setDamage(1); window.__mm.wreckSim(3.2); }")
        after = page.evaluate("() => window.__mm.gpu()")
        b.close()
    assert after == before, (before, after)
