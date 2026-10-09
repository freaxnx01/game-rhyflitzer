# Blitz mode — the countdown that checkpoints top up (first slice of #128) — design

Status: approved in `/enrich --quick` (no human gate) 2026-10-09 · Issue #128 · depends on nothing unmerged · sibling of #107 (delivery) and #108 (surprise modes)

## Goal

Issue #128 asks for a brainstorm: what does *Crazy Taxi* (SEGA, 1999) have that the game could borrow, in modes and in look, and which of it is worth its own issue. This spec does the brainstorm (below, "What the game can borrow") and distils it into **one modest first slice** that is implementable now, with the rest listed as follow-up candidates — not created as issues, per the user.

**The slice: a Blitz mode.** The one mechanic that *is* the arcade feel of that game is its clock: you start with a short countdown, every delivered fare adds seconds, the clock is always almost out, and at the end you get a rank letter. The game already has the five checkpoints, the finish gate, the HUD clock, the pips and the result screen of a time trial (`prototype/index.html:1385-1400`). Blitz reuses all of it and changes only what the clock means: it counts **down** from 90 s, each checkpoint adds **60 s**, the run ends at the finish with a rank **S / A / B / C** by the seconds left — or ends early with "Time's up" when the clock hits zero. The concept doc lists exactly this mode for v0 under its MM1 name ("Blitz: checkpoints against the clock", `docs/01-concept.md:16-25`) and it does not exist yet.

Success: on the start screen a second button **Blitz** starts the same course with a countdown instead of a stopwatch; every checkpoint shows "+60 s" in its toast; the clock turns red under 10 s; the finish shows a rank letter and the best remaining time is saved; running out of time shows "Time's up" with the checkpoints reached. The time trial, its record and its tests are untouched.

No *Crazy Taxi* / SEGA names, logos, music or assets anywhere in the game (user). The mode is called **Blitz** — the MM1 word the concept already uses.

## Brainstorm — what the game can borrow (inspiration only)

Mechanics and feel of that game, checked against what the repo already has (verified 2026-10-09 on `main` @ `42b68df`):

| Hallmark | Already in the game? | Verdict |
|---|---|---|
| **Countdown clock that fares extend; rank letter at the end** | No — the race is a stopwatch (`R.t += dt`, `index.html:1396`), the result is a time (`resultHtml`, `:1398`). | **This slice.** |
| Pick up a passenger, drop them at a destination, tip by speed | #107 is this with pizza instead of a passenger: shift of 5 real addresses, Navi, per-order countdown, tips, best score (`docs/superpowers/specs/2026-10-03-delivery-mode-design.md`). Blocked on #106 (Navi, in `ai-implement`) and #104 (impact, `ai:failed`). | Follow-up: a **taxi variant of #107** (passenger silhouette, a pickup leg, one shared clock) *after* #107 lands. Not duplicated here. |
| A big arrow over the car pointing at the destination | Yes — `#arrow` in `#tc` turns to `R.target` every frame (`index.html:107`, `:1522`). | Done. |
| Boost launch ("dash") | Yes — **N** nitro (`D.accelNitro`, `:1095`). | Done. |
| Drift on the handbrake | Yes — **Ctrl** (`D.gripHandbrake`, `:1352`). | Done as physics; see stunts below. |
| Stunt bonuses: drift, air time, near-miss, with a combo counter | No scoring. Drift (`hb`, side slip `vs`) and air (`const air = P.y > gh + 0.15`, `:1348`) are measurable; near-miss needs traffic, which the concept puts in v1 (`01-concept.md:26`). | Follow-up: **stunt bonus seconds** — a drift or a jump adds 1–3 s to the Blitz clock with a combo toast. Builds on this slice. |
| Destination zone: a big glowing disc on the road | Checkpoints are pillars with a rotating ring (`cpObjs`, `:1084`). | Follow-up: **a flat glowing landing disc** at checkpoints and the finish, visible from far. Pure look. |
| Sunny, saturated, high-contrast look; bold UI | Two styles: Original (MM2, hard fog) and Smooth (slowroads, soft) — a deliberate two-style decision (`01-concept.md:28-41`). | Follow-up: an **"Arcade" third style** in the `STYLES` table (`index.html:1187`) — saturated flat colours, deep blue sky, no distance haze, no shadows. Cheap, but it reopens the two-style decision, so it gets its own issue. |
| Passenger shouts and a rank jingle | Synthesised SFX only (`SFX`, `:1216`). | Follow-up: **rank jingle and time's-up buzzer** — new sounds, not now. |
| Open city with fares anywhere | #108 (surprise modes for a 10-year-old) is being enriched in parallel. | Not touched here; a Blitz "surprise bonus" (a random checkpoint pays double) is a natural #108 idea. |

## Starting point (verified 2026-10-09 on `main` @ `42b68df`)

- **Race state.** `const R = { state: 'ready', t: 0, best: null, done: 0, shortcut: false, target: null }` (`index.html:1385`); `R.best` from `localStorage` `mm.best2` (`:1386`). `startRace()` (`:1393`) resets the checkpoints, `R.t = 0`, flags `jumped / auto / flown`, sets `'armed'` and hides the overlay. `stepRace(dt)` (`:1396`): `'armed'` → `'racing'` once the car moves; `R.t += dt` while racing; a checkpoint is credited within 7 m in `'racing'` or `'armed'` and not while flying; the finish gate within 7 m calls `finish()` while racing. `finish()` (`:1397`) records `mm.best2` only when `!R.jumped && !R.auto && !R.flown`, sets `R.last = { t, rec }` and shows the result. `renderOverlay()` (`:1400`) sets `#ovtext` and the Start button's text (`start` / `retry`); `resultHtml({ t, rec })` (`:1398`) renders the time, the not-counted notes and the best.
- **Checkpoints.** Five in any order plus the finish, in both layouts: hand (`CPS`, `:567`) and OSM (`L.anchors.cps`, `:573`). Straight-line legs in the OSM layout, start → the five in the listed order → finish: 824, 1854, 1062, 1022, 638, 1083 m, **6.5 km** in total (probe on `data/world_hochrhein.json`, 2026-10-09); by road about 8–9 km. The hand layout is the same course at the same scale.
- **HUD.** `#tl .mode` ("Time trial · Hochrhein", `data-i18n="mode"`, `:101`), `#cpn` / `#pips` (`updatePips`, `:1394`), `#tr .lbl` ("Time") + `#time` + `#best` (`:114-117`), set every frame in `hud()` (`:1522`): `$('time').innerHTML = fmt(R.t)`, `$('best').textContent = tr('best', …)`. `fmt(t)` renders `mm:ss<b>.d</b>` (`:1388`). Static strings are re-applied on a language change by `applyStaticStrings()` inside `rerenderAll()` (`:1456`), which would overwrite a mode line set by hand — so the mode line needs its own render step that runs after it.
- **Start screen.** `#overlay .row` holds `#startbtn` and `#stylebtn2` (`:201-204`); `$('startbtn').onclick` → `SFX.start(); startRace()` (`:1401`). #107 will add a **Delivery** button to the same row.
- **Pause (#83, merged).** `canPause(overlayHidden, raceState)` allows `'armed'` / `'racing'` (`prototype/pause.js`); `restartRace()` → `startRace()` (`:1408`); `toMainMenu()` sets `'ready'` (`:1409`).
- **Cheat flags.** J / map double-click set `R.jumped`, F sets `R.flown` (`takeOff`, `:1269`), O sets `R.auto`; `finish()` marks the run "not counted". `__mm.raceFlags()` exposes them (`:1291`); `__mm.finishNow()` calls `finish()` (`:1458`); `__mm.place(x, z, th)` teleports the car at rest (`:1273`); `__mm.sim(...)` steps `stepCar` only (`:1323`).
- **Strings.** `prototype/strings.js` (`en` / `de`, functions for interpolation); `strings.test.mjs` enforces equal keys, equal arity and no `ß`. Existing: `mode`, `time`, `best`, `cpToast(number, name)`, `finished`, `retry`, `notCounted*`, `viaHolz`, `bestLower`.
- **Tests.** Pure modules under `node --test prototype/tests/*.test.mjs`; browser tests pytest + Playwright under `prototype/tests/`, hand layout by routing the world JSON and the `.mmh` to 404 (`test_toast.py:start_hand`), `wait_for_function` on `window.__mm`, then `page.click("#startbtn")`. `test_i18n.py:106-121` and `test_boundaries.py:67` press **T** once and expect "Smooth" — untouched by this slice.
- **Persistence precedent.** `mm.best2` and `mm.odo` persist (progress), every access in `try/catch`.

## Decisions

| Topic | Decision |
|---|---|
| Mode | `R.mode = 'trial' \| 'blitz'`, set by `startRace(mode)`; default `'trial'` so every existing caller is unchanged. `R.left` = seconds on the Blitz clock; `R.timeUp` = the run ended by the clock. Pure rules in `prototype/blitz.js` (no DOM, no three.js): `BLITZ` table, `tick`, `addBonus`, `isTimeUp`, `rankFor`, `isNewBest`. `index.html` keeps the glue. |
| Starting it | A second button **Blitz** (`#blitzbtn`, class `btn`) in `#overlay .row` between Start and Style; `onclick` → `SFX.start(); startRace('blitz')`. The Start button stays the time trial. After a run, the button of the mode just run reads **Retry**, the other keeps its name (A3). |
| Clock | `BLITZ = { start: 90, bonus: 60, low: 10 }` seconds. Counts down only while `'racing'` (the trial's stopwatch rule, `index.html:1396`), not while `'armed'` or paused. Each checkpoint credited adds `bonus` (no cap). Budget 90 + 5 × 60 = **390 s** for ~8.5 km by road ≈ 22 m/s average: tight for a first try, roomy once you know the course (A4). Tuning is a table edit. |
| Checkpoint | Same 7 m rule and pips; the toast reads `Checkpoint 2/5 · +60 s` (`cpToastBlitz(number, name, bonus)`) instead of `cpToast`. |
| Finish | The finish gate ends the run as today; `rank = rankFor(R.left)`: **S** ≥ 90 s left, **A** ≥ 60, **B** ≥ 30, **C** otherwise. Best = the **largest time left** at a clean finish, `mm.blitzBest` in `localStorage` (A5). Cheat flags (`jumped / auto / flown`) show the same "not counted" notes as the trial and skip the best, but the rank is still shown — it is the fun, not the record. |
| Time's up | `R.left` reaches 0 while racing: `R.state = 'finished'`, `R.timeUp = true`, the result shows **"Time's up"** and `n of 5 checkpoints`; no rank, no best, no sound (a buzzer is a follow-up). After the end the loop still runs `stepCar` (it skips only `'ready'`, `index.html:1528`) and the overlay covers the screen — exactly as after a trial finish today; unchanged. |
| HUD | In Blitz: `#tl .mode` → `Blitz · Hochrhein` (`modeBlitz`); `#tr .lbl` → `Time left` (`timeLeft`); `#time` shows `fmt(R.left)` and gets class `low` (red, `#ff5a3c`) under `BLITZ.low`; `#best` shows `blitzBest(time)` ("Best left 01:12.4"). A `renderModeLine()` sets the mode label and the time label; it runs from `startRace`, `toMainMenu` and at the end of `rerenderAll()` (after `applyStaticStrings`, which would otherwise reset them). In the trial everything reads as today. |
| Result screen | `renderOverlay()`: `#ovtext` → `blitzFinishedText` after a Blitz finish, `blitzTimeUpText` after time's up, unchanged otherwise. `resultHtml` branches on `R.last.mode`: Blitz finish → `<small>Rank</small>S<small>01:32.4 left · not-counted notes · best left 01:12.4</small>`; time's up → `<small>Time's up</small>2 / 5<small>checkpoints</small>`. |
| Pause | `canPause` unchanged (`'armed'` / `'racing'` are the same states). **Restart** → `startRace(R.mode)`. **Main menu** → unchanged; `R.mode` is kept so Retry labels are right. |
| Cheats | Unchanged. J, O, F, map jump set their flags as in the trial; the autopilot's "race run does not count" rule holds for Blitz too. |
| Both layouts | Hand and OSM: `CPS` / `FINISH` are already layout-independent names. No new data. |
| Strings | `blitz`, `modeBlitz`, `timeLeft`, `blitzIntro`, `blitzFinishedText`, `blitzTimeUpText`, `cpToastBlitz(number, name, bonus)`, `blitzRank`, `blitzLeft(time)`, `blitzBest(time)`, `blitzTimeUp`, `blitzCps(done)`, `keyBlitz` — en + de, through `tr()`. |
| Test hooks | `__mm.blitz()` → `{ mode, left, timeUp, rank, best, cps: [[x, z], …], finish: [x, z] }`; `__mm.blitzSetLeft(seconds)` sets the clock (so a test can run it out without driving 90 s). |
| Not in this slice | Stunt bonus seconds, a landing disc, an Arcade style, sounds, a taxi variant of #107, a separate Blitz best-rank display on the start screen, difficulty presets, a touch button for the mode (the start-screen button is already touchable). |

## Interactions with other features

- **#107 delivery:** adds its own `'delivery'` state and a fourth button to `.row`; no shared state with Blitz. Both call `startRace`-like setup separately. Order of merging does not matter.
- **#108 surprise modes:** untouched; Blitz gives it a clock to put surprises on (a double-bonus checkpoint, a time thief) later.
- **#83 pause:** Restart passes the mode; nothing else.
- **#18 autopilot / #10 helicopter / J:** flags as today; a flown or jumped Blitz shows the rank with the not-counted note.
- **#9 i18n:** language switch mid-run re-renders the mode line through `renderModeLine()`.
- **Concept doc:** Blitz is the v0 "Blitz" of `docs/01-concept.md:16-25`; no concept change.

## Acceptance criteria

- [ ] The start screen shows a **Blitz** button next to Start (en "Blitz", de "Blitz"); clicking it hides the overlay and starts the course with `__mm.blitz().mode === 'blitz'` and `left === 90`.
- [ ] While `'armed'` the clock does not move; once the car moves it counts down (`left` strictly decreasing between two frames while racing).
- [ ] Crediting a checkpoint adds 60 s and shows a toast containing `+60 s` (de: `+60 s`); the pips and `#cpn` update as in the trial.
- [ ] `#tl .mode` reads `Blitz · Hochrhein` / `Blitz · Hochrhein`, `#tr .lbl` reads `Time left` / `Restzeit`, `#time` shows the countdown and has class `low` when `left < 10`; after a language switch mid-run the labels are still the Blitz ones.
- [ ] Reaching the finish shows a rank letter in `#result` (`S` ≥ 90 s left, `A` ≥ 60, `B` ≥ 30, else `C`), the time left, and saves `mm.blitzBest` (largest time left) unless a cheat flag is set; a cheat flag shows the existing not-counted note and skips the best.
- [ ] When the clock reaches 0 while racing, the run ends: `#result` shows `Time's up` / `Zeit ist um` and `n / 5` checkpoints, no rank, `mm.blitzBest` untouched.
- [ ] After a Blitz run the Blitz button reads **Retry** / **Nochmals** and restarts Blitz; the Start button still starts the time trial. Pause → Restart restarts the mode that was running.
- [ ] The time trial is unchanged: `__mm.blitz().mode === 'trial'` after Start, `#time` counts up, `mm.best2` logic untouched; `node --test prototype/tests/*.test.mjs` passes (including the new `blitz.test.mjs`) and the existing `test_i18n.py` / `test_boundaries.py` / `test_pause.py` still pass.
- [ ] `CHANGELOG.md` `[Unreleased]` → `Added` has a player-facing entry for Blitz.
- [ ] No *Crazy Taxi* / SEGA name, logo, music or asset in the repo.

## Assumptions

- **A1** [med] The first slice of this brainstorm issue is a **mode** (Blitz), not a style. Rejected: an "Arcade" third style (cheaper, but `docs/01-concept.md:28-41` records a deliberate two-style decision from 2026-09-28 — reopening it deserves its own issue); a taxi/passenger mode (duplicates #107, which is specified and waiting on #106 `ai-implement` and #104 `ai:failed` — see its Task 0); stunt bonuses (need a clock to pay into; Blitz is that clock). Blitz is in the concept's v0 list (`01-concept.md:25`) and depends on nothing unmerged.
- **A2** [high] Follow-up ideas are listed in this spec, not created as issues. The user said so.
- **A3** [med] A second start-screen button, not a toggle or a key. Evidence: #107 made the same call for Delivery (its A12: I and O are taken, a mode switch is not a mid-drive key); the overlay `.row` already holds two buttons (`index.html:201-204`). Rejected: a mode selector dropdown (two modes do not need one).
- **A4** [med] `start 90 s, bonus 60 s, low 10 s`. Evidence: 6.5 km straight-line course (`data/world_hochrhein.json` anchors), ~8.5 km by road, ~22 m/s average on these roads (the autopilot's class caps are 30–60 km/h, `2026-10-03-autopilot-design.md`; a human with nitro is faster) → ~390 s. Rejected: per-leg budgets scaled by distance (any-order checkpoints make legs unpredictable); a fixed total with no bonus (then it is a trial with a cutoff, not the mechanic). The table is the tuning knob.
- **A5** [med] Rank thresholds S ≥ 90 / A ≥ 60 / B ≥ 30 / C; best = largest time left, persisted as `mm.blitzBest`. Evidence: `mm.best2` precedent for progress (`index.html:1386`, `:1397`). Rejected: rank by elapsed time (would just mirror the trial); persisting the rank letter (the number implies it).
- **A6** [high] Time's up ends the run on the result screen rather than letting the player finish with a penalty. Rejected: a penalty continuation (the point of the mode is the clock).
- **A7** [med] No new sound. Evidence: `SFX` is synthesised in `index.html:1216-1223`; a buzzer and a rank jingle are a follow-up candidate, and `SFX.finish()` at a Blitz finish is reused as-is.
- **A8** [high] New UI text through `tr()` with en and de entries; `strings.test.mjs` enforces equal keys and no `ß`.
- **A9** [med] `R.mode` is kept across `toMainMenu` so the Retry label is right; `R.mode` defaults to `'trial'` at load, so a fresh page behaves exactly as today.

## Consequences

- The start screen's `.row` grows to three buttons (Start, Blitz, Style), four once #107 lands; narrow phones wrap the row (`.row` is flex; check the 390 px viewport in the Playwright run).
- The time-trial record and the Blitz best are separate numbers; a player can hold one without the other.
- A Blitz run is bounded: at most 390 s plus the final leg, so a stuck or lost player is never more than ~6½ minutes from the result screen.
- `R.last` gains `mode`, `left`, `rank`, `timeUp`; anything reading `R.last.t` keeps working (the trial still sets it).
- The checkpoint toast text differs per mode; the toast test (`test_toast.py`) uses the **G** key toast, not the checkpoint toast, so it is unaffected.
- `rerenderAll()` runs `renderModeLine()` last, so a language switch during a Blitz run briefly shows the trial label for one call before it is overwritten — within the same synchronous function, never on screen.

## Follow-up candidates (not created — for the user to pick)

1. **Stunt bonus seconds** — a drift held > 1 s or a jump with > 0.5 s air adds 1–3 s to the Blitz clock with a combo toast; pure detector on `hb`, `vs`, `air` (`index.html:1346-1358`). Builds on Blitz.
2. **Taxi variant of #107** — after #107 lands: a passenger silhouette at the pickup, a pickup leg, one shared clock across the shift instead of a per-order limit, rank letter at the end.
3. **Landing disc at checkpoints and the finish** — a flat glowing disc on the road instead of (or under) the pillar ring, visible from far; look only.
4. **"Arcade" third graphic style** — saturated flat palette, deep blue sky, no haze, no shadows, in the `STYLES` table (`index.html:1187`); reopens the two-style decision in `docs/01-concept.md:28-41`.
5. **Rank jingle and time's-up buzzer** — synthesised in `SFX`.
6. **Blitz surprises for #108** — a random checkpoint pays double, a "time thief" event; belongs to #108 once Blitz exists.
