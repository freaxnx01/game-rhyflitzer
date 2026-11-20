# Discovery hints, part a (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure `hints.js` plus Settings › Display › Hints on/off and "Show hints again". The card is part b.

**Architecture:** `hints.js` is pure like `tutorial.js` (imports `keyCap` from it). Thin glue in `index.html`.

**Spec:** `docs/superpowers/specs/2026-11-19-discovery-hints-design.md` (#1090)

## Global Constraints

- Buildless, no deps; pure functions never mutate inputs.
- Keys: `mm.hints` = JSON `{ [id]: { shown, seen } }`; `mm.hintsOn` (`'0'` off); `mm.playTime` (Cruise s). Storage blocked → all seen.
- Every string in `strings.js` en **and** de (real umlauts).
- Targeted tests only, foreground. No CHANGELOG here (part b writes it).

## Review Focus

Corrupt `mm.hints`; place hint re-shown while still on the spot; bad `mm.playTime`; multiplayer; other region. All pinned in Task 1.

---

### Task 1: `hints.js`

**Files:** Create `hints.js`, `tests/hints.test.mjs`; modify `strings.js` (`hint<Id>`, `hintFootTouch`).

**Produces:**
```js
export const HINT_CFG = { paceS: 150, firstS: 90, stayS: 20, maxShows: 3, winkPlayS: 3600 };
export const HINTS_KEY = 'mm.hints', HINTS_ON_KEY = 'mm.hintsOn', PLAY_TIME_KEY = 'mm.playTime';
export const HINTS;  // { id, kind:'time'|'mode'|'event'|'place'|'wink', keys:[] (empty = statement), tap, touch,
                     //   touchSel, region, hideout, event, text, touchText, icon }
// plus the functions the tests import; newHintSession() = { sinceLast: Infinity, cruiseS: 0, events: [], waitLeave: [] }
// ctx = { mode, multiplayer, coarse, region, hideoutFound, near: id[], playTime }; store null = storage blocked
```

Catalogue, in order (✗ = `touch: false`, h = hold key, `tap: false`):
- time: `heli` KeyF ✗ (☰ `menu` exists, but no steering, #1091) · `jumpTo` KeyJ · `autopilot` KeyO (text names O, I) · `radio` Digit5–0 (no touch flag in `radio()`; touch tap clicks `#radiobtn` via `touchSel`) · `camera` KeyC · `nitro` KeyN ✗h · `fullMap` Tab ✗h · `photo` KeyX
- mode: `modes` Escape ("also Blitz, Delivery, Viewpoints … via the pause menu"; `#pausebtn` on touch)
- event: `foot` Space h, event `footOut` ("Space jumps, F hovers"; touch text: jump button, ☰ › Hover, since `menu('hover')` exists)
- place, region `hochrhein`: `loco` KeyZ ✗ (#1091) · `postauto`, `depot` KeyE (`#tE` on touch) · `pontoon` KeyU · statements `plattform`, `holz`, `crash`, `ostriches`, `bodenacker`
- place, `hochrhein`, `hideout: true`: `ferris` Digit3 ✗ (text names 3/4) · statement `freight`
- `wink` statement: "Im Hübel soll es etwas geben …" / "They say there's something in the Hübel …"

`pickHint`: (1) `hintScope`/`hintAllowed` filter (scope place = non-hideout place statements; touch; region; `hideout` needs `hideoutFound`). (2) unseen place hint in `near`, not in `waitLeave` → return, **ignoring pace**. (3) `sinceLast < paceS` → null. (4) unseen event hints in `sess.events`. (5) time/mode in order once `cruiseS >= firstS`. (6) wink if due.
`hintStoreAfter`: `shown + 1`; `seen` if acted/closed, a statement, or `shown >= maxShows`. `hintCap` uses `keyCap` (tutorial.js).

- [ ] **Step 1: Failing tests** `tests/hints.test.mjs` (imports: `../hints.js`, `entriesFor`, `translate`):

```js
const H = (id) => HINTS.find(h => h.id === id), eq = assert.equal;
const ctx = (o) => ({ mode: 'cruise', multiplayer: false, coarse: false, region: 'hochrhein', hideoutFound: false, near: [], playTime: 0, ...o });
const ripe = (o) => ({ ...newHintSession(), cruiseS: 1000, ...o });
const pick = (c = {}, s = ripe(), st = {}) => pickHint(st, s, ctx(c))?.id ?? null;
const after = (id, how, st = {}) => hintStoreAfter(st, H(id), how)[id];

test('HINTS_OrderTextsTouch', () => {
  eq(HINTS.find(h => h.kind === 'time').id, 'heli');
  for (const h of HINTS) for (const k of [h.text, h.touchText].filter(Boolean)) for (const l of ['en', 'de']) assert.notEqual(translate(l, k), k);
  assert.deepEqual(HINTS.filter(h => h.touch).map(h => h.id).sort(), ['autopilot', 'bodenacker', 'camera', 'crash', 'depot', 'foot', 'freight', 'holz', 'jumpTo', 'modes', 'ostriches', 'photo', 'plattform', 'pontoon', 'postauto', 'radio', 'wink']);
  for (const [id, a] of [['jumpTo', 'jump'], ['camera', 'camera'], ['autopilot', 'autopilot'], ['photo', 'photo'], ['nitro', 'nitro'], ['fullMap', 'fullMap']])
    eq(H(id).touch, !!entriesFor('car').find(e => e.action === a).touch, id);
});
test('Store_BadInputIsEmpty_BlockedSeesAll', () => {
  for (const raw of [null, '', '{', '[1]', '7', 'null']) assert.deepEqual(hintStoreFrom(raw), {});
  assert.deepEqual(hintStoreFrom('{"heli":{"shown":1,"seen":false}}'), { heli: { shown: 1, seen: false } });
  eq(hintSeen(null, 'x'), true); eq(pickHint(null, ripe(), ctx({ near: ['crash'] })), null);
  eq(hintsOnFrom(null), true); eq(hintsOnFrom('0'), false);
});
test('pickHint_Modes', () => {
  for (const m of ['trial', 'blitz', 'delivery', 'tutorial']) eq(hintScope(m, false), 'none');
  eq(pick({ multiplayer: true }), null);
  eq(pick({ mode: 'view' }), null); eq(pick({ mode: 'view', near: ['pontoon'] }), null);
  eq(pick({ mode: 'hunt', near: ['holz'] }), 'holz');
});
test('pickHint_PaceTouchRegionEventsHideout', () => {
  const busy = ripe({ sinceLast: HINT_CFG.paceS - 1 }), now = ripe({ sinceLast: 0 });
  eq(pick({}, busy), null); eq(pick({ near: ['crash'] }, busy), 'crash');
  eq(pick({}, ripe({ sinceLast: HINT_CFG.paceS })), 'heli');
  eq(pick({}, ripe({ cruiseS: HINT_CFG.firstS - 1 })), null);
  eq(pick({ coarse: true, near: ['loco'] }), 'jumpTo');
  eq(pick({ region: 'ehrendingen', near: ['crash'] }, now), null); eq(pick({ region: 'ehrendingen' }), 'heli');
  eq(pick({}, hintEvent(ripe(), 'footOut')), 'foot');
  eq(pick({ near: ['ferris'] }, now), null); eq(pick({ near: ['ferris'], hideoutFound: true }, now), 'ferris');
});
test('pickHint_Wink', () => {
  const seen = Object.fromEntries(HINTS.filter(h => h.id !== 'wink').map(h => [h.id, { shown: 1, seen: true }]));
  eq(pick({ playTime: 3599 }, ripe(), seen), null); eq(pick({ playTime: 3600 }, ripe(), seen), 'wink');
  eq(pick({ playTime: 3600, hideoutFound: true }, ripe(), seen), null);
});
test('hintStoreAfter_ThreeTimeoutsOrOneActOrClose', () => {
  const two = hintStoreAfter(hintStoreAfter({}, H('heli'), 'timeout'), H('heli'), 'timeout');
  assert.deepEqual(two.heli, { shown: 2, seen: false }); eq(after('heli', 'timeout', two).seen, true);
  eq(after('jumpTo', 'closed').seen, true); eq(after('camera', 'acted').seen, true); eq(after('crash', 'timeout').seen, true);
  hintStoreAfter(Object.freeze({}), H('heli'), 'timeout');
});
test('Session_PlaceWaitsUntilLeft_CruiseCounted', () => {
  let s = hintSessionAfter(ripe(), H('depot'));
  eq(pick({ near: ['depot'] }, s), null);
  eq(pick({ near: ['depot'] }, hintTick(s, 1, { cruising: true, near: [] })), 'depot');
  eq(hintTick(newHintSession(), 2, { cruising: false, near: [] }).cruiseS, 0);
  eq(hintTick(newHintSession(), 2, { cruising: true, near: [] }).cruiseS, 2);
});
test('PlayTimeTapCap', () => {
  for (const v of [null, '', 'NaN', '-5']) eq(playTimeFrom(v), 0); eq(playTimeFrom('12.5'), 12.5);
  assert.deepEqual(hintTap(H('heli'), false), { via: 'key', cmd: 'KeyF' });
  assert.deepEqual(hintTap(H('radio'), true), { via: 'click', sel: '#radiobtn' });
  assert.deepEqual(hintTap(H('modes'), true), { via: 'key', cmd: 'Escape' });
  eq(hintTap(H('nitro'), false), null); eq(hintTap(H('crash'), false), null);
  eq(hintCap(H('radio')), '5–0'); eq(hintCap(H('heli')), 'F'); eq(hintCap(H('crash')), null);
});
```

- [ ] **Step 2:** `node --test tests/hints.test.mjs` → FAIL. **Step 3:** implement. **Step 4:** `node --test tests/hints.test.mjs tests/strings.test.mjs` → PASS.
- [ ] **Step 5:** Commit `feat(hints): pure hint catalogue and picking (#1090)`.

### Task 2: Settings rows, store glue, play time

**Files:** `index.html` (CSS :346, `#settings` :845, `renderSettings` :6443, `hud()` :8039), `strings.js`, `tests/test_settings.py`.

**Produces (part b uses these):** `const HINTS_S = { on, store, play }` (`store` null if localStorage throws); `saveHintStore()`; `setHintsOn(on)`; `resetHints()`; `window.__mm.hints = () => ({ on, store, play })`.

- CSS 346 hides the whole `<section id="setkeybarrow">` on touch: move that id onto the key bar's `.st-row`, then add switch `#sethints` (label `setHints` "Hints"/"Hinweise", cap `setHintsCap`), and button `#sethintsreset` (`setHintsReset` "Show hints again"/"Hinweise wieder zeigen"; after a click its cap reads `setHintsResetDone`).
- `resetHints()`: store `{}`, `localStorage.removeItem('mm.hints')` in try/catch. `setHintsOn(on)` writes `'1'`/`'0'`. `renderSettings` uses its `sw()` for `#sethints`.
- `hud(dt)`: `HINTS_S.play += dt` while `R.mode === 'cruise' && R.state !== 'ready' && !NET.race`; write `mm.playTime` in the existing `HUD.odoT > 1` block beside `mm.odo`.

- [ ] **Step 1: Failing tests** (reuse `boot`, `READY`, `ARGS`):

```python
def test_hints_switch_and_reset(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.evaluate("() => localStorage.setItem('mm.hints', '{\"heli\":{\"shown\":1,\"seen\":true}}')")
        page.reload(); page.wait_for_function(READY, timeout=240000); page.click("#settingsbtn")
        first = page.evaluate("() => window.__mm.hints()")
        page.click("#sethints"); page.click("#sethintsreset")
        after = page.evaluate("() => [window.__mm.hints(), localStorage.getItem('mm.hintsOn'), localStorage.getItem('mm.hints')]")
        b.close()
    assert first["on"] is True and first["store"]["heli"]["seen"] is True, first
    assert after[0]["on"] is False and after[0]["store"] == {} and after[1:] == ["0", None], after
    assert errors == []


def test_hints_row_shows_on_touch(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
        for r in ("**/data/terrain_*.mmh", "**/data/world_hochrhein.json"): page.route(r, lambda x: x.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html"); page.wait_for_function(READY, timeout=240000); page.tap("#settingsbtn")
        vis = [page.is_visible(s) for s in ("#sethints", "#sethintsreset", "#setkeybar")]; b.close()
    assert vis == [True, True, False], vis
```

- [ ] **Step 2:** `pytest tests/test_settings.py -k hints -x` → FAIL. **Step 3:** implement. **Step 4:** `pytest tests/test_settings.py -x` → PASS (old tests too).
- [ ] **Step 5:** Commit `feat(settings): hints switch and reset (#1090)`.
