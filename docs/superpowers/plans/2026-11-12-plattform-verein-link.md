# Verein link on the Plattform deck (#887) Implementation Plan

**Goal:** While on foot on the Plattform deck, a plate shows "Verein Plattform Sisslerfeld" and E (or a click/tap) opens
`https://www.plattform-sisslerfeld.com/` in a new tab.

**Architecture:** pure `plattformOnDeck()` in `plattform.js`; a lowest-priority E context action `'website'` in
`controls.js`; in `index.html` a HUD plate under `#prompt`, shown per frame, and `runContextKey()` opening the link.

**Tech Stack:** vanilla JS ES modules, node:test, Playwright (Python).

**Spec:** `docs/superpowers/specs/2026-11-12-plattform-verein-link-design.md`

## Global Constraints

- URL only from `ABOUT_LINKS.plattform` (`about.js:10`), never a second literal.
- No new key binding: E only. Everything that exists wins over `'website'` (checked last).
- The plate is hidden while `PAUSE.on` or the overlay (`#overlay`) is shown.
- Strings in `strings.js` `en` and `de`: `vereinName` = `Verein Plattform Sisslerfeld` (both), `vereinOpen` =
  `E · Open website ↗` / `E · Website öffnen ↗`, `barWebsite` = `website ↗` / `Website ↗`.
- Playwright runs in the foreground, only the new file plus `tests/test_plattform_stair.py`, under
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.

## Review Focus

- At the stair head on the deck E must still hop down (`'down'` wins) — Task 2 test.
- Standing on the ground under the deck (inside the circumradius) must not show the plate — Task 1 test.
- Hovering (`FOOT.hover`) or in the car: no plate, no `'website'` — Task 3 Playwright (back in the car).
- Language switch while on the deck updates the plate text — via `data-i18n` (Task 3).

---

### Task 1: `plattformOnDeck` in `plattform.js`

**Files:** Modify `plattform.js` (after `plattformHop`, ~line 123); Test `tests/plattform.test.mjs`

**Interfaces:** Produces `plattformOnDeck(frame, base, pos, P = PLATTFORM) -> boolean`.

- [ ] **Step 1: Write the failing tests** (add `plattformOnDeck` to the import; reuse the file's `F`/`BASE` fixtures
  used by the `plattformHop_*` tests):

```js
test('plattformOnDeck_DeckHeightNearTheCentre_IsTrue', () => {
  const [x, z] = F.polar(90, 3);
  assert.equal(plattformOnDeck(F, BASE, { x, z, y: BASE + PLATTFORM.deck.y }), true);
});
test('plattformOnDeck_GroundUnderTheDeck_IsFalse', () => {
  const [x, z] = F.polar(90, 3);
  assert.equal(plattformOnDeck(F, BASE, { x, z, y: BASE }), false);
});
test('plattformOnDeck_DeckHeightOutsideTheCircumradius_IsFalse', () => {
  const [x, z] = F.polar(90, PLATTFORM.deck.side / Math.sqrt(3) + 0.5);
  assert.equal(plattformOnDeck(F, BASE, { x, z, y: BASE + PLATTFORM.deck.y }), false);
});
```

- [ ] **Step 2:** `node --test tests/plattform.test.mjs` → FAIL (not exported).
- [ ] **Step 3: Implement.** True when `pos.y >= base + P.deck.y - HOP.deckSlack` and
  `Math.hypot(pos.x - frame.x, pos.z - frame.z) <= P.deck.side / Math.sqrt(3)` (check how the frame exposes its
  centre in `plattformFrame`, `plattform.js:29`). One `// #887:` comment line.
- [ ] **Step 4:** `node --test tests/plattform.test.mjs` → PASS.
- [ ] **Step 5:** Commit `feat(plattform): know when the walker is on the deck (#887)` and push.

### Task 2: context action `'website'` in `controls.js`

**Files:** Modify `controls.js:67` (`CONTEXT_LABELS`) and `controls.js:92` (`contextKeyAction`); Test
`tests/controls.test.mjs`

**Interfaces:** `contextKeyAction({ ..., stopPrompt = false, onDeck = false })` returns `'website'` when nothing else
applies and `onDeck`; `contextLabel('website') === 'barWebsite'`.

- [ ] **Step 1: Write the failing tests:**

```js
test('contextKeyAction_OnDeckNothingElse_IsWebsite', () => {   // #887
  assert.equal(contextKeyAction({ onDeck: true }), 'website');
});
test('contextKeyAction_HopDownWinsOverWebsite', () => {   // #887
  assert.equal(contextKeyAction({ hop: 'down', onDeck: true }), 'down');
  assert.equal(contextKeyAction({ stopPrompt: true, onDeck: true }), 'timetable');
});
test('contextLabel_Website_IsBarWebsite', () => {   // #887
  assert.equal(contextLabel('website'), 'barWebsite');
});
```

- [ ] **Step 2:** `node --test tests/controls.test.mjs` → FAIL.
- [ ] **Step 3: Implement:** `'website'` checked after `stopPrompt`; add `website: 'barWebsite'` to
  `CONTEXT_LABELS`; extend the comment above `contextKeyAction` with "> the Verein's website on the Plattform deck
  (#887)".
- [ ] **Step 4:** `node --test tests/*.test.mjs` → all PASS (`conflicts()` must stay empty).
- [ ] **Step 5:** Commit `feat(controls): E opens the Verein website on the Plattform deck (#887)` and push.

### Task 3: plate, strings, opening the link

**Files:** Modify `index.html` (HUD ~line 459, `platHop` ~4702, `contextAction` ~4707, `runContextKey` ~4710, the
`#about a[data-link]` loop, the per-frame call site of `stepEnter()`), `strings.js`, `CHANGELOG.md`; Create
`tests/test_plattform_verein.py`

**Interfaces:** consumes `plattformOnDeck` (Task 1), `'website'` / `'barWebsite'` (Task 2). Adds
`window.__mm.onDeck = () => platOnDeck()` for tests.

- [ ] **Step 1: Write the failing Playwright test** `tests/test_plattform_verein.py`: copy `open_world`, `plattform`,
  `polar`, `key`, `on_foot_at`, `ARGS`, `WORLD`, `MMH_ROUTE`, `needs_world` from `tests/test_plattform_stair.py`.

```python
@needs_world
def test_deck_shows_the_verein_plate_and_e_opens_the_website(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        page.evaluate("() => { window.__opened = []; window.open = (u, t, f) => { window.__opened.push([u, t]); return null; }; }")
        plat = plattform(page)
        x, z = polar(page, 300, 2.3)   # on the deck walkway (core r 1.56), far from the stair gap at ~175 deg
        on_foot_at(page, x, z, plat["facing"], plat["deckY"])
        page.wait_for_function("() => !document.getElementById('vereinplate').hidden", timeout=120000)
        name = page.inner_text("#vereinplate")
        link = page.evaluate("() => { const a = document.getElementById('vereinlink'); return [a.href, a.target]; }")
        action = page.evaluate("() => window.__mm.keybar().action")
        key(page, "e")
        opened = page.evaluate("() => window.__opened")
        on_foot_at(page, x, z, plat["facing"], plat["base"])   # back on the ground
        page.wait_for_function("() => document.getElementById('vereinplate').hidden", timeout=120000)
        b.close()
    assert "Verein Plattform Sisslerfeld" in name, name
    assert link == ["https://www.plattform-sisslerfeld.com/", "_blank"], link
    assert action == "website", action
    assert opened == [["https://www.plattform-sisslerfeld.com/", "_blank"]], opened
    assert errors == []
```

  If `polar(300, 2.3)` lands within `HOP.stairReach` of the stair head, pick another angle on the deck walkway and
  note it in a comment.
- [ ] **Step 2:** run it (foreground, capped):
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest tests/test_plattform_verein.py -q`
  → FAIL (no `#vereinplate`).
- [ ] **Step 3: Strings** — add the three keys from Global Constraints to `en` and `de` in `strings.js`, next to
  `hopUpPrompt` (`// #887`).
- [ ] **Step 4: Markup** — right after `<div id="prompt"></div>`:
  `<div id="vereinplate" hidden><span data-i18n="vereinName">Verein Plattform Sisslerfeld</span> <a id="vereinlink" data-link="plattform" target="_blank" rel="noopener" data-i18n="vereinOpen"></a></div>`
  (no `data-link`: the About loop at `index.html:5702` is scoped to `#about`; set
  `$('vereinlink').href = ABOUT_LINKS.plattform;` right after that loop). CSS: same font/colour family as `#prompt`, small, `pointer-events:auto` on
  the link.
- [ ] **Step 5: Logic** in `index.html`:
  - `const platOnDeck = () => FOOT.on && !FOOT.hover && PLAT ? plattformOnDeck(PLAT.frame, PLAT.base, P) : false;`
    next to `platHop` (import `plattformOnDeck` with the other `./plattform.js` names).
  - pass `onDeck: platOnDeck()` into `contextKeyAction` in `contextAction()`.
  - `runContextKey()`: `else if (a === 'website') window.open(ABOUT_LINKS.plattform, '_blank', 'noopener');`
  - `stepVereinPlate()`: `$('vereinplate').hidden = !platOnDeck() || PAUSE.on || !$('overlay').hidden;` called each
    frame where `stepEnter()` is called.
  - `window.__mm.onDeck = () => platOnDeck();   // #887: tests`
- [ ] **Step 6:** `tests/test_plattform_verein.py` → PASS; `tests/test_plattform_stair.py` → PASS (E at the stair head
  still hops); `node --test tests/*.test.mjs` → all PASS.
- [ ] **Step 7: CHANGELOG** under `[Unreleased]` → `### Added`, time from `TZ=Europe/Zurich date '+%F %H:%M'`:
  ``- `YYYY-MM-DD HH:MM` On the **Plattform deck** a plate names the **Verein Plattform Sisslerfeld**; <kbd>E</kbd> opens its website in a new tab.``
- [ ] **Step 8:** Commit `feat(world): Verein plate and website link on the Plattform deck (#887)` and push.
