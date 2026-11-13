# Viewpoint hunt without a clock (#824) — plan

Goal: view mode has no clock plate in the HUD and no time in the result. Spec: `docs/superpowers/specs/2026-11-10-view-mode-no-clock-design.md`.
Buildless game: Node unit test plus one Playwright file. Run only these, in the foreground.

Files: `hudfade.js`, `index.html`, `tests/hudfade.test.mjs`, `tests/test_viewpoints.py`, `CHANGELOG.md`.

## Task 1 — hudfade rule (TDD)

1. Failing test. In `tests/hudfade.test.mjs`, replace the test at line 98 so view joins tutorial and leaves the timed set:

```js
test('visibleInMode_MirrorsTheCruiseTutorialAndViewCss', () => {
  for (const id of ['tr', 'best', 'cps', 'pips', 'arrow', 'dist', 'cpname']) assert.equal(visibleInMode(id, 'cruise'), false, id);
  for (const id of ['tl', 'roadname', 'watername', 'gearplate', 'dmgplate', 'tripplate', 'keybar', 'br', 'speedo']) assert.equal(visibleInMode(id, 'cruise'), true, id);
  for (const m of ['tutorial', 'view']) { assert.equal(visibleInMode('tr', m), false, m); assert.equal(visibleInMode('best', m), false, m); }
  assert.equal(visibleInMode('arrow', 'tutorial'), true);
  assert.equal(visibleInMode('pips', 'view'), true);
  assert.equal(visibleInMode('arrow', 'view'), true);
  for (const m of ['trial', 'blitz', 'hunt']) for (const id of ['tr', 'best', 'pips', 'arrow', 'tl']) assert.equal(visibleInMode(id, m), true, `${m} ${id}`);
});
```

2. Run `node --test tests/hudfade.test.mjs`: fails on `view`.
3. Implement in `hudfade.js:48`:

```js
export function visibleInMode(id, mode) {
  if (mode === 'cruise') return !TRIAL_ONLY.has(id);
  if (mode === 'tutorial' || mode === 'view') return id !== 'tr' && id !== 'best';
  return true;
}
```

and the comment above it (lines 45-46): `body.view hides the clock (#824: the score never uses time). Trial, blitz and hunt are timed and show everything.`

4. Run the test again: green.

## Task 2 — HUD class and CSS

1. In `index.html`, `renderModeLine` (line 5262): after the `tutorial` toggle add
   `document.body.classList.toggle('view', R.mode === 'view');`. Add `// #824: view has no clock` to the trailing comment.
2. CSS next to line 109, a new rule on its own line:
   `body.view #tr{display:none}   /* #824: the viewpoint score never uses time, so no clock */`
3. Do not touch `body.cruise` or `body.tutorial` rules, and do not hide `#pips`, `#arrow`, `#dist`.

## Task 3 — Result without time (TDD)

1. Failing test. In `tests/test_viewpoints.py`, rename `test_all_viewpoints_end_the_run_with_points_and_time` to
   `test_all_viewpoints_end_the_run_with_points_and_no_time`, and extend the evaluate with the HUD plate, then assert:

```python
        got = page.evaluate("() => ({ result: document.querySelector('#result').textContent, again: document.querySelector('#viewbtn').textContent, last: window.__mm.views().last, clock: getComputedStyle(document.querySelector('#tr')).display, body: document.body.classList.contains('view') })")
    ...
    assert "Time" not in got["result"] and got["clock"] == "none" and got["body"] is True, got
```

   (Keep the existing asserts. The result string is English: the page runs with `locale="en-US"` like the other tests there.)
2. Implement in `index.html:5372` (`resultHtml`, view branch): delete `<small>${tr('time')} ${fmt(last.t)}</small>`, leaving
   `` `<small>${tr('viewAllShot')}</small>${tr('viewPoints', last.pts, last.max)}` ``.
3. Do not change `endView` (line 5306): `R.last.t` stays, analytics uses `R.t`.
4. Run `python3 -m pytest tests/test_viewpoints.py -q` and `node --test tests/hudfade.test.mjs` in the foreground (generous timeout). If the
   Playwright file passes, do not run the ~2 h full suite.

## Task 4 — Changelog and commit

Under `## [Unreleased]` → `### Changed` (create the heading if missing), one line in the file's style:

```
- `2026-11-10 HH:MM` The **Viewpoints** mode no longer shows a **running clock**: the score never depended on time, so the timer is gone from the screen and the result shows only your photos and points. Hunt and Blitz keep their clocks.
```

Use the real Swiss local time. Commit `fix(modes): view mode has no clock (#824)` with `Closes #824` in the body. Open the PR as usual.

## Out of scope (park, do not fix)

Best time or time bonus for view mode (option B), time in the result only (option C), any change to hunt or blitz.
