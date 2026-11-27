# Radio station wrap (#1172) Implementation Plan

**Goal:** Rock and Cruise start again from the first song after their last, and previous wraps to the last.
**Spec:** `docs/superpowers/specs/2026-11-27-radio-station-wrap-design.md`
**Files:** `radio.js`, `index.html` (line ~5069), `tests/radio.test.mjs`, `CHANGELOG.md`.
Run only `node --test tests/radio.test.mjs` (no Playwright, no full suite).

## Task 1 - Failing test first

Add to `tests/radio.test.mjs` (add `stepPos` to the existing import from `../radio.js`):

```js
test('stepPos_StationShorterThanTracks_WrapsAtItsOwnLength', () => {
  for (const station of ['mix', 'rock', 'cruise']) {
    for (const shuffle of [false, true]) {
      const first = FM[station].tracks[0];
      const order = stationOrder(station, shuffle, first, () => 0.5);
      const last = order.length - 1;
      assert.equal(order[stepPos(last, 1, order.length)], order[0], `${station} shuffle=${shuffle}: next wraps last->first`);
      assert.equal(order[stepPos(0, -1, order.length)], order[last], `${station} shuffle=${shuffle}: prev wraps first->last`);
      assert.equal(stepPos(1, 1, order.length), order.length > 2 ? 2 : 0);
      assert.equal(stepPos(1, -1, order.length), 0);
    }
  }
});
```

Run `node --test tests/radio.test.mjs`. Expected: fails (`stepPos` is not exported). Commit the test alone.

## Task 2 - The fix

In `radio.js`, right after `prevTrack` (line 68), add:

```js
export const stepPos = (pos, dir, n) => (dir > 0 ? nextTrack : prevTrack)(pos, n);
```

In `index.html`, add `stepPos` to the `radio.js` import on line 1171, then replace line 5069:

```js
  function step(dir) { S.pos = stepPos(S.pos, dir, S.order.length); S.track = S.order[S.pos]; }
```

Do not touch `nextTrack` / `prevTrack` (the existing `nextTrack_prevTrack_Wrap` test pins their default).
Run `node --test tests/radio.test.mjs`. Expected: all pass. Run `node --check` is not needed for the inline module;
instead `grep -n "stepPos" index.html radio.js` must show the import and the one call.

## Task 3 - Changelog

Under `## [Unreleased]` / `### Fixed` (create the heading above `### Changed` if missing), newest first. Take the
timestamp from `TZ=Europe/Zurich date '+%F %H:%M'` at the time of the change:

```markdown
- `<timestamp>` **Rhyflitzer FM**: **Rock** und **Cruise** werden nach dem letzten Lied nicht mehr stumm, sondern fangen wieder vorne an; mit <kbd>7</kbd> springst Du vom ersten Lied zum letzten zurück.
```

(<kbd>7</kbd> is the previous-track key, `radio.js` `KEY_ACTIONS`.) Commit tasks 2 and 3 together.

## Done when

`node --test tests/radio.test.mjs` is green, the new test failed before Task 2, and the changelog entry is present.
