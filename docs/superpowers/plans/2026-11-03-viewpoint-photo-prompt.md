# Viewpoint photo prompt (#660) Implementation Plan

**Goal:** At a viewpoint, say clearly: face the sight, press X; remind when leaving without a photo. Spec: `docs/superpowers/specs/2026-11-03-viewpoint-photo-prompt-design.md`.

**Architecture:** Pure state machine `viewNoticeStep` in `viewpoints.js`; `stepView` in `index.html` feeds it and shows toasts; new strings in `strings.js` (en + de); `toastBig` + `#toast.big` CSS.

**Global constraints:** buildless, no new deps; do not touch the `keydown` dispatcher line or `#tc` layout (PR#647); German with capital Du/Dir, real umlauts; verify with `node --test tests/viewpoints.test.mjs` (no full Playwright suite); CHANGELOG entry under `[Unreleased]` in player voice.

## Task 1: `viewNoticeStep` (pure, TDD)

**Files:** `viewpoints.js`, `tests/viewpoints.test.mjs`

**Interface:**
```js
export const NOTICE = { cooldownS: 8 };
// st = { at: -1, cool: [] } (cool[i] seconds left); here = standingAt(...) index or -1; shot = booleans
// returns { st, event: null | { kind: 'arrive' | 'leave', i } }
export function viewNoticeStep(st, here, shot, dt)
```
Rules: cooldowns tick down by dt (min 0). `here !== st.at`: if `here >= 0` and cool[here] is 0, event arrive at here; if `here < 0` and `st.at >= 0` and `!shot[st.at]` and cool[st.at] is 0, event leave at st.at. Emitting an event sets cool of that viewpoint to `NOTICE.cooldownS`. `st.at` always becomes `here`. A leave caused by a scored photo (shot[at] true) emits nothing.

- [ ] **Step 1: Write the failing tests** (append to `tests/viewpoints.test.mjs`, importing `viewNoticeStep`, `NOTICE`):
```js
test('viewNoticeStep: arriving at an open viewpoint announces it once', () => {
  let r = viewNoticeStep({ at: -1, cool: [] }, 1, [false, false], 0.016);
  assert.deepEqual(r.event, { kind: 'arrive', i: 1 });
  r = viewNoticeStep(r.st, 1, [false, false], 0.016);
  assert.equal(r.event, null);
});
test('viewNoticeStep: leaving without a photo reminds, leaving after a scored photo does not', () => {
  const st = { at: 0, cool: [0, 0] };
  assert.deepEqual(viewNoticeStep(st, -1, [false, false], 0.016).event, { kind: 'leave', i: 0 });
  assert.equal(viewNoticeStep(st, -1, [true, false], 0.016).event, null);
});
test('viewNoticeStep: edge flicker is silenced by the cooldown, then works again', () => {
  let r = viewNoticeStep({ at: -1, cool: [] }, 0, [false], 0.016);   // arrive
  r = viewNoticeStep(r.st, -1, [false], 0.016);                      // leave inside cooldown
  assert.equal(r.event, null);
  r = viewNoticeStep(r.st, 0, [false], NOTICE.cooldownS + 1);         // back after the cooldown
  assert.deepEqual(r.event, { kind: 'arrive', i: 0 });
});
```
- [ ] **Step 2:** `node --test tests/viewpoints.test.mjs` -> the three fail (export missing).
- [ ] **Step 3: Implement** `viewNoticeStep` per the rules above (immutable: return a new `st`, new `cool` array; guard clause `if (here === st.at) return { st: ticked, event: null }`).
- [ ] **Step 4:** run the tests, all pass. Commit `feat(view): pure arrive/leave notice state machine (#660)`.

## Task 2: Strings

**Files:** `strings.js`

- [ ] Change `viewAimTarget` (en, `strings.js:150`) to ``(n) => `Photo (X): ${n}` `` and (de, `:660`) to ``(n) => `Foto (X): ${n}` ``.
- [ ] Add after `viewAim` in both blocks:
  - en `viewArrive: (n) => \`You are here! Face ${n} (follow the arrow) and press X for the photo\``, `viewLeft: (n) => \`No photo of ${n} yet: go back and press X\``
  - de `viewArrive: (n) => \`Du bist da! Schau zu ${n} (folge dem Pfeil) und drück X für das Foto\``, `viewLeft: (n) => \`Noch kein Foto von ${n}: zurück und X drücken\``
- [ ] Add a test in `tests/viewpoints.test.mjs` using `translate`/`STRINGS` from `../strings.js`: both languages define `viewArrive` and `viewLeft`; de `viewAimTarget('X')` contains `Foto (X)` and not `Ziel`; en/de `viewArrive('DSM-Kamin')` contain the name and `X`. Run, pass. Commit.

## Task 3: Wire into the game

**Files:** `index.html`

- [ ] CSS next to `#toast.show` (`:32`): `#toast.big{font-size:34px;padding:12px 24px}`.
- [ ] `toast`/`toastHtml` (`:4433-4434`): add `$('toast').classList.remove('big');` first. New `function toastBig(text, secs = TOAST_S.surprise) { $('toast').textContent = text; $('toast').classList.add('big'); showToast(secs); }`.
- [ ] `VIEW_RUN` / `startViewRun` (`:4423-4424`): add `notice: { at: -1, cool: [] }`.
- [ ] `stepView` (`:4452`): after the `endIn` line, if `R.state !== 'finished'`, `const r = viewNoticeStep(VIEW_RUN.notice, standingAt(VIEWPOINTS, VIEW_RUN.shot, shotPose()), VIEW_RUN.shot, dt); VIEW_RUN.notice = r.st; if (r.event) showViewNotice(r.event);` and define `showViewNotice(e)`: arrive -> `toastBig(tr('viewArrive', VIEWPOINTS[e.i].subjectN))`; leave -> `toast(tr('viewLeft', VIEWPOINTS[e.i].n), TOAST_S.event)`. Import `viewNoticeStep` where the other `viewpoints.js` names are imported.
- [ ] Do not edit the `keydown` dispatcher, `#tc` or the key bar.
- [ ] Add a read-only test hook only if needed; otherwise none.
- [ ] Run `node --test tests/viewpoints.test.mjs` plus `node --check`-style load of `strings.js`; no Playwright full suite. If the view test file `tests/test_viewpoints.py` asserts the old HUD text, run only that file and update the expected string to `Foto (X): ` / `Photo (X): `.
- [ ] Commit `feat(view): prompt for the X photo at a viewpoint, remind on leaving (#660)`.

## Task 4: Changelog

- [ ] `CHANGELOG.md` under `[Unreleased]`, player voice (de): "Aussichtspunkte: Am Aussichtspunkt sagt das Spiel jetzt deutlich, dass Du zum Motiv schauen und X drücken sollst, und erinnert Dich, wenn Du ohne Foto wegfährst. Die Anzeige oben heisst jetzt „Foto (X): Motiv“." Commit `docs(changelog): viewpoint photo prompt (#660)`.
