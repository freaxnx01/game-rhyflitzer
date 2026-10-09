"""#104 crash sound: the synthesized voice (rendered offline, so the test can measure it) and the game's call sites.
Hand-traced layout (world + terrain blocked), so no data files are needed. Never click Start before a `sim` call:
once the race runs, the game loop steps the car too. Slow (Playwright): run in the foreground."""
import time

import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# Smile-Kreisel island = (1206.5, -127), radius 9.5; the car's circle is 1.3, so a head-on stop sits at x 1217.4.
# Coasting into it from 1236.5 at 15 m/s is the approach test_vehicles.py::test_table_mass_softens_the_crash uses.
HARD_HIT = "() => window.__mm.sim(1236.5, -127, Math.PI, 15, 1.6, [])"
CONTACT_X = 1217.4

# The 0.35 s cooldown runs on AudioContext.currentTime, i.e. on wall-clock time, so a pair of hits that has to land
# inside the window goes into one page.evaluate: a Playwright round trip between them can outlast the cooldown and
# the assertion then measures the harness, not the gate. These start 4.6 m / 14.6 m short of the island so one hit
# costs a tenth of a second of real time instead of a second and a half.
HIT = "m.sim(1222, -127, Math.PI, 15, 0.6, [])"            # about 14.2 m/s along the normal -- strength 0.507
HARDER = "m.sim(1232, -127, Math.PI, 30, 0.6, [])"         # 30 m/s head-on -- saturates at strength 1


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 320, "height": 180})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def use_vehicle(page, patch_js):
    """Activate a modified copy of compact; patch_js edits `c`, e.g. "delete c.sound.crash"."""
    page.evaluate(f"() => {{ const c = window.__mm.vehicles().compact; {patch_js}; window.__mm.setVehicle(c); }}")


def crashes(page):
    return page.evaluate("() => window.__mm.sfxCrashes()")


# renders playCrash for one strength into an OfflineAudioContext and measures it: RMS, peak, and when it falls silent
RENDER_JS = """async (strength) => {
  const { crashVoice, playCrash } = await import('./impact.js');
  const preset = { weight: 1, thump: 70, noise: 1800, gain: 1 };
  const ctx = new OfflineAudioContext(1, 44100, 44100);
  playCrash(ctx, ctx.destination, crashVoice(strength, preset));
  const d = (await ctx.startRendering()).getChannelData(0);
  let sum = 0, peak = 0, end = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); sum += d[i] * d[i]; if (a > peak) peak = a; if (a > 0.01) end = i / ctx.sampleRate; }
  return { rms: Math.sqrt(sum / d.length), peak, end };
}"""


def test_crash_voice_renders_louder_and_longer_as_the_impact_gets_harder(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        soft = page.evaluate(RENDER_JS, 0.1)
        hard = page.evaluate(RENDER_JS, 1)
        b.close()
    assert hard["rms"] > 3 * soft["rms"], (soft, hard)
    assert hard["end"] > soft["end"], (soft, hard)
    assert hard["end"] < 0.9, hard            # a crash is an event, not a drone
    assert hard["peak"] < 1.0, hard           # no clipping before the master gain


def test_a_wall_hit_above_the_threshold_plays_a_crash(server):
    """Coasting into the island at 15 m/s arrives with about 11.7 m/s along the normal -- strength 0.397,
    clearly a crash and not a tap, and nowhere near the saturated 1."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate(HARD_HIT)
        got = crashes(page)
        b.close()
    assert got["count"] == 1, got
    assert 0.35 < got["last"]["s"] < 0.45, got


def test_scraping_along_a_wall_stays_silent(server):
    """Rolling into the island at 2 m/s: the car reaches it (it comes to rest at the contact distance) and
    the hit is below the 3 m/s threshold, so nothing plays."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        end = page.evaluate("() => window.__mm.sim(1219, -127, Math.PI, 2, 2, [])")
        got = crashes(page)
        b.close()
    assert end["x"] == pytest.approx(CONTACT_X, abs=0.1), end   # it really touched the island
    assert got["count"] == 0, got


def test_a_car_pressed_against_a_wall_does_not_rattle(server):
    """Two separate hits of the same strength inside the cooldown are one crash, and holding the gas
    against the island for 2 s is one crash too -- not one per physics step."""
    pair = f"() => {{ const m = window.__mm; {HIT}; const first = m.sfxCrashes().count; {HIT}; return {{ first, again: m.sfxCrashes().count }}; }}"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        got = page.evaluate(pair)
        time.sleep(0.6)
        page.evaluate("() => window.__mm.sim(1236.5, -127, Math.PI, 15, 2, ['KeyW'])")
        pressed = crashes(page)["count"]
        b.close()
    assert got["first"] == 1, got
    assert got["again"] == 1, "a second hit of the same strength inside the cooldown played again"
    assert pressed == 2, "holding the gas against the wall played more than the one crash of the first contact"


def test_a_harder_hit_overrides_the_cooldown_which_then_expires(server):
    override = f"() => {{ const m = window.__mm; {HIT}; const first = m.sfxCrashes().count; {HARDER}; return {{ first, after: m.sfxCrashes() }}; }}"
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        got = page.evaluate(override)
        time.sleep(0.6)
        page.evaluate(HARD_HIT)
        expired = crashes(page)["count"]
        b.close()
    assert got["first"] == 1, got
    assert got["after"]["count"] == 2, "a clearly harder hit inside the cooldown stayed silent"
    assert got["after"]["last"]["s"] > 0.9, got
    assert expired == 3, "the cooldown never let go"


def test_a_vehicle_without_a_usable_crash_preset_is_rejected(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        for patch, want in [("delete c.sound.crash", "sound.crash"), ("c.sound.crash.thump = 0", "sound.crash.thump"),
                            ("c.sound.crash.gain = -1", "sound.crash.gain")]:
            with pytest.raises(Exception, match=want.replace(".", r"\.")):
                use_vehicle(page, patch)
        b.close()


def test_mute_silences_the_crash_and_queues_nothing(server):
    """M mutes; the same hit that plays unmuted plays nothing while muted, and unmuting does not release it late."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.press("KeyM")
        page.evaluate(HARD_HIT)
        muted = crashes(page)["count"]
        page.keyboard.press("KeyM")
        time.sleep(0.6)
        page.evaluate(HARD_HIT)
        unmuted = crashes(page)["count"]
        b.close()
    assert muted == 0, "a crash played while muted"
    assert unmuted == 1, "the same hit plays nothing unmuted either -- the mute test proves nothing"
