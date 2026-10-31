# Smooth eye height on steps (#592) Implementation Plan

**Goal:** the on-foot camera eases step-ups/downs over ~0.15 s; physics unchanged. Spec: `docs/superpowers/specs/2026-10-31-smooth-eye-on-steps-design.md`.

**Files:** modify `prototype/foot.js`, `prototype/index.html`, `prototype/tests/foot.test.mjs`, `CHANGELOG.md`.

**Run tests:** `node --test prototype/tests/foot.test.mjs`, then `node --test prototype/tests/*.test.mjs`.

## Task 1 - Pure helper `easeEye` (TDD)

- [ ] **Step 1: Write the failing tests** (append to `prototype/tests/foot.test.mjs`; add `easeEye` to the import from `../foot.js`):

```js
const eyeOf = (st, y) => y + st.off;

test('easeEye_TreadSnapUp_EyeDoesNotJump', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  const before = eyeOf(st, 0);
  st = easeEye(st, 0.16, true, 1 / 60);
  assert.ok(Math.abs(eyeOf(st, 0.16) - before) < 0.16 * 0.4, 'eye moved far less than the 0.16 snap in one frame');
});

test('easeEye_AfterSnap_ConvergesToBodyWithin015s', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 0.16, true, 1 / 60);
  for (let i = 0; i < 9; i++) st = easeEye(st, 0.16, true, 1 / 60);
  assert.ok(Math.abs(st.off) < 0.16 * 0.1);
});

test('easeEye_StairClimb_NoFrameJumpAboveThreshold', () => {
  let st = easeEye(null, 0, true, 1 / 60), y = 0, last = eyeOf(st, y), worst = 0;
  for (let i = 1; i <= 120; i++) {
    if (i % 8 === 0) y += 0.16;   // a tread every 8 frames, as on the Plattform spiral
    st = easeEye(st, y, true, 1 / 60);
    worst = Math.max(worst, Math.abs(eyeOf(st, y) - last)); last = eyeOf(st, y);
  }
  assert.ok(worst < 0.08, `worst frame jump ${worst}`);
});

test('easeEye_StepDown_Symmetric', () => {
  let st = easeEye(null, 0.16, true, 1 / 60);
  st = easeEye(st, 0, true, 1 / 60);
  assert.ok(st.off > 0 && st.off <= 0.16);
});

test('easeEye_Teleport_NoLag', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 12, true, 1 / 60);   // more than stepUp
  assert.equal(st.off, 0);
});

test('easeEye_NotSteady_FollowsBodyExactly', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 0.16, true, 1 / 60);
  st = easeEye(st, 0.2, false, 1 / 60);   // jump, hover or lift
  assert.equal(st.off, 0);
});

test('easeEye_SmallRamp_NotAbsorbed', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 0.02, true, 1 / 60);
  assert.equal(st.off, 0);
});
```

- [ ] **Step 2:** run, expect FAIL (`easeEye` not exported).

- [ ] **Step 3: Implement** in `prototype/foot.js` after `walkStep`:

```js
// #592: the camera's eye height eases out over a tread snap; the body's y (physics) stays exact.
export const EYE_EASE = { tau: 0.05, minStep: 0.05 };
export function easeEye(prev, y, steady, dt, cfg = WALKER, ease = EYE_EASE) {
  if (!prev || !steady) return { y, off: 0 };
  const dy = y - prev.y;
  if (Math.abs(dy) > cfg.stepUp) return { y, off: 0 };
  const raw = Math.abs(dy) >= ease.minStep ? prev.off - dy : prev.off;
  return { y, off: clamp(raw * Math.exp(-dt / ease.tau), -cfg.stepUp, cfg.stepUp) };
}
```

- [ ] **Step 4:** run, expect PASS. Commit `feat(foot): easeEye helper for a smooth stair camera (#592)`.

## Task 2 - Wire into the foot camera

- [ ] **Step 1:** `prototype/index.html:630`: add `easeEye` to the `./foot.js` import. Add `eye: null` to `const FOOT = {...}` (line 3448).
- [ ] **Step 2:** change `footCamera` (line 3780) to take `dt`:

```js
function footCamera(dt) { const steady = !FOOT.hover && FOOT.vy === 0 && !LIFT_RIDE.busy; FOOT.eye = easeEye(FOOT.eye, P.y, steady, dt); const v = footView(P.x, P.y + FOOT.eye.off, P.z, P.th, FOOT.pitch, WALKER.eye, CAM.back); /* rest of the body unchanged */ }
```
  Keep the rest of the original body (`camPos.set(...)`, `lookAt`, `setCameraNear`) exactly as it is.
- [ ] **Step 3:** in `stepCamera`: `if (FOOT.on) footCamera(dt);`
- [ ] **Step 4:** `FOOT.eye = null` in `endFoot()` (line 3568), `window.__mm.place` (3823), `window.__mm.setFootY` (3893), and where on-foot starts (grep `FOOT.on = true`).
- [ ] **Step 5:** `node --test prototype/tests/*.test.mjs`; run the existing `test_plattform_stair.py` once to confirm physics unchanged. No other Playwright runs.

## Task 3 - Changelog and PR

- [ ] Under `[Unreleased]` in `CHANGELOG.md` (newest first; timestamp via `TZ=Europe/Zurich date '+%F %H:%M'`): ``- `<ts>` Walking up **stairs** no longer judders: the view glides over each step.``
- [ ] Commit `fix(foot): smooth the eye height on steps (#592)`; PR body `Closes #592`.
