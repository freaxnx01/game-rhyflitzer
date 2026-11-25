# #1180 pause menu: no Restart race in a multiplayer race - plan

Goal: `pauseIds()` drops `pauserestart` while `NET.race` is set and not over. Spec: `docs/superpowers/specs/2026-11-24-mp-pause-no-restart-design.md`. Buildless game: node test + one tiny Playwright change; do not run the full Playwright suite.

Files: `pause.js`, `tests/pause.test.mjs`, `index.html` (lines ~7268, ~7809), `tests/test_multiplayer_race_start.py`, `CHANGELOG.md`.

## Task 1 - failing node test, then the pure rule

1. Edit `tests/pause.test.mjs`: add `withoutRestartInNetRace` to the import from `../pause.js`, and append:

```js
test('withoutRestartInNetRace_RaceRunning_DropsRestart', () => {
  const ids = pauseButtonsFor('trial');
  const out = withoutRestartInNetRace(ids, { over: false });
  assert.ok(!out.includes('pauserestart'));
  assert.deepEqual(out, ids.filter(id => id !== 'pauserestart'));
});

test('withoutRestartInNetRace_RaceOver_KeepsRestart', () => {
  const ids = pauseButtonsFor('trial');
  assert.deepEqual(withoutRestartInNetRace(ids, { over: true }), ids);
});

test('withoutRestartInNetRace_NoNetRace_KeepsRestart', () => {
  const ids = pauseButtonsFor('trial');
  assert.deepEqual(withoutRestartInNetRace(ids, null), ids);
});

test('withoutRestartInNetRace_DoesNotChangeItsInput', () => {
  const ids = [...pauseButtonsFor('trial')];
  withoutRestartInNetRace(ids, { over: false });
  assert.deepEqual(ids, pauseButtonsFor('trial'));
});
```

2. Run `node --test tests/pause.test.mjs`; verify: the new tests fail (import missing).
3. In `pause.js`, after `withLobbyButton`, add:

```js
// #1180: a restart would leave the shared start, so a multiplayer race (grid until the result) has no "Restart race"
export function withoutRestartInNetRace(ids, netRace) {
  if (!netRace || netRace.over) return ids;
  return ids.filter(id => id !== 'pauserestart');
}
```

4. Run `node --test tests/*.test.mjs`; verify: all green.

## Task 2 - wire it into index.html

1. Import `withoutRestartInNetRace` wherever `withLobbyButton` is imported from `./pause.js` (grep for it).
2. Line ~7809, in `pauseIds`: apply the rule after the timetable filter, before the lobby button:

```js
const pauseIds = () => { const ids = withoutRestartInNetRace(pauseButtonsFor(R.mode).filter((id) => id !== 'pausetimetable' || POSTAUTO.ready), NET.race); return netHostDriving() ? withLobbyButton(ids) : ids; };
```

(keep the existing trailing comments on that line.)
3. Line ~7268 in `netStartSession`: delete the `$('pauserestart').hidden = race;` line (openPause owns it). Leave the reset in the session-end code (~7282).
4. verify: `node --test tests/*.test.mjs` green.

## Task 3 - extend the existing race test (no new test)

In `tests/test_multiplayer_race_start.py::test_race_start_holds_then_releases_both`, the final `assert host.is_hidden("#pauserestart")` passes today without ever opening the menu. Replace it so it opens the pause menu on both pages first:

```python
    for page in (host, guest):
        page.click("#pausebtn")
        assert page.is_hidden("#pauserestart")
        page.click("#pauseresume")
```

Run only this test, in the foreground: `python3 -m pytest tests/test_multiplayer_race_start.py -x`. It is slow (two pages); it is the only browser run needed.

## Task 4 - changelog and commit

Add under `[Unreleased]` in `CHANGELOG.md`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:
`- \`<timestamp>\` The pause menu in a multiplayer race no longer offers **Restart race**.`
Commit: `fix(multiplayer): no Restart race in the pause menu during a race (#1180)`, then PR (never push to main).
