# Entrance glow visible earlier (#702) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On foot, an entrance glows from 60 m instead of 15 m, and the glow is clearly visible early. After the tutorial's jump (within 60 m of the Plattform), the door glows right when you get out.

**Architecture:** Two edits in the pure module `enterables.js`:
- the constant `GLOW_RANGE`
- the curve in `glowStrength`

The runtime (`index.html:4044–4057`, `stepEnterGlow`) already uses both, unchanged.

**Tech Stack:** Buildless vanilla-JS ES modules; `node --test` for pure modules; pytest + Playwright for the browser test.

**Spec:** `docs/superpowers/specs/2026-11-07-entrance-glow-range-design.md`

## Global Constraints

- `GLOW_RANGE = 60` (metres) for every enterable. No per-entrance or tutorial-only range.
- `PROMPT_RANGE` stays 2.5. The E prompt distance does not change.
- The curve is `smoothstep(sqrt(t))`, `t = clamp((GLOW_RANGE − d) / (GLOW_RANGE − PROMPT_RANGE), 0, 1)`.
- No new files, no dependencies. `index.html` is not touched.
- Run only `tests/enterables.test.mjs` and `tests/test_on_foot.py -k glows`, in the foreground. Never the full Playwright suite.
- The CHANGELOG entry is hand-written and player-facing, under `## [Unreleased]` → `### Changed`. Never `git cliff -o`.

## Review Focus

- **The far edge has no jump:** at `d` just under 60 the strength must be small (< 0.1 at 59 m), not pop in. The `sqrt` must not make the edge steep. The test asserts `glowStrength(59) < 0.1`.
- **At the door it is still exactly 1:** `d <= 2.5` → 1. Between, it is strictly below 1 and strictly falling (the existing monotone loop).
- **In the car nothing glows:** the browser test's `driving` assertion stays as is.

---

### Task 1: 60 m glow range with an early curve

**Files:**
- Modify: `enterables.js:8` (`GLOW_RANGE`)
- Modify: `enterables.js:82–86` (comment + `glowStrength`)
- Modify: `tests/enterables.test.mjs:1–8` (import `TUT`) and `:133–146` (`glowStrength` test)
- Modify: `tests/test_on_foot.py` (`test_a_ready_entrance_glows_on_foot_only`)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes `TUT.jumpNearM` from `tutorial.js:5` (`export const TUT = { …, jumpNearM: 60, … }`).
- Produces: `GLOW_RANGE` (number, 60) and `glowStrength(d: number) → number in [0, 1]`. Same names and signature as today.

- [ ] **Step 1: Write the failing tests**

In `tests/enterables.test.mjs`, add after the `STRINGS` import line (line 8):

```js
import { TUT } from '../tutorial.js';
```

Replace the whole test `glowStrength_FarEdgeZero_NearOne_MonotoneBetween` with:

```js
test('glowStrength_FarEdgeZero_NearOne_MonotoneBetween', () => {
  assert.equal(GLOW_RANGE, 60);
  assert.equal(PROMPT_RANGE, 2.5);
  for (const d of [60, 60.1, 100]) assert.equal(glowStrength(d), 0, `d=${d}`);
  for (const d of [2.5, 2, 0, -1]) assert.equal(glowStrength(d), 1, `d=${d}`);
  let prev = 1;
  for (let d = PROMPT_RANGE + 0.01; d < GLOW_RANGE; d += 0.01) {
    const k = glowStrength(d);
    assert.ok(k < prev, `not increasing towards the door at d=${d}`);
    assert.ok(k < 1 && k > 0, k);
    prev = k;
  }
});

test('glowStrength_TutorialJumpRadius_GlowsEarlyWithoutPopping', () => {   // #702
  assert.ok(GLOW_RANGE >= TUT.jumpNearM, 'after the tutorial jump the door is in glow range');
  assert.ok(glowStrength(59) < 0.1, `edge fades in: ${glowStrength(59)}`);
  assert.ok(glowStrength(50) > 0.3, `visible at 50 m: ${glowStrength(50)}`);
  assert.ok(glowStrength(30) > 0.75, `clear at 30 m: ${glowStrength(30)}`);
});
```

In `tests/test_on_foot.py`, `test_a_ready_entrance_glows_on_foot_only`, replace

```python
        mid, near, far = glows_at(10), glows_at(2), glows_at(20)
```

with

```python
        mid, near, early, far = glows_at(10), glows_at(2), glows_at(20), glows_at(65)   # #702: glows from 60 m
```

and replace

```python
    assert near[0]["opacity"] == 1 and far == [], (near, far)
```

with

```python
    assert near[0]["opacity"] == 1 and far == [], (near, far)
    assert len(early) == 1 and early[0]["opacity"] > 0.5, early
```

(`opacity` is `k * pulse` with a pulse of 0.7 to 1. At 20 m, k ≈ 0.93, so the opacity is ≥ 0.65.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/enterables.test.mjs`
Expected: FAIL. `assert.equal(GLOW_RANGE, 60)` reads 15, and `GLOW_RANGE >= TUT.jumpNearM` fails.

Run: `python3 -m pytest tests/test_on_foot.py -k glows -v` (foreground)
Expected: FAIL on `len(early) == 1`, because `early` is `[]` at 20 m.

- [ ] **Step 3: Write the minimal implementation**

In `enterables.js:8`, replace

```js
export const GLOW_RANGE = 15;   // the entrance glows from here (on foot)
```

with

```js
export const GLOW_RANGE = 60;   // the entrance glows from here (on foot); #702: = the tutorial's jump radius TUT.jumpNearM, so the door glows when you get out
```

In `enterables.js:82–86`, replace

```js
// 0 at GLOW_RANGE, smoothstepped to 1 at PROMPT_RANGE and nearer
export function glowStrength(d) {
  const t = Math.max(0, Math.min(1, (GLOW_RANGE - d) / (GLOW_RANGE - PROMPT_RANGE)));
  return t * t * (3 - 2 * t);
}
```

with

```js
// 0 at GLOW_RANGE, 1 at PROMPT_RANGE and nearer; #702: smoothstep of sqrt(t) rises early (~0.4 at 50 m, ~0.8 at 30 m) yet fades in at the edge
export function glowStrength(d) {
  const t = Math.max(0, Math.min(1, (GLOW_RANGE - d) / (GLOW_RANGE - PROMPT_RANGE))), s = Math.sqrt(t);
  return s * s * (3 - 2 * s);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/enterables.test.mjs tests/tutorial.test.mjs`
Expected: all PASS.

Run: `python3 -m pytest tests/test_on_foot.py -k glows -v` (foreground)
Expected: PASS.

- [ ] **Step 5: Add the CHANGELOG entry**

Under `## [Unreleased]` → `### Changed` in `CHANGELOG.md`, add at the top of that section, with the current time:

```markdown
- `YYYY-MM-DD HH:MM` The **glow at an entrance** (Plattform Sisslerfeld, Bodenackerstrasse 6c) now shows from **60 m** away on foot instead of 15 m, and is clearly bright well before you reach the door. In the tutorial, the Plattform door is already glowing when you get out after the jump.
```

- [ ] **Step 6: Commit and push**

```bash
git add enterables.js tests/enterables.test.mjs tests/test_on_foot.py CHANGELOG.md
git commit -m "fix(enterables): let entrances glow from 60 m with an early curve

Closes #702"
git push
```
