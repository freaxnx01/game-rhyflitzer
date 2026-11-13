# Radio Argovia (#845) Implementation Plan

**Goal:** a third live station, `argovia`, on the car radio; key 6 cycles fm -> srf3 -> argovia.
**Architecture:** one `LIVE` table in `radio.js` (url, display key, fail key); the single live voice in `index.html` plays whichever live station is selected. Spec: `docs/superpowers/specs/2026-11-11-radio-argovia-design.md`.

**Global constraints:** buildless, no new files or packages. Keep the internal names `els.srf`, `playing.srf`, `src.srf`, `srfVerdict`, `SRF_TIMEOUT` (spec A3). Run only `node --test tests/radio.test.mjs tests/strings.test.mjs` and the Argovia Playwright test(s) from Task 3 plus `tests/test_hermetic_api.py` (targeted, not the full suite). Foreground, no `run_in_background`. `tests/test_radio.py` is also edited by #856: append, do not rewrite existing tests.

## Task 1: radio.js (pure rules), tests first

**Files:** `tests/radio.test.mjs`, `radio.js`

- [ ] **Step 1: write the failing tests.** In `tests/radio.test.mjs` add `ARGOVIA_URL, LIVE, nextStation` to the import from `../radio.js`, change the two existing `deepEqual(STATIONS, ['fm', 'srf3'])` to `['fm', 'srf3', 'argovia']`, and append:

```js
test('ARGOVIA_URL_IsTheProbedHttpsStream', () => {
  assert.equal(ARGOVIA_URL, 'https://stream.streambase.ch/argovia/mp3-192/direct/');
  assert.equal(LIVE.argovia.url, ARGOVIA_URL);
  assert.equal(LIVE.srf3.url, SRF3_URL);
});

test('LIVE_HasExactlyTheLiveStations_WithStringKeys', () => {
  assert.deepEqual(Object.keys(LIVE), STATIONS.filter(s => s !== 'fm'));
  for (const l of Object.values(LIVE)) assert.ok(l.url.startsWith('https://') && l.nameKey && l.failKey);
});

test('nextStation_CyclesFmSrf3ArgoviaFm', () => {
  assert.equal(nextStation('fm'), 'srf3');
  assert.equal(nextStation('srf3'), 'argovia');
  assert.equal(nextStation('argovia'), 'fm');
});

test('stationFrom_AStoredArgovia_Survives', () => {
  assert.equal(stationFrom('argovia'), 'argovia');
  assert.equal(stationFrom('Argovia'), 'fm');
});

test('displayFor_Argovia_IsTheStationString', () => {
  assert.deepEqual(displayFor({ on: true, station: 'argovia', track: 0 }), { key: 'radioStationArgovia', args: [] });
});
```

- [ ] **Step 2: run, see them fail** (`node --test tests/radio.test.mjs`).
- [ ] **Step 3: implement in `radio.js`.** Replace the `STATIONS` line (after the `SRF3_URL` line) with:

```js
// NOT the short https://stream.streambase.ch/argovia/mp3-192/ -- only this /direct/ URL was probed (302 to chmedia.streamabc.net, CORS * on both hops, 2026-11-10)
export const ARGOVIA_URL = 'https://stream.streambase.ch/argovia/mp3-192/direct/';
export const STATIONS = Object.freeze(['fm', 'srf3', 'argovia']);
// the live stations: stream, the strings.js key of the radio display, the key of the "not reachable" toast. fm is not live
export const LIVE = Object.freeze({
  srf3: Object.freeze({ url: SRF3_URL, nameKey: 'radioStationSrf', failKey: 'radioSrfFail' }),
  argovia: Object.freeze({ url: ARGOVIA_URL, nameKey: 'radioStationArgovia', failKey: 'radioArgoviaFail' }),
});
export const nextStation = (s) => STATIONS[(STATIONS.indexOf(s) + 1) % STATIONS.length];
```

and in `displayFor` replace the line `if (s.station === 'srf3') return { key: 'radioStationSrf', args: [] };` with:

```js
  if (LIVE[s.station]) return { key: LIVE[s.station].nameKey, args: [] };
```

Also update the header comment (`Rhyflitzer FM, SRF 3 live`) to name Radio Argovia.
- [ ] **Step 4: run `node --test tests/radio.test.mjs`**, all green (SRF 3 tests unchanged).
- [ ] **Step 5: commit** `feat(audio): Radio Argovia station rules (#845)`.

## Task 2: strings

**Files:** `tests/strings.test.mjs`, `strings.js`, `index.html:472`, `index.html:700`

- [ ] **Step 1: failing test.** In `tests/strings.test.mjs`, in the credits test add `assert.match(translate(lang, 'creditArgovia'), /Radio Argovia/);` after the `creditSrf3` line, and in the radio display test append:

```js
  assert.equal(translate('en', 'radioStationArgovia'), 'Radio Argovia');
  assert.equal(translate('de', 'radioStationArgovia'), 'Radio Argovia');
  assert.match(translate('de', 'radioArgoviaFail'), /Argovia.*Rhyflitzer FM/);
  assert.match(translate('en', 'keyRadioStation'), /Argovia/);
```

- [ ] **Step 2: run, fail.**
- [ ] **Step 3: `strings.js`**, both languages, next to the SRF 3 keys (`radioStationSrf` ~368/1039, `radioSrfFail` ~372/1043, `keyRadioStation` ~376/1047, `creditSrf3` ~430/1101):
  - en: `radioStationArgovia: 'Radio Argovia',` / `radioArgoviaFail: 'Radio Argovia is not reachable – back to Rhyflitzer FM',` / `keyRadioStation: 'radio station: Rhyflitzer FM · SRF 3 live · Radio Argovia',` / `creditArgovia: 'Radio Argovia: the live stream of Radio Argovia, played unchanged',`
  - de: `radioStationArgovia: 'Radio Argovia',` / `radioArgoviaFail: 'Radio Argovia ist nicht erreichbar – zurück zu Rhyflitzer FM',` / `keyRadioStation: 'Radiosender: Rhyflitzer FM · SRF 3 live · Radio Argovia',` / `creditArgovia: 'Radio Argovia: der Livestream von Radio Argovia, unverändert abgespielt',`
  - `index.html:472`: fallback text of `keyRadioStation` span gets ` · Radio Argovia`.
  - `index.html:700`: add `<small data-i18n="creditArgovia"></small>` right after the `creditSrf3` small (grep `creditSrf3` in that line).
- [ ] **Step 4: run `node --test tests/strings.test.mjs`**, green. Commit `feat(audio): Radio Argovia strings and credit (#845)`.

## Task 3: RADIO in index.html, hermetic aborts, browser test

**Files:** `index.html` (import line 895, RADIO IIFE ~4126-4205), `tests/hermetic_api.py`, `tests/test_hermetic_api.py`, `tests/test_radio.py`

- [ ] **Step 1: failing tests.**
  - `tests/test_hermetic_api.py`: in `test_every_context_aborts_the_srf_stream` add `for g in hermetic_api.ARGOVIA_GLOBS: assert g in calls`; also add `(g, hermetic_api.abort_srf) for g in hermetic_api.ARGOVIA_GLOBS` to the `ROUTED` list (line 12) if that list is asserted against the routed calls (read the test first and mirror what it does for `SRF_GLOB`).
  - `tests/test_radio.py`, append (reuse `open_game`, `start_run`, `radio`, `T`, `STUB_MP3`):

```python
ARGOVIA = "https://stream.streambase.ch/argovia/mp3-192/direct/"


def stub_url(page, url, hits):
    def answer(route):
        hits.append(route.request.url)
        route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Content-Type": "audio/mpeg"}, body=STUB_MP3)
    page.route(url, answer)


def test_key_6_cycles_through_argovia(server):
    with sync_playwright() as p:
        hits = []
        b, page, errors, music = open_game(p, server, srf_hits=[])
        stub_url(page, ARGOVIA, hits)
        start_run(page)
        page.keyboard.press("6")                        # srf3
        page.wait_for_function("() => window.__mm.radio().station === 'srf3' && window.__mm.radio().playing.srf", timeout=T)
        page.keyboard.press("6")                        # argovia: the one live voice reloads with the new stream
        page.wait_for_function("() => window.__mm.radio().station === 'argovia' && window.__mm.radio().playing.srf", timeout=T)
        assert radio(page)["src"]["srf"] == ARGOVIA and hits, (radio(page), hits)
        assert "Radio Argovia" in page.evaluate("() => window.__mm.toast().text")
        assert page.evaluate("() => localStorage.getItem('mm.radioStation')") == "argovia"
        page.keyboard.press("6")                        # back to FM
        page.wait_for_function("() => window.__mm.radio().station === 'fm' && window.__mm.radio().playing.fm && !window.__mm.radio().playing.srf", timeout=T)
        assert errors == [], errors
        b.close()


def test_argovia_failure_falls_back_to_rhyflitzer_fm(server):
    with sync_playwright() as p:
        b, page, errors, music = open_game(p, server)   # no stub: hermetic_api aborts the stream
        page.evaluate("() => localStorage.setItem('mm.radioStation', 'argovia')")
        page.reload()
        page.wait_for_function("() => window.__mm && window.__mm.radio && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        start_run(page)
        page.wait_for_function("() => window.__mm.radio().failed === 1 && window.__mm.radio().station === 'fm'", timeout=T)
        assert "Argovia" in page.evaluate("() => window.__mm.toast().text")
        assert errors == [], errors
        b.close()
```

  If the 2nd test's reload proves flaky, set the localStorage via `page.add_init_script` before `goto` instead; do not weaken the assertions.
- [ ] **Step 2: `tests/hermetic_api.py`:** after `SRF_GLOB` add `ARGOVIA_GLOBS = ("https://stream.streambase.ch/**", "https://*.streamabc.net/**")   # #845: Radio Argovia and its redirect target`; in `route_srf` loop `for glob in (SRF_GLOB, *ARGOVIA_GLOBS): context.route(glob, abort_srf)`; mention #845 in the module docstring.
- [ ] **Step 3: `index.html` import (line 895):** replace `SRF3_URL` with `LIVE, nextStation`.
- [ ] **Step 4: RADIO IIFE edits:**
  - Header comment: `or SRF 3 live` -> `or a live station (SRF 3, Radio Argovia)`.
  - Replace `playSrf` with (the one live voice serves every live station; a station change reloads it):

```js
  function playLive() { stopSrf(); const v = voice('srf'); v.el.src = LIVE[S.station].url; level(v, trackGain(S.vol)); watch = { station: S.station, since: now(), playing: false, waitingSince: null, error: false }; start(v); }
```

  - In `apply()` replace the SRF line with:

```js
    if (radio && LIVE[S.station]) { if (!watch || watch.station !== S.station) playLive(); else level(els.srf, trackGain(S.vol)); } else stopSrf();
```

  - `fail()`: `function fail() {   // a live station did not start or stalled: ...` and use the key before resetting: `const failKey = LIVE[S.station].failKey; stopSrf(); S.station = 'fm'; S.failed++; save(RADIO_STORE.station, 'fm'); apply(); radioShow('📻 ' + tr(failKey));`
  - `cmd`: `if (action === 'station') { S.station = nextStation(S.station); S.on = true; ...` (rest of the line unchanged).
  - `SFX.onHold` comment: `SRF 3 reloads` -> `a live station reloads`. Leave `srfVerdict`/`els.srf`/state keys as they are; add one comment on `const els`: `els.srf is the one live voice (SRF 3, Radio Argovia)`.
- [ ] **Step 5: verify.** `node --test tests/radio.test.mjs tests/strings.test.mjs`; `python3 -m pytest tests/test_hermetic_api.py -q`; then only the SRF and Argovia browser tests: `python3 -m pytest tests/test_radio.py -k "srf3 or argovia or pause" -q` (foreground, generous timeout). Existing SRF 3 tests must stay green.
- [ ] **Step 6: CHANGELOG** under `## [Unreleased]` / `### Added` (create the heading if missing), newest first, stamped with `TZ=Europe/Zurich date '+%F %H:%M'`:
  `- \`<timestamp>\` **Radio Argovia** is a third station on the car radio: press <kbd>6</kbd> to cycle Rhyflitzer FM, SRF 3 and Radio Argovia.`
- [ ] **Step 7: commit** `feat(audio): Radio Argovia on the car radio (#845)`; open the PR with `Closes #845`.
