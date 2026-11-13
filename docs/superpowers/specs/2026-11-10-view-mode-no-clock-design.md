# Viewpoint hunt without a clock (#824) — design

Issue: #824. Related: #508 (viewpoint hunt), #534 / #551 (tutorial and cruise already hide the clock).

## Decision

Maintainer, 2026-11-10 (issue comment): **option A, view mode without a clock.** No running clock in the HUD, the
result shows photos and points only, no time. Hunt and blitz stay unchanged.

## Why

The viewpoint score never uses time: `VIEW.base` 100 plus up to `VIEW.bonus` 50 per photo (`viewpoints.js:5`). A running
clock suggests pressure that does not exist. `hudfade.js:45-46` ("Blitz, hunt and view are timed") was a default, not a rule.

## Design

Follow the cruise / tutorial pattern exactly: a body class hides the plate in CSS, and `visibleInMode` mirrors it.

1. **HUD.** `renderModeLine` (`index.html:5262`) toggles `body.view` next to `cruise` / `tutorial`. One CSS rule beside
   line 109: `body.view #tr{display:none}`. `#tr` holds the clock (`#time`) and `#best`, so both go. Pips, `#arrow`,
   `#dist` and the target stay (only `#tr` is hidden, unlike `body.cruise`).
2. **hudfade mirror.** `visibleInMode` (`hudfade.js:48`): `view` returns `id !== 'tr' && id !== 'best'`, same as tutorial.
   Update the comment (`hudfade.js:45-46`): only blitz and hunt are timed, plus the trial.
3. **Result.** `resultHtml` view branch (`index.html:5372`): drop `<small>${tr('time')} ${fmt(last.t)}</small>`. The
   screen keeps `viewAllShot` and `viewPoints`, plus the album below it.
4. **Unchanged on purpose.**
   - `R.t` keeps running in `stepView` and stays in `R.last` (`index.html:5306`). It is not shown anywhere, but
     `trackModeEnd` sends `seconds: R.t` to analytics (`index.html:6376`), so removing it would change the stats.
   - `modeText` / `viewFinishedText` (`strings.js:157`, `813`) mention no time: no change.
   - No best time exists for view mode (no `localStorage` key; only hunt, blitz and trial have one), so nothing to remove.
   - The pause menu, hunt, blitz and trial: untouched.

## Acceptance criteria

- In view mode `#tr` is not displayed (computed `display: none`); `#pips` and `#arrow` still show.
- The view result text contains the photo and points lines and no `Time` / `Zeit` line.
- `visibleInMode('tr' | 'best', 'view')` is false; every other id and mode is as before (trial, blitz, hunt keep `tr`).
- Hunt and blitz HUD and results are unchanged.

## Assumptions

- **A1** [high] Hide the whole `#tr` plate, not just `#time`. Rejected: keeping `Best —`. `#best` lives inside `#tr`
  (`index.html:414-418`) and view mode has no best (no storage key), so it would be a dead label.
- **A2** [high] `R.t` keeps counting for analytics. Rejected: stopping the clock. `index.html:6376` reports `seconds: R.t`.
- **A3** [med] No changelog line for a removed best time: none existed.

## Consequences

- Analytics `mode-end` for view keeps `seconds`, so dashboards stay comparable.
- `hudfade` no longer samples `best` in view mode (`fadeValues`, `index.html:6234`); nothing else reads it.
