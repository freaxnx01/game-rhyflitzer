# Village names: not across the Rhine, not inside a village (#73) — Implementation Plan

**Goal:** Inside Sisseln no village name hangs over the houses. MURG, across the Rhine, is gone. Names from the other bank of the Rhine are hidden, except near the river and on its bridges, where they fade in. Inside any village every name is hidden. Approaching a village from afar in open country still shows its name, and names still draw over everything without fog.

**Architecture:** New pure helpers in `prototype/world.js`, unit-tested with `node:test`:

- `nationalBorder` joins the CH/DE lines of the world's `boundaries` (#48) into one polyline.
- `sameBank` is an even/odd crossing test along the segment car→village.
- `bankFade` fades the other bank in near the border.
- `villageQuiet` dims all names inside any village.
- `villageNames` wraps the unchanged #16 `villageLabels` and applies those rules.

`prototype/index.html` builds the border once and calls `villageNames` instead of `villageLabels`. Spec: `docs/superpowers/specs/2026-10-03-village-names-other-bank-design.md`.

**Tech:** vanilla JS (ES modules), three.js, `node:test`, Playwright (Python).

## Global Constraints

- TDD: write the failing test first, watch it fail, then implement.
- Never modify an existing test to make it green. Stop and report after 3 failed attempts. The **one** deliberate exception is the wait condition in `test_far_villages_and_own_village_hidden` (Task 2, step 1). That test waits for the behaviour this issue removes (WALLBACH visible from Mumpf, across the Rhine). The spec (A5) changes that behaviour on purpose.
- Leave `villageLabels`, `villageFade`, `villageHeight`, `VILLAGE_FADE` and `VILLAGES` unchanged. Their #16 unit tests must stay green untouched.
- Surgical edits only. Touch only these:
  - `prototype/world.js` (append after `villageLabels`)
  - `prototype/tests/world.test.mjs` (the import on line 3 plus appended tests)
  - `prototype/index.html`: the `world.js` import (line 202), the `VILLAGE_SIGNS` line (795), the first line of `updateVillageNames` (799), and one new `__mm` hook after line 940
  - `prototype/tests/test_village_names.py`
  - `CHANGELOG.md`
  - `test-todo.md`
- No new key, no toggle. No depth test, no fog on the names (user-confirmed in #16).
- No pipeline change and no world rebuild. Never hand-edit `data/world_hochrhein.json`.
- Run Playwright tests in the **foreground**, never `run_in_background`. Commit and push the branch before starting the Playwright run.
- Commands:
  - unit tests: `node --test prototype/tests/*.test.mjs` (on Node 24 the folder alone does not work)
  - browser tests: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests -q`, or plain `pytest prototype/tests/...` where Playwright is installed globally (CI)
- Commits: Conventional Commits, reference `#73`.

## Task 1 — Border, bank and quiet helpers (TDD)

**Files:** `prototype/world.js`, `prototype/tests/world.test.mjs`.

**Interface:**

```js
export const BORDER_DE                 // ['Bad Säckingen', 'Murg'] — German Gemeinden in world.boundaries
export const VILLAGE_BANK_FADE         // 150 (m): other-bank names fade in within this distance of the border
export function nationalBorder(boundaries, de = BORDER_DE, tol = 1)   // [[x, z], ...] one polyline, or null
export function sameBank(border, ax, az, bx, bz)                     // true if the segment crosses the border an even number of times; true when border is null
export function bankFade(border, x, z, w = VILLAGE_BANK_FADE)        // 0..1; 1 when border is null
export function villageQuiet(villages, x, z, f = VILLAGE_FADE)       // 0..1; 0 inside any village
export function villageNames(villages, x, z, border = null)          // like villageLabels, with the quiet and bank rules applied
```

1. **Write the failing tests.** In `prototype/tests/world.test.mjs`, extend the import on line 3 with `BORDER_DE, VILLAGE_BANK_FADE, nationalBorder, sameBank, bankFade, villageQuiet, villageNames`, then append:

   ```js
   test('nationalBorder: joins the CH/DE lines in any order and direction, skips inner ones', () => {
     const B = [
       { names: ['Murg', 'Sisseln'], pts: [[100, 0], [200, 10]] },
       { names: ['Bad Säckingen', 'Murg'], pts: [[0, -50], [0, -500]] },          // German–German: not the border
       { names: ['Bad Säckingen', 'Stein'], pts: [[100, 0], [0, 5], [-100, 0]] }, // joins at the start, reversed
       { names: ['Sisseln', 'Stein'], pts: [[0, 5], [0, 400]] },                  // Swiss–Swiss: not the border
     ];
     assert.deepEqual(nationalBorder(B), [[-100, 0], [0, 5], [100, 0], [200, 10]]);
     assert.equal(nationalBorder([{ names: ['Murg', 'Sisseln'], pts: [[0, 0], [1, 0]] }, { names: ['Bad Säckingen', 'Stein'], pts: [[500, 0], [600, 0]] }]), null);
     assert.equal(nationalBorder([]), null);
     assert.deepEqual(BORDER_DE, ['Bad Säckingen', 'Murg']);
   });

   test('sameBank: even number of border crossings, null border means same bank', () => {
     const border = [[-1000, 0], [0, 10], [1000, 0]];
     assert.equal(sameBank(border, 200, 100, 200, -100), false);
     assert.equal(sameBank(border, 0, 100, 500, 300), true);
     assert.equal(sameBank(border, -500, -100, 500, -100), true);
     assert.equal(sameBank(null, 200, 100, 200, -100), true);
   });

   test('bankFade: 1 on the border, 0 from VILLAGE_BANK_FADE on, 1 without a border', () => {
     const near = (a, b) => Math.abs(a - b) < 1e-9;
     const border = [[-1000, 0], [1000, 0]];
     assert.equal(VILLAGE_BANK_FADE, 150);
     assert.equal(bankFade(border, 0, 0), 1);
     assert.ok(near(bankFade(border, 0, 75), 0.5));
     assert.equal(bankFade(border, 0, 150), 0);
     assert.equal(bankFade(border, 0, -400), 0);
     assert.equal(bankFade(null, 0, 9999), 1);
   });

   test('villageQuiet: 0 inside any village, ramps over VILLAGE_FADE.in, 1 in the open', () => {
     const near = (a, b) => Math.abs(a - b) < 1e-9;
     const V = [{ t: 'A', x: 0, z: 0, r: 400 }, { t: 'B', x: 2000, z: 0, r: 400 }];
     assert.equal(villageQuiet(V, 0, 0), 0);
     assert.ok(near(villageQuiet(V, 500, 0), 0.5));
     assert.equal(villageQuiet(V, 1000, 0), 1);
     assert.equal(villageQuiet([], 0, 0), 1);
   });

   test('villageNames: nothing inside a village, other bank only near the border', () => {
     const near = (a, b) => Math.abs(a - b) < 1e-9;
     const V = [{ t: 'HOME', x: 0, z: 1000, r: 400 }, { t: 'NEAR', x: 1500, z: 1000, r: 400 }, { t: 'ACROSS', x: 0, z: -1000, r: 400 }];
     const river = [[-5000, 0], [5000, 0]];
     assert.deepEqual(villageNames(V, 0, 1000, river), []);                                         // inside HOME
     assert.deepEqual(villageNames(V, 700, 1000, river).map(l => l.t), ['HOME', 'NEAR']);           // open country, ACROSS is over the river
     assert.deepEqual(villageNames(V, 700, 1000, null).map(l => l.t), ['HOME', 'NEAR', 'ACROSS']);  // no border: as in #16
     const atBank = villageNames(V, 0, 75, river);                                                  // 75 m from the border
     assert.deepEqual(atBank.map(l => l.t), ['HOME', 'ACROSS', 'NEAR']);
     assert.ok(near(atBank[1].opacity, 0.5));
     assert.deepEqual(villageNames(V, 0, 500, river).map(l => [l.t, l.opacity]), [['HOME', 0.5], ['NEAR', 0.5]]); // 100 m outside HOME
     assert.deepEqual(Object.keys(atBank[0]), ['t', 'x', 'z', 'd', 'opacity', 'h']);
   });
   ```

2. **Run and watch them fail:** `node --test prototype/tests/*.test.mjs`. The import of the missing exports fails.

3. **Implement.** Append to `prototype/world.js`, right after `villageLabels`:

   ```js
   // #73: the national border runs in the Rhine. It is every #48 Gemeinde line between one German Gemeinde (BORDER_DE, the
   // admin_level=8 relations with a de:amtlicher_gemeindeschluessel) and a Swiss one, joined into one polyline. Names from the
   // other bank are hidden, except within VILLAGE_BANK_FADE metres of the border (on the river and its bridges).
   export const BORDER_DE = ['Bad Säckingen', 'Murg'];
   export const VILLAGE_BANK_FADE = 150;
   function joinPiece(chain, p, same) {
     if (same(chain.at(-1), p[0])) return chain.concat(p.slice(1));
     if (same(chain.at(-1), p.at(-1))) return chain.concat(p.slice(0, -1).reverse());
     if (same(chain[0], p.at(-1))) return p.slice(0, -1).concat(chain);
     return p.slice(1).reverse().concat(chain);
   }
   // One polyline from the CH/DE border lines, or null when there are none or they don't join end to end.
   export function nationalBorder(boundaries, de = BORDER_DE, tol = 1) {
     const pieces = boundaries.filter(b => b.names.filter(n => de.includes(n)).length === 1).map(b => b.pts);
     if (!pieces.length) return null;
     const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
     let chain = pieces.shift().slice();
     while (pieces.length) {
       const i = pieces.findIndex(p => [p[0], p.at(-1)].some(e => same(chain[0], e) || same(chain.at(-1), e)));
       if (i < 0) return null;
       chain = joinPiece(chain, pieces.splice(i, 1)[0], same);
     }
     return chain;
   }
   function crossZ(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
   function segmentsCross(a, b, c, d) { return (crossZ(c, d, a) > 0) !== (crossZ(c, d, b) > 0) && (crossZ(a, b, c) > 0) !== (crossZ(a, b, d) > 0); }
   // The border splits the world in two (it ends on the world edge): an even number of crossings means the same bank.
   export function sameBank(border, ax, az, bx, bz) {
     if (!border) return true;
     let crossings = 0;
     for (let i = 0; i < border.length - 1; i++) if (segmentsCross([ax, az], [bx, bz], border[i], border[i + 1])) crossings++;
     return crossings % 2 === 0;
   }
   export function bankFade(border, x, z, w = VILLAGE_BANK_FADE) {
     if (!border) return 1;
     return Math.max(0, 1 - nearestOnPolyline(border, x, z).d / w);
   }
   // Inside any village every name is hidden; it comes back over f.in metres as the car leaves the village.
   export function villageQuiet(villages, x, z, f = VILLAGE_FADE) {
     let quiet = 1;
     for (const v of villages) quiet = Math.min(quiet, Math.max(0, (Math.hypot(v.x - x, v.z - z) - v.r) / f.in));
     return quiet;
   }
   export function villageNames(villages, x, z, border = null) {
     const quiet = villageQuiet(villages, x, z), across = bankFade(border, x, z);
     return villageLabels(villages, x, z)
       .map(l => ({ ...l, opacity: Math.min(l.opacity, quiet, sameBank(border, x, z, l.x, l.z) ? 1 : across) }))
       .filter(l => l.opacity > 0);
   }
   ```

   `nearestOnPolyline` is already defined at the top of `world.js` (`:43`) and returns `{ d, t, i }`.

4. **Run:** `node --test prototype/tests/*.test.mjs`. Everything is green, and the #16 tests are untouched.

5. **Commit:** `feat(world): village names hidden across the Rhine and inside villages (#73)`.

## Task 2 — Wire into the game, Playwright (test-first)

**Files:** `prototype/tests/test_village_names.py`, `prototype/index.html`.

1. **Update the Mumpf test's wait (spec A5) and write the failing browser tests.** In `test_far_villages_and_own_village_hidden`, replace only the wait line

   ```python
           page.wait_for_function("() => window.__mm.villages().some(v => v.t === 'WALLBACH')", timeout=60000)   # 2.4 km away
   ```

   with a wait for two label ticks after placing:

   ```python
           t0 = page.evaluate("() => window.__mm.labelTick()")
           page.wait_for_function(f"() => window.__mm.labelTick() > {t0} + 2", timeout=60000)
   ```

   Move the `t0 = …` line **before** the existing `page.evaluate(f"() => window.__mm.place({MUMPF[0]}, {MUMPF[1]})")` line. Then add `assert "WALLBACH" not in shown          # across the Rhine (#73)` after the two existing asserts. Keep the existing asserts as they are.

   Then append to the file:

   ```python
   CH_BANK = (3300, 100)      # Swiss bank, 1.3 km from Murg, 1.7 km from Sisseln, > 150 m from the border
   DE_BANK = (3000, -1200)    # German bank, 1.5 km from Murg, 1.6 km from Sisseln
   ON_BORDER = (2406.7, -670.6)   # Murg/Sisseln/Bad Säckingen border point in the Rhine


   def place_and_wait(page, xz, js_condition):
       page.evaluate(f"() => window.__mm.place({xz[0]}, {xz[1]})")
       page.wait_for_function(js_condition, timeout=60000)
       return names(page)


   @needs_world
   def test_other_bank_names_hidden_except_on_the_river(server):
       """#73: from the Swiss bank no German names and vice versa; on the river both."""
       with sync_playwright() as p:
           br, page = open_page(p, server)
           border_points = page.evaluate("() => window.__mm.villageBorder()")
           ch = place_and_wait(page, CH_BANK, "() => window.__mm.villages().some(v => v.t === 'SISSELN')")
           de = place_and_wait(page, DE_BANK, "() => window.__mm.villages().some(v => v.t === 'MURG')")
           river = place_and_wait(page, ON_BORDER, "() => window.__mm.villages().some(v => v.t === 'SISSELN')")
           br.close()
       assert border_points > 100, border_points
       assert "MURG" not in ch, ch
       assert "SISSELN" not in de, de
       assert "MURG" in river and "SISSELN" in river, river


   @needs_world
   def test_no_names_inside_sisseln(server):
       """#73 repro: in Sisseln, MURG (or any other name) must not hang over the houses."""
       with sync_playwright() as p:
           br, page = open_page(p, server)
           place_and_wait(page, CH_BANK, "() => window.__mm.villages().length > 0")
           shown = place_and_wait(page, SISSELN, "() => window.__mm.villages().length === 0")
           sprites = page.evaluate("() => window.__mm.villageSprites()")
           br.close()
       assert shown == [] and sprites == [], (shown, sprites)
   ```

2. **Commit and push the branch, then run in the foreground:** `pytest prototype/tests/test_village_names.py -q` (or the venv form in Global Constraints). Expected failures: `villageBorder` is not a function, MURG shows on the Swiss bank, and the Sisseln wait times out. The Mumpf test fails because the names are still drawn by distance alone (WALLBACH shows).

3. **Implement** in `prototype/index.html`:
   - Line 202 import: replace `villageLabels` with `villageNames, nationalBorder`. `villageLabels` is used nowhere else in `index.html`. Check with `grep -n villageLabels prototype/index.html` and keep it only if another use exists.
   - Line 795: add the border to `VILLAGE_SIGNS`:

     ```js
     const VILLAGE_SIGNS = { shown: [], sprites: new Map(), ground: new Map(L ? VILLAGES.map(v => [v.t, terrainH(v.x, v.z)]) : []), border: L ? nationalBorder(L.boundaries) : null };
     ```

   - Line 799 (first line of `updateVillageNames`):

     ```js
       VILLAGE_SIGNS.shown = L ? villageNames(VILLAGES, x, z, VILLAGE_SIGNS.border) : [];
     ```

   - Extend the #16 comment above `VILLAGE_SIGNS` (line 793) with: `#73: not across the Rhine (national border from L.boundaries) and nothing while inside a village`.
   - After the `window.__mm.villageSprites = …` hook (line 940):

     ```js
     window.__mm.villageBorder = () => VILLAGE_SIGNS.border ? VILLAGE_SIGNS.border.length : 0;
     ```

4. **Run** the unit tests, then the whole browser suite in the foreground: `node --test prototype/tests/*.test.mjs` and `pytest prototype/tests -q`. Everything is green, `test_hand_layout_has_no_village_names` included.

5. **Manual check in the browser** (`python3 -m http.server 8000`, open `/prototype/`). The console is empty. Start the race: in Sisseln no name is shown. Drive east along the Hauptstrasse to the screenshot spot: no MURG.

6. **Commit:** `fix(ui): no village names across the Rhine or inside a village (#73)`.

## Task 3 — Docs

**Files:** `CHANGELOG.md`, `test-todo.md`.

1. `CHANGELOG.md` `[Unreleased]` → `### Added`: extend the existing village-names line (line 12, still unreleased) after "It fades as you drive into the village." with:

   > Names on the other side of the Rhine stay hidden until you are on the river or a bridge, and inside a village no name hangs over the houses.

2. `test-todo.md`, section `## Big village names (#16)`: change its heading to `## Big village names (#16, #73)` and replace the first bullet ("From the start, drive west towards Stein and Bad Säckingen …") with:

   ```markdown
   - [ ] Leave Sisseln westwards towards Sisslerfeld and Stein: once out of the village, the Swiss names hang over the villages, readable from afar, not too big, not too small. BAD SÄCKINGEN does not show from the Swiss bank (#73).
   - [ ] #73 repro: drive through Sisseln along the Hauptstrasse eastwards — no MURG (and no other name) over the houses.
   - [ ] On the Rhine bank between Sisseln and Murg, and on a Rhine bridge outside a village: names from both banks fade in; driving away from the river, the other bank's names fade out smoothly.
   - [ ] On the German bank (e.g. north of Murg): MURG and BAD SÄCKINGEN show, the Swiss names don't.
   ```

3. **Commit:** `docs: changelog and playtest notes for village names across the Rhine (#73)`.

## Done when

- [ ] `node --test prototype/tests/*.test.mjs` green, the #16 village tests unchanged.
- [ ] `pytest prototype/tests -q` green in the foreground, including the two new #73 tests and the updated Mumpf test.
- [ ] Inside Sisseln no village name is shown. MURG is hidden on the Swiss bank, shown on the German bank and on the river.
- [ ] CHANGELOG and test-todo updated.
