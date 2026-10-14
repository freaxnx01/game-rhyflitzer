# Region editor Umami stats (#197) Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-14-editor-umami-stats-design.md` (assumptions A1-A9). Buildless, vanilla ES modules, no new packages.

**Goal:** count which Gemeinden players frame and build in the region editor via the shared self-hosted Umami, with coarse geo only, and tell players in de + en.

**Architecture:** new pure module `editor/analytics.js`; `editor/api.js` `parsePreview` keeps `gemeinden`; `editor/editor.js` calls it at five points; one script tag in `editor/index.html`; privacy strings + README section.

**Constraints:** targeted tests only (node tests + `prototype/tests/test_editor.py` in the foreground, never `run_in_background`); tests never hit the real Umami; do not touch `prototype/index.html`, `prototype/world.js`, `pipeline/world_water.py`, `prototype/tests/test_world.py` (running #319 work). Real umlauts in German, capitalised Du/Dein. Conventional Commits, PR to main.

## File structure

- Create `editor/analytics.js`
- Create `prototype/tests/editor-analytics.test.mjs`
- Modify `editor/api.js` (`parsePreview`), `prototype/tests/editor-api.test.mjs`
- Modify `editor/editor.js`, `editor/index.html`, `editor/strings.js`
- Modify `prototype/tests/test_editor.py`
- Modify `README.md`, `CHANGELOG.md`

---

### Task 1: `parsePreview` keeps `gemeinden`

**Files:** `editor/api.js`, `prototype/tests/editor-api.test.mjs:80-81`

- [ ] **Step 1: Write the failing test.** Replace the two deepEqual lines (80, 81) so the expected objects include `gemeinden`, and add hostile cases:

```js
  assert.deepEqual(parsePreview({ id: ID, exists: false, name: 'Ehrendingen', gemeinden: ['Ehrendingen'], raceOk: false }), { name: 'Ehrendingen', raceOk: false, id: ID, exists: false, gemeinden: ['Ehrendingen'] });
  assert.deepEqual(parsePreview({ id: ID, exists: true, name: null, gemeinden: [], raceOk: true, reason: 'x' }), { name: null, raceOk: true, id: ID, exists: true, gemeinden: [] });
  assert.deepEqual(parsePreview({ gemeinden: ['A', 7, null, 'B'] }).gemeinden, ['A', 'B']);   // only strings survive
  assert.deepEqual(parsePreview({ gemeinden: 'A' }).gemeinden, []);
  assert.deepEqual(parsePreview(null).gemeinden, []);
```

- [ ] **Step 2:** `node --test prototype/tests/editor-api.test.mjs` -> FAIL (no `gemeinden`).
- [ ] **Step 3: Implement** in `editor/api.js`, extend `parsePreview` (add `gemeinden` to the shape comment above it):

```js
export const parsePreview = (json) => ({ name: str(json && json.name), raceOk: json && typeof json.raceOk === 'boolean' ? json.raceOk : null,
  id: json && isWorldId(json.id) ? json.id : null, exists: !!json && json.exists === true && isWorldId(json.id),
  gemeinden: json && Array.isArray(json.gemeinden) ? json.gemeinden.filter((g) => typeof g === 'string') : [] });
```

- [ ] **Step 4:** same command -> PASS. Commit `feat(editor): keep the preview's Gemeinde list (#197)`.

### Task 2: `editor/analytics.js` (TDD)

**Files:** create `editor/analytics.js`, `prototype/tests/editor-analytics.test.mjs`

- [ ] **Step 1: Write the failing test** `prototype/tests/editor-analytics.test.mjs`:

```js
// #197: what the region editor tells Umami. Pure; node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameData, track, trackPageview, createPreviewReporter, MAX_NAMES, MAX_TEXT } from '../../editor/analytics.js';

const EHR = [2667000, 1259750, 2669000, 1261750];

test('frameData: names, a 0.05 degree centre cell and the size, nothing else', () => {
  const d = frameData(EHR, ['Ehrendingen', 'Freienwil']);
  assert.deepEqual(Object.keys(d).sort(), ['gemeinden', 'h_km', 'lat', 'lon', 'w_km']);
  assert.equal(d.gemeinden, 'Ehrendingen, Freienwil');
  assert.equal(d.w_km, 2); assert.equal(d.h_km, 2);
  assert.ok(Math.abs(d.lat * 20 - Math.round(d.lat * 20)) < 1e-9, 'lat is a multiple of 0.05');
  assert.ok(Math.abs(d.lon * 20 - Math.round(d.lon * 20)) < 1e-9, 'lon is a multiple of 0.05');
  assert.ok(d.lat > 47 && d.lat < 48 && d.lon > 8 && d.lon < 9);
});

test('frameData: no LV95 digits leak, and a frame nudged within one cell reports the same cell', () => {
  const a = frameData([2667000, 1259750, 2669000, 1261750], ['X']), b = frameData([2667250, 1259750, 2669250, 1261750], ['X']);
  assert.deepEqual(a, b);
  assert.doesNotMatch(JSON.stringify(a), /26[67]\d{4}|12[56]\d{4}/);
});

test('frameData: at most MAX_NAMES names and MAX_TEXT characters; non-strings and blanks dropped', () => {
  assert.equal(frameData(EHR, ['a', 'b', 'c', 'd', 'e', 'f']).gemeinden.split(', ').length, MAX_NAMES);
  assert.ok(frameData(EHR, ['x'.repeat(500)]).gemeinden.length <= MAX_TEXT);
  assert.equal(frameData(EHR, ['A', 7, '', null, ' ']).gemeinden, 'A');
  assert.equal(frameData(EHR, []).gemeinden, '');
  assert.equal(frameData(EHR, undefined).gemeinden, '');
});

test('track and trackPageview: no-op without umami, swallow a throwing umami, pass name and data through', () => {
  delete globalThis.umami;
  assert.doesNotThrow(() => { track('x', { a: 1 }); trackPageview(); });
  globalThis.umami = { track: () => { throw new Error('boom'); } };
  assert.doesNotThrow(() => { track('x'); trackPageview(); });
  const calls = []; globalThis.umami = { track: (...a) => calls.push(a) };
  track('editor-build-start', { cached: false });
  assert.deepEqual(calls[0], ['editor-build-start', { cached: false }]);
  globalThis.location = { pathname: '/game-rhyflitzer/editor/', search: '?bbox=1,2,3,4' };
  trackPageview();
  assert.deepEqual(calls[1][0]({ website: 'w', url: '/game-rhyflitzer/editor/?bbox=1,2,3,4', title: 'T' }), { website: 'w', url: '/game-rhyflitzer/editor/', title: 'T' });
  delete globalThis.umami; delete globalThis.location;
});

function fakeTimers() {
  const pending = new Map(); let id = 0;
  return { setTimer: (fn) => { pending.set(++id, fn); return id; }, clearTimer: (i) => pending.delete(i),
    fire: () => { const fns = [...pending.values()]; pending.clear(); fns.forEach((f) => f()); }, count: () => pending.size };
}

test('preview reporter: sends only after the delay, replaces a pending frame, once per Gemeinde set, capped', () => {
  const sent = [], t = fakeTimers();
  const r = createPreviewReporter({ send: (n, d) => sent.push([n, d]), delayMs: 3000, max: 2, setTimer: t.setTimer, clearTimer: t.clearTimer });
  r.frame({ gemeinden: 'A' }); r.frame({ gemeinden: 'B' });   // the second replaces the first before it settled
  assert.equal(t.count(), 1); t.fire();
  assert.deepEqual(sent, [['editor-frame', { gemeinden: 'B' }]]);
  r.frame({ gemeinden: 'B' }); t.fire();   // same set again: not sent
  assert.equal(sent.length, 1);
  r.frame({ gemeinden: 'C' }); t.fire();
  r.frame({ gemeinden: 'D' }); t.fire();   // max 2 reached
  assert.deepEqual(sent.map((s) => s[1].gemeinden), ['B', 'C']);
  r.frame({ gemeinden: 'E' }); r.cancel(); assert.equal(t.count(), 0);
});

test('preview reporter: a frame without any Gemeinde is not reported', () => {
  const sent = [], t = fakeTimers();
  const r = createPreviewReporter({ send: (n, d) => sent.push(d), setTimer: t.setTimer, clearTimer: t.clearTimer });
  r.frame({ gemeinden: '' }); t.fire(); assert.deepEqual(sent, []);
});
```

- [ ] **Step 2:** `node --test prototype/tests/editor-analytics.test.mjs` -> FAIL (module missing).
- [ ] **Step 3: Implement** `editor/analytics.js`:

```js
// #197: what the region editor tells Umami (self-hosted, stats.freaxnx01.ch). Never breaks the page: blocked, offline or missing umami = silent no-op.
// Coarse by design: Gemeinde names, the frame centre rounded to 0.05 degrees, the frame size. Never the LV95 frame, the world id or anything typed.
import { centre, lv95ToWgs, sizeKm } from './geo.js';

export const MAX_NAMES = 4, MAX_TEXT = 200, CELL_DEG = 0.05, SETTLE_MS = 3000, MAX_FRAMES = 10;

const cellOf = (v) => Math.round(Math.round(v / CELL_DEG) * CELL_DEG * 100) / 100;
const cleanNames = (names) => (Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());

export function frameData(rect, gemeinden) {
  const [lat, lon] = lv95ToWgs(...centre(rect)), { w, h } = sizeKm(rect);
  return { gemeinden: cleanNames(gemeinden).slice(0, MAX_NAMES).join(', ').slice(0, MAX_TEXT), lat: cellOf(lat), lon: cellOf(lon), w_km: w, h_km: h };
}

export function track(name, data) {
  try { const u = globalThis.umami; if (u && typeof u.track === 'function') u.track(name, data); } catch (e) { /* analytics must never break the editor */ }
}

// The editor rewrites ?bbox= (the exact frame) on every commit, so the one pageview carries the path only; auto-tracking is off in index.html.
export function trackPageview() {
  try { const u = globalThis.umami; if (u && typeof u.track === 'function') u.track((props) => ({ ...props, url: globalThis.location.pathname })); } catch (e) { /* see above */ }
}

export function createPreviewReporter({ send = track, delayMs = SETTLE_MS, max = MAX_FRAMES, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const seen = new Set(); let timer = 0;
  const cancel = () => { clearTimer(timer); timer = 0; };
  function frame(data) {
    cancel();
    timer = setTimer(() => {
      timer = 0;
      if (!data.gemeinden || seen.has(data.gemeinden) || seen.size >= max) return;
      seen.add(data.gemeinden); send('editor-frame', data);
    }, delayMs);
  }
  return { frame, cancel };
}
```

- [ ] **Step 4:** same command -> PASS. Commit `feat(editor): analytics module with coarse frame data (#197)`.

### Task 3: privacy texts (strings, markup, README)

**Files:** `editor/strings.js`, `editor/index.html`, `README.md`. `prototype/tests/editor-strings.test.mjs` already guards en/de key parity (run it).

- [ ] **Step 1:** add to `en` (after `licence`):

```js
  privacy: 'Anonymous visit statistics (Umami, self-hosted in Germany): no cookies, no IP address stored. We count the place names of the frames people look at and build, the frame size and a rough position (about 5 km), never anything more precise.', privacyLink: 'Privacy',
```

and to `de`:

```js
  privacy: 'Anonyme Besuchsstatistik (Umami, selbst gehostet in Deutschland): keine Cookies, keine IP-Adresse gespeichert. Gezählt werden die Ortsnamen der Rahmen, die angeschaut und gebaut werden, die Grösse des Rahmens und eine grobe Lage (etwa 5 km), nie etwas Genaueres.', privacyLink: 'Datenschutz',
```

- [ ] **Step 2:** in `editor/index.html`, directly after the `#licence` paragraph:

```html
    <p id="privacy" class="licence"><span data-i18n="privacy"></span> <a href="https://github.com/freaxnx01/game-rhyflitzer#datenschutz--privacy" target="_blank" rel="noopener" data-i18n="privacyLink"></a></p>
```

- [ ] **Step 3:** insert in `README.md` before `## License` a `## Datenschutz / Privacy` section (anchor `#datenschutz--privacy`), German first, then English, mirroring game-tschau-sepp's README wording:
  - de: Der Region-Editor (`editor/`) zählt Besuche und mit **Umami**, wie viele Rahmen angeschaut und gebaut werden und ob der Bau fertig wurde oder fehlschlug. Umami ist selbst gehostet auf einem Server in **Deutschland** (`stats.freaxnx01.ch`). Es werden keine Cookies gesetzt und keine personenbezogenen Daten gespeichert. Pro Ereignis werden nur die Namen der Gemeinden des Rahmens, seine Grösse und die Lage seines Mittelpunkts auf etwa 5 km gerundet übermittelt, nie die genauen Koordinaten und nie die Welt-ID. Die IP-Adresse wird nicht gespeichert, sondern nur kurzzeitig für die Bestimmung von Land und Region verwendet. Browser mit „Do Not Track“ werden nicht gezählt. Wird das Skript blockiert, läuft der Editor unverändert weiter.
  - en: the same facts in English.

- [ ] **Step 4:** `node --test prototype/tests/editor-strings.test.mjs` -> PASS. Commit `docs(editor): privacy notice for the Umami stats (#197)`.

### Task 4: wire the editor (Playwright first)

**Files:** `prototype/tests/test_editor.py`, `editor/editor.js`, `editor/index.html`

- [ ] **Step 1: Test scaffolding.** In `open_page`, next to the existing `lang` init script and before `ctx.new_page()`, add the stub; and before `page.goto` add the route, so no test can reach the real Umami:

```python
    ctx.add_init_script("window.__umami = []; window.umami = { track: (a, b) => { window.__umami.push(typeof a === 'function' ? { pageview: a({ website: 'w', url: location.pathname + location.search, title: 'T' }) } : { name: a, data: b }); } };")
    page.route("**/stats.freaxnx01.ch/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=""))
```

Add helper `def umami(page): return page.evaluate("() => window.__umami")`.

- [ ] **Step 2: Write the failing tests** (append to `test_editor.py`; assert on shape, not on the magic cell numbers):

```python
def test_umami_pageview_has_no_query_and_no_event_carries_the_frame(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(post=(200, job("ready", "done"))))
        page.wait_for_timeout(3600)   # the frame settles
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'done'", timeout=20000)
        calls = umami(page); b.close()
    assert errs == []
    assert "?" not in calls[0]["pageview"]["url"], calls[0]
    assert not re.search(r"26[67]\d{4}|12[56]\d{4}|0123456789ab", json.dumps(calls)), calls   # no LV95, no world id


def test_umami_frame_event_after_the_settle_once_per_gemeinde(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api())
        page.wait_for_timeout(1000); early = [c for c in umami(page) if c.get("name") == "editor-frame"]
        page.wait_for_function("() => window.__umami.some((c) => c.name === 'editor-frame')", timeout=10000)
        page.evaluate("() => window.__ed.setRect([2667250, 1259750, 2669250, 1261750])"); page.wait_for_timeout(4000)
        frames = [c for c in umami(page) if c.get("name") == "editor-frame"]; b.close()
    assert early == [] and len(frames) == 1   # not before 3 s; the moved frame has the same Gemeinde
    assert frames[0]["data"]["gemeinden"] == "Ehrendingen" and frames[0]["data"]["w_km"] == 2


def test_umami_build_start_done_and_failed_events(server):
    ok = Api(post=(202, job("queued", position=1)), script=[(200, job("building", "terrain")), (200, job("ready", "done"))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, ok)
        page.wait_for_timeout(1500)   # the preview names the Gemeinde before Build
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'done'", timeout=30000)
        ev = {c["name"]: c["data"] for c in umami(page) if "name" in c}; b.close()
        b, page, errs = open_page(p, server, Api(post=(429, {"error": "daily-limit"})))
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'failed'", timeout=20000)
        names = [c["name"] for c in umami(page) if "name" in c]; failed = [c["data"] for c in umami(page) if c.get("name") == "editor-build-failed"]; b.close()
    assert ev["editor-build-start"]["cached"] is False and ev["editor-build-start"]["gemeinden"] == "Ehrendingen"
    assert ev["editor-build-done"]["seconds"] % 5 == 0 and ev["editor-build-done"]["race"] in ("yes", "no", "unknown")
    assert "editor-build-start" not in names and failed[0]["reason"] == "errRateLimit"   # a refused POST is a failure, not a start


@pytest.mark.parametrize("lang,word", [("en", "no cookies"), ("de", "keine Cookies")])
def test_privacy_text_and_link_in_both_languages(server, lang, word):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(), lang=lang)
        text = page.inner_text("#privacy"); href = page.get_attribute("#privacy a", "href"); b.close()
    assert word in text and "Umami" in text and href.endswith("#datenschutz--privacy")
```

- [ ] **Step 3:** `python -m pytest prototype/tests/test_editor.py -k "umami or privacy" -x` (foreground) -> FAIL.
- [ ] **Step 4: Implement.**

`editor/index.html`, before the `altcha` / `editor.js` module scripts (`g.js` must precede `editor.js` so `umami` exists when the module runs):

```html
<!-- Umami analytics (self-hosted, server in Germany). Auto-tracking is off: the editor's URL carries the exact frame (?bbox=), so the page sends a path-only pageview itself. -->
<script defer src="https://stats.freaxnx01.ch/g.js" data-website-id="35f395c0-a1ba-4706-ad56-7c95fcc0169f" data-domains="github.freaxnx01.ch" data-auto-track="false" data-do-not-track="true"></script>
```

`editor/editor.js`:

1. Import: `import { frameData, track, trackPageview, createPreviewReporter } from './analytics.js';`
2. In `S` add `gemeinden: []`; below it `const reporter = createPreviewReporter();`
3. `schedulePreview()`: also `S.gemeinden = [];`. `cancelPreview()`: also `S.gemeinden = []; reporter.cancel();`
4. `preview()`: after `S.name = name; S.race = pv.raceOk; S.exists = pv.exists;` add `S.gemeinden = pv.gemeinden.length ? pv.gemeinden : name ? [name] : []; reporter.frame(frameData(rect, S.gemeinden));`
5. Helpers next to `fail`:

```js
const facts = (extra) => ({ ...frameData(S.rect, S.gemeinden), ...extra });
const raceWord = () => (S.race === true ? 'yes' : S.race === false ? 'no' : 'unknown');
```

6. `build()`: after `if (!res.ok) return fail(...)`, before `applyJob(...)`: `reporter.cancel(); track('editor-build-start', facts({ cached: S.exists === true }));`
7. `applyJob`, in the `done` branch before `loadMeta`: `track('editor-build-done', facts({ seconds: Math.round((Date.now() - (S.startedAt || Date.now())) / 5000) * 5, race: raceWord() }));`. In `backToEdit` also set `S.startedAt = 0`.
8. `fail(key)`: first statement `track('editor-build-failed', facts({ reason: key }));`
9. Next to `applyStaticStrings(); render(); loadOutline();` add `trackPageview();`

- [ ] **Step 5:** foreground: `python -m pytest prototype/tests/test_editor.py -x` (whole editor file) -> PASS; `node --test prototype/tests/editor-analytics.test.mjs prototype/tests/editor-api.test.mjs prototype/tests/editor-strings.test.mjs` -> PASS.
- [ ] **Step 6:** commit `feat(editor): Umami stats with coarse geo (#197)`.

### Task 5: CHANGELOG

- [ ] Under `## [Unreleased]`, newest first (timestamp from `TZ=Europe/Zurich date '+%F %H:%M'` when writing):

```markdown
- `YYYY-MM-DD HH:MM` The **region editor** now counts anonymously which **places** people frame and build: Gemeinde names, the frame size and a position rounded to about 5 km, never the exact frame. No cookies, no IP address stored, and nothing changes if you block it. The **Privacy** note sits under the map.
```

- [ ] Commit `docs(changelog): editor stats (#197)`.

### Task 6: final check and PR

- [ ] Verify: `git grep -n "stats.freaxnx01.ch" -- editor` shows exactly the one tag; `git grep -n "track(" editor/editor.js` shows only `facts(...)` payloads, never `S.rect`, `bbox` or `S.job`.
- [ ] Open the PR `feat(stats): Umami stats with geo information for the region editor` ("Closes #197"), Testing section listing exactly the runs from Task 4 Step 5.
