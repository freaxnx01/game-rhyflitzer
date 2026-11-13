# Menu music while loading (#841) — plan

Goal: the menu music starts during "Building the world". Spec: `docs/superpowers/specs/2026-11-10-menu-music-during-loading-design.md`.
Buildless game: one Node unit test file plus one Playwright test. Run only `node --test tests/radio.test.mjs` and `tests/test_radio.py` (foreground, `-k menu_music`). No other browser suites.

Files: `radio.js`, `index.html`, `tests/radio.test.mjs`, `tests/test_radio.py`, `CHANGELOG.md`. No UI text, so no new strings.

## Task 1 — `createEarlyMenu` (TDD)

1. Failing tests in `tests/radio.test.mjs` (add `createEarlyMenu, EARLY_GESTURES` to the import). Fake audio and target:

```js
const fakeEl = () => ({ plays: 0, paused: false, rejects: false, play() { this.plays++; return this.rejects ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }, pause() { this.paused = true; } });
const fakeTarget = () => { const l = {}; return { l, addEventListener(t, f) { (l[t] ||= []).push(f); }, removeEventListener(t, f) { l[t] = (l[t] || []).filter(x => x !== f); }, fire(t) { (l[t] || []).slice().forEach(f => f()); } }; };

test('createEarlyMenu_MusicOff_MakesNothing', () => {
  const t = fakeTarget(); let made = 0;
  const e = createEarlyMenu({ menuOn: false, vol: 6, makeAudio: () => { made++; return fakeEl(); }, target: t });
  assert.equal(made, 0); assert.equal(e.take(), null); assert.equal(e.gestured(), false);
  assert.deepEqual(Object.keys(t.l), []);
});
test('createEarlyMenu_On_SetsUpTheMenuTrackAndTriesToPlayAtOnce', () => {
  const el = fakeEl();
  createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: fakeTarget() });
  assert.equal(el.src, MENU_TRACK.src); assert.equal(el.loop, true); assert.equal(el.preload, 'none');
  assert.equal(el.volume, Math.min(1, menuGain(6))); assert.equal(el.plays, 1);
});
test('createEarlyMenu_RefusedPlay_DoesNotThrowAndAGestureRetries', async () => {
  const el = fakeEl(), t = fakeTarget(); el.rejects = true;
  const e = createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: t });
  assert.equal(e.gestured(), false);
  for (const g of EARLY_GESTURES) assert.ok(t.l[g].length === 1, g);
  t.fire('keydown'); await Promise.resolve();
  assert.equal(el.plays, 2); assert.equal(e.gestured(), true);
});
test('createEarlyMenu_Take_HandsOverOnceAndStopsListening', () => {
  const el = fakeEl(), t = fakeTarget();
  const e = createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: t });
  assert.equal(e.take(), el); assert.equal(el.volume, 1); assert.equal(e.take(), null);
  t.fire('keydown'); assert.equal(el.plays, 1);
  for (const g of EARLY_GESTURES) assert.equal((t.l[g] || []).length, 0, g);
});
test('createEarlyMenu_Drop_PausesAnUntakenElement', () => {
  const el = fakeEl();
  const e = createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: fakeTarget() });
  e.drop(); assert.equal(el.paused, true); assert.equal(e.take(), null);
});
```

2. Implement in `radio.js` (after `menuGain`):

```js
// #841: the menu music before the world is built. RADIO and the SFX graph do not exist until loading is far along, so a bare
// element starts here (autoplay tried at once, retried on every gesture) and RADIO adopts it with take(). Pure: audio and target injected.
export const EARLY_GESTURES = Object.freeze(['pointerdown', 'pointerup', 'keydown', 'touchend']);
export function createEarlyMenu({ menuOn, vol, makeAudio, target, src = MENU_TRACK.src }) {
  let el = null, gestured = false;
  const tryPlay = () => { if (!el) return; const p = el.play(); if (p && p.catch) p.catch(() => { }); };   // a refused play() stays silent
  const onGesture = () => { gestured = true; tryPlay(); };
  const release = () => { for (const g of EARLY_GESTURES) target.removeEventListener(g, onGesture, true); const e = el; el = null; return e; };
  if (menuOn) {
    el = makeAudio(); el.preload = 'none'; el.loop = true; el.src = src; el.volume = Math.min(1, menuGain(vol));
    for (const g of EARLY_GESTURES) target.addEventListener(g, onGesture, { capture: true, passive: true });
    tryPlay();
  }
  return {
    gestured: () => gestured,
    take() { const e = release(); if (e) e.volume = 1; return e; },   // RADIO's gain node sets the level from here on
    drop() { const e = release(); if (e) e.pause(); },
  };
}
```

(`removeEventListener(g, onGesture, true)` matches `capture: true`.) Run `node --test tests/radio.test.mjs`; green.

## Task 2 — wire it into `index.html`

1. Import: add `createEarlyMenu` to the `./radio.js` import on line 853.
2. Right before `await loadStage('map');` (line 932) add:

```js
// #841: the menu music starts now, not after the world is built; RADIO adopts the element (voice('menu')) once it exists
const EARLY_MENU = (() => { const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  return createEarlyMenu({ menuOn: menuMusicOnFrom(get(RADIO_STORE.menu)), vol: volumeFrom(get(RADIO_STORE.vol)), makeAudio: () => new Audio(), target: window }); })();
```

(`RADIO_STORE` etc. are module imports, hoisted, usable before line 932.)

3. In `RADIO.voice(name)` (line ~4064) replace `el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'none';` with:

```js
const early = name === 'menu' ? EARLY_MENU.take() : null, el = early || new Audio();
if (!early) { el.crossOrigin = 'anonymous'; el.preload = 'none'; }   // #841: an adopted element keeps its same-origin src and is already playing
```

keeping `const { ac, master } = SFX.graph()` and the rest. Make sure the declaration order stays valid (`const { ac, master } = SFX.graph(), early = ..., el = ...`).

4. In `apply()` replace `else fadeOut('menu');` on the menu line with:

```js
if (!S.inRun && S.menuOn && S.menuArmed) playMenu(); else { fadeOut('menu'); if (S.inRun || !S.menuOn) EARLY_MENU.drop(); }   // #841: an element nobody adopted must not outlive the start screen
```

5. At `endLoading();` (line ~6416) after the two `addEventListener` lines, add `if (EARLY_MENU.gestured()) RADIO.armMenu();` and update the comment above them: the track now starts during loading (#841); armMenu adopts it.

## Task 3 — Playwright test

In `tests/test_radio.py` replace `test_menu_music_loads_only_after_the_first_input` (line 48; ARGS allow autoplay) with:

```python
def test_menu_music_starts_during_loading(server):
    with sync_playwright() as p:
        b, page, errors, music = open_game(p, server)
        assert any("menu-running-title.mp3" in u for u in music), music     # fetched at load start, autoplay allowed
        page.keyboard.press("Shift")
        page.wait_for_function("() => window.__mm.radio().playing.menu", timeout=T)
        page.click("#musicbtn")
        page.wait_for_function("() => !window.__mm.radio().menuOn", timeout=T)
        assert page.evaluate("() => localStorage.getItem('mm.menuMusic')") == "0"
        assert "Music: off" in page.inner_text("#musicbtn") or "Musik: aus" in page.inner_text("#musicbtn")
        assert errors == [], errors
        b.close()


def test_menu_music_off_fetches_nothing_while_loading(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script("localStorage.setItem('mm.menuMusic', '0')")
        page, music = ctx.new_page(), []
        page.on("request", lambda r: music.append(r.url) if "/assets/music/" in r.url else None)
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.radio && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.wait_for_timeout(1500)
        assert music == [], music
        b.close()
```

Also add a variant without the autoplay flag only if cheap: launch with `args=[a for a in ARGS if "autoplay" not in a]`, assert `pageerror` list empty and nothing playing before the key press, then Shift starts it (`playing.menu`). Run both with `-k menu_music`, foreground.

## Task 4 — CHANGELOG

Under `## [Unreleased]` -> `### Added`, first line (newest first), timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`; keys in `<kbd>`, 1-3 bold keywords:

```markdown
- `<timestamp>` The **menu music** now plays while the world is **loading**: it starts by itself where the browser allows it, otherwise with the first **click** or <kbd>key</kbd> press on the loading screen. Switched off, nothing changes.
```

Never `git cliff -o`.

## Done when

`node --test tests/radio.test.mjs` green, the two `test_radio.py` menu tests green, page console clean on a fresh load with autoplay blocked.
