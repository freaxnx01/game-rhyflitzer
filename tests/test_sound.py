"""#14 engine and horn sound. Two levels: the synth voices from sound.js rendered in an OfflineAudioContext (no game
loaded, fast), and the game's SFX wiring read through window.__mm.audio() (hand layout, like test_vehicles.py).
The ears are the real gate: see test-todo.md."""
from playwright.sync_api import sync_playwright

from test_vehicles import ARGS, MMH_ROUTE, use_vehicle, wait_frames

RENDER_JS = """async () => {
  const m = await import('/sound.js'), SR = 44100;
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
  // #1130: a steady top-gear cruise -- gas held, flat, 220 km/h -- must not render as one frozen tone. The drift walks
  // on with a seeded rng, one applyEngine per 50 ms block
  const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const cv = (xs) => { const mean = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) / mean; };
  const SOUND = { gears: [0, 20, 45, 75, 110, 150, 999], engine, horn };
  const CRUISE = { kmh: 220, gas: 1, nitro: 0, air: 0, fly: false, accel: 0, climb: 0 }, BLOCK = 0.05, BLOCKS = 80, SPAN = BLOCK * BLOCKS;
  const settle = (rng) => { let s = { rpm: 0, gear: 5, shift: 0, load: 0, drift: 0 }; for (let i = 0; i < 400; i++) s = m.engineStep(s, CRUISE, SOUND, 1 / 60, rng); return s; };
  const cruise = (opts) => render(SPAN, oc => {
    const n = m.buildEngine(oc, oc.destination, engine), rng = lcg(12345);
    let s = settle(rng);
    for (let i = 0; i < BLOCKS; i++) {
      m.applyEngine(n, { ...m.engineMix(opts.drift ? s : { ...s, drift: 0 }, CRUISE, engine), ...opts.mute }, i * BLOCK);
      for (let k = 0; k < 3; k++) s = m.engineStep(s, CRUISE, SOUND, BLOCK / 3, rng);
    }
  });
  const metrics = (d) => { const w = []; for (let i = 8; i < BLOCKS; i++) w.push(rms(d, i * BLOCK, (i + 1) * BLOCK)); return { cv: cv(w), peak: peak(d), rms: w.reduce((a, b) => a + b, 0) / w.length }; };
  // The harmonics on their own, so the measurement is deterministic. Their detuned partials beat against each other even
  // when nothing moves, which swamps the drift in any level statistic -- so the drift is measured as the difference
  // between the drifting render and the standing-still one, sample by sample. Frozen, that difference is exactly zero.
  const TONE = { road: 0, hiss: 0, wind: 0, rough: 0 };
  const apart = (a, b) => { let s = 0; const i0 = Math.round(0.4 * SR), i1 = Math.round(SPAN * SR); for (let i = i0; i < i1; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / (i1 - i0)); };
  const frozen = await cruise({ drift: false, mute: TONE }), drifting = await cruise({ drift: true, mute: TONE });
  const rasping = await cruise({ drift: true, mute: { road: 0, hiss: 0, wind: 0 } });
  // the wind band on its own: the same graph with the harmonics, the tyre roll and the hiss muted
  const windOnly = async (kmh) => { const d = await render(1, oc => { const n = m.buildEngine(oc, oc.destination, engine); const mix = m.engineMix({ rpm: 6200, gear: 5, shift: 0, load: 0.5, drift: 0 }, { kmh, gas: 1 }, engine); m.applyEngine(n, { ...mix, gain: 0, road: 0, hiss: 0 }, 0); }); return rms(d, 0.4, 1); };
  // #709: a Postauto heard across the field. distantMix leaves mix.rough alone (the rasp plays behind out.gain), so
  // only a render proves it really fades with the distance factor: the preset's harmonics are silenced and the tyre
  // roll and the wind muted, leaving the rasp as the only thing through the lowpass.
  const rasper = { ...engine, harmonics: [{ mul: 1, gain: 0, detune: 0 }] };
  const raspAt = async (gain) => { const d = await render(1, oc => { const n = m.buildEngine(oc, oc.destination, rasper); const mix = m.engineMix({ rpm: 1800, gear: 1, shift: 0, load: 0.5, drift: 0 }, { kmh: 60, gas: 1, nitro: 1 }, rasper); m.applyEngine(n, { ...m.distantMix(mix, gain), road: 0, wind: 0 }, 0); }); return rms(d, 0.4, 1); };
  return { horn: { body: rms(h, 0.05, 0.8), tail: rms(h, 0.8, 0.85), after: rms(h, 0.95, 1.2), peak: peak(h) },
    idle: await eng({ rpm: 850, gear: 0, shift: 0, load: 0 }, { kmh: 0 }), load: await eng({ rpm: 5000, gear: 2, shift: 0, load: 1 }, { kmh: 70, gas: 1 }),
    fly: await eng({ rpm: 5000, gear: 2, shift: 0, load: 1 }, { kmh: 70, gas: 1, fly: true }), rotor: { rms: rms(rd, 0.8, 1.5), peak: peak(rd) },
    cruise: metrics(await cruise({ drift: true, mute: {} })),
    frozen: metrics(frozen), rasping: metrics(rasping),
    drifting: { ...metrics(drifting), apart: apart(drifting, frozen) / metrics(frozen).rms, same: apart(frozen, frozen) },
    wind: { at50: await windOnly(50), at200: await windOnly(200), at30: await windOnly(30) },
    rasp: { near: await raspAt(1), far: await raspAt(0.25) } };
}"""


def test_voices_render_offline(server):
    """The old horn (two sawtooths at 0.12, decaying to 0.001 in 0.45 s) measured RMS 0.018 over 0.05-0.45 s. The new
    one holds: at least 5x that over 0.05-0.8 s, still sounding at 0.8-0.85 s, silent after 0.95 s, never clipping.
    The engine is clearly louder under load than at idle, silent in flight; the rotor is audible.
    #1130: at a steady top-gear cruise the voice keeps moving. The whole-voice coefficient of variation is the issue's
    acceptance figure, but on its own it proves little -- the detuned partials beat against each other, so even the old
    frozen voice measured ~0.097. The harmonics alone, rendered deterministically, are the real gate: the drift lifts
    their coefficient of variation well above the standing-still baseline, the rasp adds audible energy on top, and the
    wind band is silent below 40 km/h and far louder at 200 km/h than at 50.
    #709: a Postauto's rasp fades with its distance factor (distantMix), like its tyre roll and its wind."""
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page()
        page.goto(f"{server}/tests/")
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
    assert r["cruise"]["cv"] > 0.02, r["cruise"]
    assert r["cruise"]["peak"] < 1.0, r["cruise"]
    assert r["drifting"]["same"] == 0, r["drifting"]
    assert r["drifting"]["apart"] > 0.3, (r["drifting"], r["frozen"])
    assert r["rasping"]["rms"] > 1.02 * r["drifting"]["rms"], (r["rasping"], r["drifting"])
    assert r["wind"]["at30"] == 0, r["wind"]
    assert r["wind"]["at200"] > 4 * r["wind"]["at50"] > 0, r["wind"]
    assert r["rasp"]["near"] > 0.001, r["rasp"]
    assert 0.2 < r["rasp"]["far"] / r["rasp"]["near"] < 0.3, r["rasp"]


def open_sound(p, server):
    """The hand layout with autoplay allowed, Start clicked (that creates the AudioContext and the engine voices)."""
    b = p.chromium.launch(args=ARGS + ["--autoplay-policy=no-user-gesture-required"]); page = b.new_page(viewport={"width": 320, "height": 180})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.audio && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    page.wait_for_function("() => window.__mm.audio().ctx === 'running'", timeout=60000)
    return b, page


def test_engine_follows_the_car_and_nitro(server):
    """72 km/h coasting: 3rd gear, rpm heads for 6200 * 72 / 75; holding N adds the hiss. #1130: coasting is no load at
    all and the wind already rushes past at 72 km/h; holding W puts the engine past its cruising load, which it can only
    do if the loop really hands sound.js the car's acceleration."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        page.evaluate("() => window.__mm.sim(1882.9, -292.2, Math.PI, 20, 0.02, [])"); wait_frames(page, 3)
        coast = page.evaluate("() => window.__mm.audio()")
        page.keyboard.down("KeyN"); wait_frames(page, 3)
        nitro = page.evaluate("() => window.__mm.audio()")
        page.keyboard.up("KeyN")
        page.keyboard.down("KeyW"); wait_frames(page, 20)
        pulling = page.evaluate("() => window.__mm.audio()")
        page.keyboard.up("KeyW")
        b.close()
    assert coast["gear"] == 2, coast
    assert coast["mix"]["hiss"] == 0 and coast["mix"]["road"] > 0, coast
    assert coast["mix"]["load"] == 0, coast
    assert coast["mix"]["wind"] > 0, coast
    assert nitro["mix"]["hiss"] > 0, nitro
    assert pulling["mix"]["load"] > 0.55, pulling
    assert pulling["mix"]["rough"] > coast["mix"]["rough"], (pulling, coast)


BUS_VOICES_JS = """() => {
  const near = { key: 't-near', kmh: 50, gain: 1 }, far = { key: 't-far', kmh: 50, gain: 0.25 };
  let heard = null;
  for (let i = 0; i < 30; i++) heard = window.__mm.sfxBuses([near, far], 1 / 60);   // both voices spin up from idle through the same steps
  const left = window.__mm.sfxBuses([near], 1 / 60).map((v) => v.key);
  const by = (key) => heard.find((v) => v.key === key);
  return { near: by('t-near'), far: by('t-far'), freed: !left.includes('t-far') };
}"""


def test_a_distant_postauto_fades_in_every_band(server):
    """#709 / #1130: SFX.busEngines() runs one voice per audible Postauto, each through distantMix with its distance
    factor. Two buses at the same speed, one at full gain and one at a quarter: the engine level, the tyre roll and the
    wind are all a quarter, and so is the audible rasp -- mix.rough stays put, but it plays behind out.gain, so what
    comes out of the far bus is gain * rough. Each voice runs its own #1130 drift, which wanders their levels a few
    percent apart, so only the drift-free bands compare exactly. A voice that drops out of the list is freed."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        r = page.evaluate(BUS_VOICES_JS)
        b.close()
    near, far = r["near"], r["far"]
    assert near["gain"] > 0 and near["road"] > 0 and near["wind"] > 0 and near["rough"] > 0, near
    assert abs(far["wind"] - near["wind"] * 0.25) < 1e-12, (near, far)   # the wind does not drift: exactly a quarter
    assert 0.22 < far["gain"] / near["gain"] < 0.28, (near, far)
    assert 0.21 < far["road"] / near["road"] < 0.29, (near, far)         # the drift moves the tyre roll four times as much
    assert far["hiss"] == 0 and near["hiss"] == 0, (near, far)
    assert far["rough"] == near["rough"], (near, far)                    # the share itself is left alone -- it plays behind out.gain
    assert 0.22 < (far["gain"] * far["rough"]) / (near["gain"] * near["rough"]) < 0.28, (near, far)   # so what is heard of it fades too
    assert r["freed"], r


def test_hidden_tab_and_hold_suspend_the_sound(server):
    """A hidden tab suspends the AudioContext and a visible one resumes it; a second hold (#83's pause menu) keeps it
    suspended until both are released. The horn does nothing while held."""
    hide = "(h) => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        page.evaluate(f"({hide})(true)")
        page.wait_for_function("() => window.__mm.audio().ctx === 'suspended'", timeout=30000)
        page.evaluate("() => window.__mm.sfxHold('menu', true)")
        page.evaluate(f"({hide})(false)"); page.wait_for_timeout(300)
        still = page.evaluate("() => window.__mm.audio()")
        page.evaluate("() => window.__mm.sfxHold('menu', false)")
        page.wait_for_function("() => window.__mm.audio().ctx === 'running'", timeout=30000)
        b.close()
    assert still["ctx"] == "suspended" and still["holds"] == ["menu"], still


def test_vehicle_swap_rebuilds_the_engine_voices(server):
    """A preset with a three-cylinder engine and other harmonics is accepted and heard: the firing frequency follows it."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        use_vehicle(page, "c.sound.engine.cylinders = 3; c.sound.engine.harmonics = [{ mul: 1, gain: 1, detune: 0 }]")
        wait_frames(page, 3)
        got = page.evaluate("() => window.__mm.audio()")
        bad = page.evaluate("() => { const c = window.__mm.vehicles().compact; c.sound.horn.notes = []; try { window.__mm.setVehicle(c); return 'no error'; } catch (e) { return e.message; } }")
        b.close()
    assert abs(got["mix"]["f0"] - got["rpm"] / 60 * 1.5) < 1e-6, got
    assert "horn.notes" in bad, bad


def test_flying_mutes_the_engine_and_plays_the_rotor(server):
    """#10: F lifts off; in flight the engine, road noise and hiss are silent and the rotor plays; F again lands."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        page.keyboard.press("KeyF"); wait_frames(page, 3)
        fly = page.evaluate("() => window.__mm.audio()")
        page.keyboard.press("KeyF"); wait_frames(page, 3)
        ground = page.evaluate("() => window.__mm.audio()")
        b.close()
    assert fly["mix"]["gain"] == 0 and fly["mix"]["road"] == 0 and fly["mix"]["hiss"] == 0, fly
    assert fly["rotor"]["gain"] > 0, fly
    assert ground["mix"]["gain"] > 0 and ground["rotor"]["gain"] == 0, ground


def test_getting_out_switches_the_engine_off_and_getting_in_on_again(server):
    """#475: Z gets out of the car and the engine falls silent; Z again gets back in and it runs."""
    with sync_playwright() as p:
        b, page = open_sound(p, server)
        page.keyboard.press("KeyZ"); page.wait_for_function("() => window.__mm.foot().on", timeout=60000); wait_frames(page, 3)
        out = page.evaluate("() => window.__mm.audio()")
        page.keyboard.press("KeyZ"); page.wait_for_function("() => !window.__mm.foot().on", timeout=60000); wait_frames(page, 3)
        back = page.evaluate("() => window.__mm.audio()")
        b.close()
    assert out["mix"]["gain"] == 0 and out["mix"]["hiss"] == 0, out
    assert back["mix"]["gain"] > 0, back
