"""#14 engine and horn sound. Two levels: the synth voices from sound.js rendered in an OfflineAudioContext (no game
loaded, fast), and the game's SFX wiring read through window.__mm.audio() (hand layout, like test_vehicles.py).
The ears are the real gate: see test-todo.md."""
from playwright.sync_api import sync_playwright

from test_vehicles import ARGS, MMH_ROUTE, use_vehicle, wait_frames

RENDER_JS = """async () => {
  const m = await import('/prototype/sound.js'), SR = 44100;
  const rms = (d, a, b) => { let s = 0; const i0 = Math.round(a * SR), i1 = Math.round(b * SR); for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / (i1 - i0)); };
  const peak = d => d.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
  const render = async (secs, build) => { const oc = new OfflineAudioContext(1, Math.round(SR * secs), SR); build(oc); return (await oc.startRendering()).getChannelData(0); };
  const horn = { notes: [415, 523], dur: 0.9, gain: 0.22, band: 1400, wave: 'square' };
  const h = await render(1.2, oc => m.playHorn(oc, oc.destination, horn, 0));
  const engine = { cylinders: 4, idleRpm: 850, shiftRpm: 6200, limitRpm: 6800, topKmh: 330,
    harmonics: [{ mul: 0.5, gain: 0.35, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.5, detune: 6 }, { mul: 3, gain: 0.22, detune: -5 }, { mul: 4, gain: 0.1, detune: 9 }],
    filter: { idle: 450, open: 2600, offLoad: 0.55, q: 1.6 }, gain: { idle: 0.06, rev: 0.06, load: 0.1 }, shiftTime: 0.15, shiftDip: 0.6, nitroHiss: 0.07 };
  const eng = async (s, input) => { const d = await render(1, oc => { const n = m.buildEngine(oc, oc.destination, engine); m.applyEngine(n, m.engineMix(s, input, engine), 0); }); return { rms: rms(d, 0.4, 1), peak: peak(d) }; };
  const rd = await render(1.5, oc => { const r = m.buildRotor(oc, oc.destination); m.applyRotor(r, m.rotorMix({ kmh: 50, fly: true }), 0); });
  return { horn: { body: rms(h, 0.05, 0.8), tail: rms(h, 0.8, 0.85), after: rms(h, 0.95, 1.2), peak: peak(h) },
    idle: await eng({ rpm: 850, gear: 0, shift: 0 }, { kmh: 0 }), load: await eng({ rpm: 5000, gear: 2, shift: 0 }, { kmh: 70, gas: 1 }),
    fly: await eng({ rpm: 5000, gear: 2, shift: 0 }, { kmh: 70, gas: 1, fly: true }), rotor: { rms: rms(rd, 0.8, 1.5), peak: peak(rd) } };
}"""


def test_voices_render_offline(server):
    """The old horn (two sawtooths at 0.12, decaying to 0.001 in 0.45 s) measured RMS 0.018 over 0.05-0.45 s. The new
    one holds: at least 5x that over 0.05-0.8 s, still sounding at 0.8-0.85 s, silent after 0.95 s, never clipping.
    The engine is clearly louder under load than at idle, silent in flight; the rotor is audible."""
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page()
        page.goto(f"{server}/prototype/tests/")
        r = page.evaluate(RENDER_JS)
        b.close()
    h = r["horn"]
    assert h["body"] > 5 * 0.018, h
    assert h["tail"] > 0.05, h
    assert h["after"] < 1e-3, h
    assert h["peak"] <= 1.0, h
    assert r["load"]["rms"] > 2 * r["idle"]["rms"] > 0, r
    assert r["load"]["peak"] < 1.0, r
    assert r["fly"]["rms"] == 0, r
    assert r["rotor"]["rms"] > 0.02 and r["rotor"]["peak"] < 1.0, r
