# Tower Deck Shortcut Implementation Plan (#701)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On foot, E at the Plattform door puts the walker on the viewing deck, and E on the deck by the stair opening puts
them back outside the door. The tutorial hints name the shortcut. Touch uses the existing context button.

**Architecture:** Two pure functions in `plattform.js` decide when a hop is offered and where it lands. `controls.js`
`contextKeyAction` learns a `hop` input (`'up' | 'down' | null`) and `contextLabel` learns two labels. `index.html` wires
the walker state in with a few small inserts. Spec: `docs/superpowers/specs/2026-11-09-tower-deck-shortcut-design.md`.

## Global Constraints

- **Parallel work:** #735 (car radio) edits `index.html`, `controls.js`, `strings.js`, `pause.js` and the about screen at the
  same time. Keep every edit a small insert. **Anchor each one on the code text given below, never on a line number.**
  `git fetch origin && git rebase origin/main` before the first edit and before pushing.
- **Keys:** use **E** only. Digits 5, 6, 7, 8, 9, 0 belong to #735. Do not add any binding.
- Vanilla JS, no new files except test additions, no dependencies, no refactors of surrounding code.
- Strings: add every new key to **both** `en` and `de` blocks of `strings.js`. German uses real umlauts, capital `Du` forms.
- **No dry runs, no full suites.** Run only: `node --test tests/plattform.test.mjs tests/controls.test.mjs tests/tutorial.test.mjs tests/strings.test.mjs tests/enterables.test.mjs`
  and then the one Playwright file `tests/test_plattform_stair.py` (foreground, never `run_in_background`):
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_plattform_stair.py -x -q`.
  Do not run `tests/test_tutorial.py` (about 2 h suite share); the tutorial hint wording is covered by node tests.
- Commit and push the branch before the Playwright run.

## File Structure

- Modify `plattform.js`: add `HOP`, `plattformHop`, `plattformHopLanding`.
- Modify `controls.js`: `CONTEXT_LABELS`, `contextKeyAction`.
- Modify `strings.js`: `barHopUp`, `barHopDown`, `hopUpPrompt`, `hopDownPrompt`, `keyHop`, `tutStepClimb`, `tutStepClimbTouch`, `tutStepDown`, `tutStepDownTouch` (en + de).
- Modify `tutorial.js`: `tutorialHint` picks `tutStepClimbTouch` on touch.
- Modify `index.html`: import, `contextAction`, `runContextKey`, `stepEnter`, one help row, one `__mm` hook.
- Modify tests: `tests/plattform.test.mjs`, `tests/controls.test.mjs`, `tests/tutorial.test.mjs`, `tests/strings.test.mjs`, `tests/test_plattform_stair.py`.
- Modify `CHANGELOG.md`.

---

### Task 1: Pure hop rules in `plattform.js`

**Files:** Modify `plattform.js`, `tests/plattform.test.mjs`

**Interfaces:**
```js
export const HOP = { doorReach: 2.5, stairReach: 3.2, lowest: 1.0, deckSlack: 0.5, landR: 0.9, outside: 0.4 };
// pos = { x, z, y } (feet). Returns 'up' | 'down' | null.
export function plattformHop(frame, base, pos, P = PLATTFORM)
// dir = 'up' | 'down'. Returns { x, z, th, y } (th = heading angle, like plattformEntrance).
export function plattformHopLanding(frame, base, dir, P = PLATTFORM)
```

- [ ] **Step 1: Write the failing tests** (append to `tests/plattform.test.mjs`; add `HOP, plattformHop, plattformHopLanding` to the import from `../plattform.js`). `BASE` and `F` already exist in the file (`BASE = 100, F = plattformFrame(0, 0, 0.3)`).

```js
const gapMid = (PLATTFORM.stair.austritt.from + PLATTFORM.stair.austritt.to) / 2;

test('plattformHop_AtTheDoorOnTheGround_IsUp', () => {
  const [x, z] = F.polar(0, PLATTFORM.entranceR);
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE }), 'up');
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + 0.6 }), 'up', 'on the lowest steps');
});

test('plattformHop_FarFromTheDoorOrHighOnTheStair_IsNull', () => {
  const [fx, fz] = F.polar(0, PLATTFORM.entranceR + 4);
  assert.equal(plattformHop(F, BASE, { x: fx, z: fz, y: BASE }), null);
  const [x, z] = F.polar(0, PLATTFORM.entranceR);
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + 3 }), null, 'mid-stair: walk');
});

test('plattformHop_OnTheDeckAtTheStairGap_IsDown', () => {
  const [x, z] = F.polar(gapMid, PLATTFORM.core.r + 1);
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + PLATTFORM.deck.y }), 'down');
});

test('plattformHop_OnTheDeckFarFromTheGap_IsNull', () => {
  const [x, z] = F.polar(0, 5);   // the door-side corner area of the deck
  assert.equal(plattformHop(F, BASE, { x, z, y: BASE + PLATTFORM.deck.y }), null);
});

test('plattformHopLanding_Up_StandsOnTheDeckBesideTheOpening', () => {
  const l = plattformHopLanding(F, BASE, 'up');
  assert.equal(l.y, BASE + PLATTFORM.deck.y);
  const r = Math.hypot(l.x - F.x, l.z - F.z);
  assert.ok(r > PLATTFORM.core.r + WALKER.radius, `clear of the opening, r=${r}`);
  assert.ok(Math.abs(walkwayFloor(W, l.x, l.z, l.y) - l.y) < 0.05, 'the deck slab is under the landing');
  assert.equal(plattformHop(F, BASE, l), 'down', 'a second E takes the walker straight back');
});

test('plattformHopLanding_Up_IsInsideTheTutorialViewpoint', () => {   // viewpoints.js: r 6, aboveGround 5
  const l = plattformHopLanding(F, BASE, 'up');
  assert.ok(Math.hypot(l.x - F.x, l.z - F.z) <= 6 && l.y >= BASE + 5);
});

test('plattformHopLanding_Down_StandsOutsideTheDoorOnTheGround', () => {
  const l = plattformHopLanding(F, BASE, 'down');
  assert.equal(l.y, BASE);
  assert.equal(plattformHop(F, BASE, l), 'up', 'a second E takes the walker straight back up');
  assert.ok(Math.hypot(l.x - F.x, l.z - F.z) > PLATTFORM.core.r + WALKER.radius);
});
```

- [ ] **Step 2:** Run `node --test tests/plattform.test.mjs` and confirm the new tests fail (`plattformHop is not a function`).
- [ ] **Step 3: Implement** in `plattform.js`, append after `plattformEntrance` (anchor: the line `export function plattformEntrance(frame, P = PLATTFORM) {` block):

```js
// #701: E at the door puts the walker on the deck, E on the deck by the stair opening puts them outside the door
export const HOP = { doorReach: 2.5, stairReach: 3.2, lowest: 1.0, deckSlack: 0.5, landR: 0.9, outside: 0.4 };
const gapAngle = (P) => (P.stair.austritt.from + P.stair.austritt.to) / 2;

export function plattformHop(frame, base, pos, P = PLATTFORM) {
  const up = pos.y - base <= HOP.lowest, deck = pos.y >= base + P.deck.y - HOP.deckSlack;
  if (!up && !deck) return null;
  const [px, pz] = up ? frame.polar(0, P.entranceR) : frame.polar(gapAngle(P), P.core.r);
  const reach = up ? HOP.doorReach : HOP.stairReach;
  if (Math.hypot(pos.x - px, pos.z - pz) > reach) return null;
  return up ? 'up' : 'down';
}

export function plattformHopLanding(frame, base, dir, P = PLATTFORM) {
  if (dir === 'up') {
    const gap = gapAngle(P), [x, z] = frame.polar(gap, P.core.r + HOP.landR);
    return { x, z, th: frame.facing + gap * RAD, y: base + P.deck.y };
  }
  const [x, z] = frame.polar(0, P.entranceR + HOP.outside);
  return { x, z, th: frame.facing, y: base };
}
```

- [ ] **Step 4:** Run `node --test tests/plattform.test.mjs` until green. If `walkwayFloor` is not exactly the deck height at the landing, fix the landing radius, not the test.
- [ ] **Step 5:** Commit `feat(tower): pure hop rules for the Plattform deck shortcut (#701)`.

---

### Task 2: The context key and labels (`controls.js`, `strings.js`)

**Files:** Modify `controls.js`, `strings.js`, `tests/controls.test.mjs`, `tests/strings.test.mjs`

- [ ] **Step 1: Failing tests.** In `tests/controls.test.mjs`:

```js
test('contextKeyAction_HopWinsOverEnter_LiftAndLeaveWinOverHop', () => {
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: true, hop: 'up' }), 'up');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: false, hop: 'down' }), 'down');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: true, doorPrompt: false, hop: 'up' }), 'leave');
  assert.equal(contextKeyAction({ liftPrompt: true, indoors: true, doorPrompt: false, hop: 'up' }), 'lift');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: true }), 'enter', 'hop is optional');
});
```
and extend the existing `barEntries_WithContextAction_HighlightedEFirst` list is left alone; add:
```js
test('barEntries_HopActions_HighlightedEWithTheirLabels', () => {
  for (const [a, en, de] of [['up', 'up to the deck', 'hinauf'], ['down', 'down', 'hinunter']]) {
    const first = barEntries('foot', a)[0];
    assert.deepEqual([first.cap, first.highlight, translate('en', first.label), translate('de', first.label)], ['E', true, en, de], a);
  }
});
```
In `tests/strings.test.mjs` add a test that `hopUpPrompt`, `hopDownPrompt`, `keyHop`, `tutStepClimbTouch` exist in both languages and differ between `en` and `de` (follow the style of the `keyLeave` test).
- [ ] **Step 2:** Run the two files, confirm red.
- [ ] **Step 3: `controls.js`.** Anchor `const CONTEXT_LABELS = { enter: 'barEnter', leave: 'barLeave', lift: 'barLift' };` becomes
`const CONTEXT_LABELS = { enter: 'barEnter', leave: 'barLeave', lift: 'barLift', up: 'barHopUp', down: 'barHopDown' };`.
Anchor `export function contextKeyAction({ liftPrompt, indoors, doorPrompt }) {` becomes `export function contextKeyAction({ liftPrompt, indoors, doorPrompt, hop = null }) {`, and insert `if (hop) return hop;` between `if (indoors) return 'leave';` and `return doorPrompt ? 'enter' : null;`. Update the comment above it: `... leaving over a hop (#701: up / down the Plattform) over a glowing door`.
- [ ] **Step 4: `strings.js`**, one small insert per language block, next to the `barLift:` line (anchor on that text), and `hopUpPrompt` / `hopDownPrompt` next to `enterPrompt:`, `keyHop` next to `keyLeave:`:

| key | en | de |
|---|---|---|
| `barHopUp` | `'up to the deck'` | `'hinauf'` |
| `barHopDown` | `'down'` | `'hinunter'` |
| `hopUpPrompt` | `'E · Up to the deck'` | `'E · Aufs Deck'` |
| `hopDownPrompt` | `'E · Down'` | `'E · Hinunter'` |
| `keyHop` | `'Plattform Sisslerfeld: at the door up to the deck, on the deck at the stair down to the door'` | `'Plattform Sisslerfeld: an der Tür hinauf aufs Deck, auf dem Deck an der Treppe hinunter zur Tür'` |

- [ ] **Step 5:** Run `node --test tests/controls.test.mjs tests/strings.test.mjs` until green (the `conflicts()` test must stay green: no key change).
- [ ] **Step 6:** Commit `feat(tower): E context key gets up and down hop actions (#701)`.

---

### Task 3: Wire it into the game (`index.html`)

**Files:** Modify `index.html`

All edits are inserts anchored on the exact text quoted. No other line is touched.

- [ ] **Step 1: import.** In the line starting `import { PLATTFORM, plattformFrame, facingToRoad, stairTreads, plattformWalk,` add `plattformHop, plattformHopLanding` inside the braces (before `} from './plattform.js'`).
- [ ] **Step 2: state + action.** Directly above the line starting `function contextAction() { return FOOT.on ? contextKeyAction({` insert:

```js
// #701: the Plattform shortcut -- 'up' at the door, 'down' on the deck by the stair; not while hovering
const platHop = () => FOOT.on && !FOOT.hover && PLAT ? plattformHop(PLAT.frame, PLAT.base, P) : null;
function platHopGo(dir) { const l = plattformHopLanding(PLAT.frame, PLAT.base, dir); P.x = l.x; P.z = l.z; P.th = l.th; P.y = l.y; P.vx = P.vz = P.vy = 0; FOOT.vy = 0; FOOT.eye = null; restShadow(); }
```
In `contextAction`, change `doorPrompt: !!HUD.enter }` to `doorPrompt: !!HUD.enter, hop: platHop() }`.
- [ ] **Step 3: run it.** In `runContextKey`, the chain `else if (a === 'enter') pressEnter(); }` becomes `else if (a === 'up' || a === 'down') platHopGo(a); else if (a === 'enter') pressEnter(); }`.
- [ ] **Step 4: prompt.** In `stepEnter`, directly after the line `HUD.enter = enterPrompt(near) && near;` insert:

```js
  const hop = platHop(); if (hop) { $('prompt').textContent = tr(hop === 'up' ? 'hopUpPrompt' : 'hopDownPrompt'); HUD.enterShown = true; return; }   // #701: the shortcut's prompt wins over the plain "Enter"
```
- [ ] **Step 5: help row.** After the line containing `data-i18n="keyEnter"` insert `      <kbd data-cmd="KeyE">E</kbd><span data-i18n="keyHop">Plattform Sisslerfeld: at the door up to the deck, on the deck at the stair down to the door</span>` (same indentation).
- [ ] **Step 6: test hook.** Next to `window.__mm.plattform = () => PLAT && {` add `window.__mm.platHop = () => platHop();   // #701: tests`.
- [ ] **Step 7:** `node --check`-style sanity is not possible for inline module scripts; instead run `node --test tests/*.test.mjs` for the files named in Global Constraints, then commit `feat(tower): hop up and down the Plattform with E (#701)`.

---

### Task 4: Tutorial hints name the shortcut

**Files:** Modify `strings.js`, `tutorial.js`, `tests/tutorial.test.mjs`

- [ ] **Step 1: Failing tests** in `tests/tutorial.test.mjs`:

```js
test('tutorialHint_Climb_TouchHasItsOwnTextAndBothNameTheShortcut', () => {
  assert.equal(tutorialHint(at('climb'), true, false).key, 'tutStepClimb');
  assert.equal(tutorialHint(at('climb'), true, true).key, 'tutStepClimbTouch');
  for (const lang of ['en', 'de']) {
    assert.match(translate(lang, 'tutStepClimb', '@', 1, 3), /E/, lang);
    assert.ok(translate(lang, 'tutStepClimbTouch', '@', 1, 3).includes('@'), `${lang}: the how marker survives`);
  }
});
```
(Import `translate` the way `tests/controls.test.mjs` does.) Existing assertions `tutorialHint(at('drive'), ...)` stay unchanged. The existing `tutStepDown` test checks only keys, so it stays green.
- [ ] **Step 2: `tutorial.js`.** In `tutorialHint`, directly before the line `if (d.needs === 'car' && foot) return` insert:
`if (d.id === 'climb' && foot && coarse) return { key: 'tutStepClimbTouch', how: howTo(d, coarse), n: st.cp + 1, of: st.cps };`
(`d.needs === 'foot'` and the wrong-body hint for a player still in the car stay as they are, because `foot` is checked here.)
- [ ] **Step 3: `strings.js`.** Replace the template bodies, keep the arrow-function signature `(how) =>`:

| key | en | de |
|---|---|---|
| `tutStepClimb` | `` `Walk with ${how} through the door and up the stair onto the deck, or press E at the door to jump up` `` | `` `Geh mit ${how} durch die Tür und die Treppe hoch auf die Plattform, oder drück E an der Tür, um hinaufzuspringen` `` |
| `tutStepClimbTouch` (new) | `` `Walk with ${how} through the door and up the stair onto the deck, or tap the button at the door to jump up` `` | `` `Geh mit ${how} durch die Tür und die Treppe hoch auf die Plattform, oder tipp an der Tür auf die Taste, um hinaufzuspringen` `` |
| `tutStepDown` | append `, or press E at the stair to jump down` | append `, oder drück E an der Treppe, um hinunterzuspringen` |
| `tutStepDownTouch` | append `, or tap the button at the stair to jump down` | append `, oder tipp an der Treppe auf die Taste, um hinunterzuspringen` |

For `tutStepDown*`, the sentence currently ends `... and down. To look around: ...`; insert the clause after `and down` / `und hinunter`, before the full stop, so the look-around sentence stays last. Keep the existing `(how)` interpolation. Check how the touch variant of `tutStepClimb` is existing-only in `en`: the same `tutStepClimb` was used for touch before; no other caller needs it.
- [ ] **Step 4:** Run `node --test tests/tutorial.test.mjs tests/strings.test.mjs`. Fix until green.
- [ ] **Step 5:** Commit `feat(tutorial): hints name the deck shortcut (#701)`.

---

### Task 5: Playwright test (one file)

**Files:** Modify `tests/test_plattform_stair.py`

- [ ] **Step 1:** Replace `test_e_at_the_door_says_the_stair_is_open` (it asserts the old toast; at the door E now hops) by two tests using the file's own helpers (`open_world`, `plattform`, `polar`, `on_foot_at`, `key`, `needs_world`):

```python
@needs_world
def test_e_at_the_door_jumps_up_to_the_deck_and_e_at_the_stair_back_down(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        ex, ez = polar(page, 0, 2.0)
        on_foot_at(page, ex, ez, plat["facing"] + math.pi, plat["base"])
        page.wait_for_function("() => window.__mm.platHop() === 'up'", timeout=120000)   # one rendered frame; headless draws under 1 fps
        prompt = page.evaluate("() => window.__mm.keybar().action")
        key(page, "e", 300)
        up = page.evaluate("() => ({ ...window.__mm.foot(), hop: window.__mm.platHop() })")
        page.wait_for_function("() => window.__mm.platHop() === 'down'", timeout=120000)
        key(page, "e", 300)
        down = page.evaluate("() => ({ ...window.__mm.foot(), hop: window.__mm.platHop() })")
        b.close()
    assert errors == []
    assert prompt == "up", prompt
    assert abs(up["y"] - plat["deckY"]) < 0.3 and up["hop"] == "down", up
    assert abs(down["y"] - plat["base"]) < 0.3 and down["hop"] == "up", down
    assert math.hypot(down["x"] - ex, down["z"] - ez) < 1.5, down
```
Check the real shape of `window.__mm.foot()` (grep `window.__mm.foot =` in `index.html`) and use its height field name; adjust the assertions to it.

```python
@needs_world
def test_hover_at_the_door_offers_no_hop_and_the_stair_still_works(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        ex, ez = polar(page, 0, 2.0)
        on_foot_at(page, ex, ez, plat["facing"] + math.pi, plat["base"])
        page.evaluate("() => { window.__mm.setFootY(window.__mm.plattform().base + 3); }")   # mid-stair height
        none = page.evaluate("() => window.__mm.platHop()")
        b.close()
    assert none is None and errors == []
```
(The existing tests `test_from_the_top_of_the_upper_flight_the_walker_reaches_the_deck` and the parapet test already prove the stair still walks; do not duplicate them.)
- [ ] **Step 2:** Commit and push the branch (`git push`), then run only this file in the foreground with the memory cap from Global Constraints and a `timeout` of 600000. If a test fails after 3 attempts, stop and report.

---

### Task 6: CHANGELOG

**Files:** Modify `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]` / `### Added`, insert at the **top** of that list (newest first), with a blank line after it (blank lines between entries), a player-facing English entry timestamped Swiss time now (`TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`):

```markdown
- `<YYYY-MM-DD HH:MM>` A **shortcut up the Plattform Sisslerfeld**: on foot at the door press <kbd>E</kbd> (on a phone, tap the button that appears) to jump straight up to the **viewing deck**, and press <kbd>E</kbd> again by the stair opening to jump back down to the door. Walking the stair still works. The tutorial mentions it.
```
Match the neighbouring entries' bullet and `<kbd>` style exactly; if the section's entries are separated by blank lines in one subsection and not another, follow the lines directly above.
- [ ] **Step 2:** Commit `docs(changelog): deck shortcut (#701)`.

---

### Final check

- [ ] `node --test tests/plattform.test.mjs tests/controls.test.mjs tests/tutorial.test.mjs tests/strings.test.mjs tests/enterables.test.mjs` all green.
- [ ] `tests/test_plattform_stair.py` green (foreground).
- [ ] `git diff origin/main --stat` touches only the files listed under File Structure; the PR description follows the repo template and ends with `Closes #701`.
