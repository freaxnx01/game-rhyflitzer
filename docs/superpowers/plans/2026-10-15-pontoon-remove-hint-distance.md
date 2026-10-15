# Pontoon remove hint distance (#307) Implementation Plan

**Goal:** the take-down hint and the U key act on the built pontoon only within 30 m of it.
**Spec:** `docs/superpowers/specs/2026-10-15-pontoon-remove-hint-distance-design.md`
**Files:** `prototype/pontoon.js`, `prototype/index.html` (lines ~387, 2303, 2305, 2866), `prototype/tests/pontoon.test.mjs`, `prototype/tests/test_pontoon.py`, `CHANGELOG.md`.
Run Playwright in the foreground, only `test_pontoon.py`. No other file touched.

## Task 1: pure rule (TDD)

- [ ] **Failing tests** in `prototype/tests/pontoon.test.mjs`: add `nearDeck` to the import list and replace the `pontoonPrompt` test with:

```js
test('nearDeck: within removeReach of the segment a-b, on the deck included', () => {
  const d = { ...crossingLine(env(), 0, 25), built: 1 };
  assert.equal(nearDeck(null, 0, 0), false);
  assert.equal(nearDeck(d, 0, 25), true);                       // where it was built
  assert.equal(nearDeck(d, d.a[0], d.a[1] - 1000), false);      // far away
  const mid = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
  assert.equal(nearDeck(d, mid[0], mid[1]), true);              // on the deck
  assert.equal(nearDeck(d, d.b[0] - d.uz * 40, d.b[1] + d.ux * 40), false);   // 40 m abeam
});

test('pontoonPrompt: remove only near a deck, build only at a bank without one', () => {
  assert.equal(pontoonPrompt(null, false, false), null); assert.equal(pontoonPrompt(null, true, false), 'build');
  assert.equal(pontoonPrompt({}, true, true), 'remove'); assert.equal(pontoonPrompt({}, false, true), 'remove');
  assert.equal(pontoonPrompt({}, true, false), null); assert.equal(pontoonPrompt({}, false, false), null);
});
```

  verify: `node --test prototype/tests/pontoon.test.mjs` fails (nearDeck missing).
- [ ] **Implement** in `prototype/pontoon.js`: add `removeReach: 30` to `PONTOON_CFG`; add

```js
// the car is within removeReach of the deck segment a-b (on it counts as 0): where the take-down hint and U apply
export function nearDeck(d, x, z, cfg = PONTOON_CFG) {
  if (!d) return false;
  const [t, s] = pontoonLocal(d, x, z), tc = Math.max(0, Math.min(d.len, t));
  return Math.hypot(t - tc, s) <= cfg.removeReach;
}
```

  and change line 102 to `export function pontoonPrompt(deck, atBank, near) { return deck ? (near ? 'remove' : null) : atBank ? 'build' : null; }` (update the comment above it: 'remove' while near a deck).
  verify: node tests pass.

## Task 2: wire the HUD, the key and the debug hook

- [ ] `prototype/index.html`: add `nearDeck` to the `./pontoon.js` import (line ~387).
- [ ] `pressPontoon` (line ~2303): in the `if (PONTOON.deck)` branch, first `if (!nearDeck(PONTOON.deck, P.x, P.z)) return;`, then the existing toggle.
- [ ] HUD (line ~2866): `pontoonPrompt(PONTOON.deck, !FLY.on && atRhineBank(pontoonEnv(), P.x, P.z), nearDeck(PONTOON.deck, P.x, P.z))`.
- [ ] `window.__mm.pontoon` (line ~2305): same third argument.
- [ ] The U help text `keyPontoon` in `prototype/strings.js:461` stays as is.

## Task 3: browser test

- [ ] In `prototype/tests/test_pontoon.py` add, using the existing helpers `build`, `place`, `pontoon`, `open_world`:

```python
HUEBEL = (-703.3, 1419.1)           # the Hübel mouth, ~2.8 km from the Sisseln bridge

@needs_world
def test_remove_hint_and_u_only_near_the_built_bridge(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        build(page)
        assert pontoon(page)["prompt"] == "remove"        # where it was built
        place(page, HUEBEL, 0)
        assert pontoon(page)["prompt"] is None
        page.keyboard.press("KeyU")
        assert pontoon(page)["dir"] == 1                  # nothing was taken down
        place(page, BANK, NORTH)
        page.keyboard.press("KeyU")
        assert pontoon(page)["dir"] == -1
        b.close()
```

  verify: `python -m pytest prototype/tests/test_pontoon.py -k remove_hint` in the foreground, then the whole file.
  The pre-existing assertions (`prompt == "remove"` after the build at BANK, line ~85) must still hold unchanged.

## Task 4: changelog and commit

- [ ] `CHANGELOG.md` under `[Unreleased]` / Fixed, player voice: „Der Hinweis "U · Pontonbrücke abbauen" erscheint nur noch in der Nähe der gebauten Brücke, nicht mehr irgendwo auf der Karte (zum Beispiel im Hübel-Tunnel). U baut die Brücke ebenfalls nur noch dort ab."
- [ ] Commit `fix(pontoon): show take-down hint and U only near the built bridge (#307)`.
