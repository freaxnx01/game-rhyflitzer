"""#104 crash sound: the synthesized voice (rendered offline, so the test can measure it) and the game's call sites.
Hand-traced layout (world + terrain blocked), so no data files are needed. Never click Start before a `sim` call:
once the race runs, the game loop steps the car too."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# Smile-Kreisel island = (1206.5, -127), radius 9.5; 1236.5 is 30 m east of it, the approach test_vehicles.py uses
ISLAND_APPROACH = (1236.5, -127)


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
