# Surprise hunt — five presents, five surprises (first slice of #108) — design

Status: approved in `/enrich --quick` (no human gate) 2026-10-09 · Issue #108 · depends on nothing unmerged · siblings: #128 (Blitz, enriched, not implemented), #107 (delivery, enriched, blocked on #106/#104)

## Goal

Issue #108 asks: which game modes with surprises could we build for a 10-year-old? Collect ideas, keep the best. This spec does the collecting (below, "Ideas") and distils it into **one modest first slice** that can be built now; the other ideas are listed as follow-up candidates and are **not** created as issues (user).

**The slice: a Surprise hunt** (de: *Überraschungsjagd*). A third button on the start screen starts a run in which five glowing **gift boxes** are hidden on roads within a few minutes' drive of the start — in a **different place every run**. The arrow and the minimap point to the nearest one. Driving into a box pops it with confetti and a jingle and reveals one of four harmless **surprises**:

| Surprise | What happens | en / de toast |
|---|---|---|
| **Super jump** (`hop`) | the car hops ~1.6 m into the air | "Boing! Super jump!" / "Boing! Supersprung!" |
| **Turbo** (`turbo`) | 6 s of nitro power whenever you press gas (no N key needed) | "Turbo for 6 seconds!" / "Turbo für 6 Sekunden!" |
| **Moon gravity** (`moon`) | 10 s with a third of the gravity: every bump and the ramp become a moon jump | "Moon gravity for 10 seconds!" / "Mondschwerkraft für 10 Sekunden!" |
| **Free repair** (`repair`) | the damage bar goes back to zero | "Free repair: good as new!" / "Gratis-Reparatur: wie neu!" |

After the fifth box a short celebration (1.5 s) runs, then the result screen says "All presents found!" with the time and the best time. Nothing chases you, nothing runs out, nothing is lost.

Why this suits a 10-year-old: a session is 3–5 minutes (five boxes within 900 m of the start, ~2–3.5 km of driving, probe below); the goal is one sentence ("find the 5 presents, follow the arrow"); the surprise is twofold — *where* the boxes are (new every run) and *what* each one does (unknown until opened); every surprise is good news. No countdown pressure — that is Blitz's job.

Success: the start screen shows **Surprise hunt** next to Start; a run hides five boxes on drivable roads; each pickup shows a toast `Present n/5` with the surprise, plays a jingle, bursts confetti and applies the effect; the HUD reads `Surprise hunt · Hochrhein` and counts presents; the fifth pickup ends the run with "All presents found!" and saves the best time (`mm.huntBest`) unless a cheat flag is set. The time trial is untouched.

## Ideas (the #108 brainstorm)

Checked against what the game already has (`main` @ `7c2989e`, 2026-10-09). Criteria for the first slice: fun for a 10-year-old in under 5 minutes, works in both layouts (hand and OSM), needs no unmerged feature, nothing frightening.

| Idea | Fit | Verdict |
|---|---|---|
| **Surprise hunt** — random gift boxes, each with a random harmless power-up | Needs only roads, the arrow (`#arrow`, `index.html:107`), the race clock (`R.t`, `:1396`) and toasts (`toast()`, `:1390`). | **This slice.** |
| Blitz surprises — a random checkpoint pays double, a "time thief" (#128 follow-up 6) | Needs Blitz's clock, which is specified (#128) but not implemented; time pressure plus a "thief" is the stressful kind of surprise. | Follow-up, after #128 lands. |
| Mystery boxes in the time trial / free drive (Cruise) | Same boxes and effects, but scattered while you race or roam. | Follow-up: reuses this slice's `presents.js` once it exists. |
| Silly surprises — giant car, tiny car, rainbow paint, upside-down camera | Car scale interacts with the measured car size and collider (`CAR_SIZE`, `carRadius()`, #69); paint needs per-vehicle materials (#7 / DeLorean). | Follow-up: **more surprise kinds** once the table exists. |
| Treasure hunt with riddles ("find the tallest tower") | Needs the J landmark list (`landmarks.js`) and text-heavy clues in two languages; great but bigger. | Follow-up: **landmark riddle hunt**. |
| Animal / mascot hunt (find the Rhine fish, the stork on the Münster) | New 3D assets (Fable for graphics, per user memory). | Follow-up: **mascot collectables** (new models). |
| Delivery with surprise orders (#107) | #107 is blocked on #106 / #104. | Not touched. |
| Helicopter treasure drop (F) | Fun, but flying cancels pickups by design (checkpoints too, `:1396`). | Follow-up: **air presents** reachable only by helicopter. |
| Surprise weather / night switch | Night driving has a spec (`2026-10-03-night-driving-design.md`); darkness can frighten. | Not for this audience as a random surprise. |

## Starting point (verified 2026-10-09 on `main` @ `7c2989e`)

- **Race.** `const R = { state: 'ready', t: 0, best: null, done: 0, shortcut: false, target: null }` (`prototype/index.html:1385`), best from `mm.best2` (`:1386`). `startRace()` (`:1393`) resets checkpoints, flags and the car, sets `'armed'`, hides the overlay. `updatePips()` (`:1394`) reads `cpObjs[i].done`. `stepRace(dt)` (`:1396`): `'armed'` → `'racing'` once the car moves, `R.t += dt` while racing, checkpoint within 7 m while not flying, `R.target = { ...cp, i }`. `finish()` (`:1397`), `resultHtml({ t, rec })` (`:1398`), `renderOverlay()` (`:1400`), `$('startbtn').onclick` (`:1401`), `restartRace()` (`:1408`), `toMainMenu()` (`:1409`), `rerenderAll()` (`:1456`).
- **HUD.** `#tl .mode` (`data-i18n="mode"`) and `#tl .cps` with `#cpn` and the `checkpointsLabel` span (`:101-103`); `#pips` five divs; `#tr` time + `#best` (`:114-117`); `hud()` (`:1522`) writes `fmt(R.t)`, `tr('best', …R.best)`, and for `R.target` the arrow, `#dist` and `#cpname` (`cpTarget` / `finishTarget`). `drawMap()` (`:1487`) draws `CPS` and the finish square.
- **Start screen.** `#overlay .row` holds `#startbtn` and `#stylebtn2` (`:201-204`); `.row` is `flex-wrap: wrap` (`:65`).
- **Car physics.** `stepCar` (`:1345`): `nitro = keys.KeyN` (`:1347`), `P.nitro = nitro` (`:1349`), `top / accel` pick nitro values when `nitro` (`:1352`), gravity `P.vy -= 22 * dt` (`:1358`), a landing at `P.vy < -9` adds damage. `P.dmg` 0..1. `flames.visible = !!P.nitro` (`:1360`).
- **Roads.** OSM: `L.roads[]` with `cls`, `w`, `bridge`, `layer`, `pts` (5 883 non-bridge, layer-0 segment midpoints of residential / tertiary / secondary / primary / unclassified / living_street roads; **378** of them lie 150–900 m from the start at `[1882.9, -292.2]`; five spots with ≥ 200 m spacing, nearest-neighbour tour 1.8–3.4 km over 5 seeds — probe on `data/world_hochrhein.json`, 2026-10-09). Hand layout: `ROADS` (`:332`) without `cls` / `layer`; `ROADS = L.roads` on the OSM path (`:414`).
- **Sound.** `SFX` (`:1211`) synthesises with `beep()`; `checkpoint()` and `finish()` are arpeggios.
- **Checkpoint visuals.** `cpObjs[i].g` (group with pillar and ring, `:1086`), `finishG` (`:1087`).
- **Strings.** `prototype/strings.js` `en` / `de`; `strings.test.mjs` enforces equal keys, equal arity, no `ß`. German UI capitalises the address pronoun (`Deine Datei`, `strings.js:148`).
- **Tests.** Pure modules: `node --test prototype/tests/*.test.mjs`. Browser: pytest + Playwright, hand layout by routing the world JSON and the `.mmh` to 404 (`test_pause.py:open_page`).
- **#128 Blitz** (spec + plan on `main`, code not yet) plans `R.mode = 'trial' | 'blitz'`, `startRace(mode)` and `renderModeLine()`. This slice uses **the same names** so the second of the two to land merges into the first one's code instead of inventing a parallel mechanism.

## Decisions

| Topic | Decision |
|---|---|
| Dependency | **Stands alone; does not depend on #128.** Blitz's surprise ideas need its clock; a kid's surprise mode is better *without* a countdown. Both add `R.mode` / `startRace(mode)` / `renderModeLine()` with the same meaning; whichever lands second extends the other's (plan Task 0 checks). |
| Mode | `R.mode = 'trial' \| 'hunt'` (plus `'blitz'` if #128 is in). `startRace(mode = 'trial')`: every existing caller unchanged. |
| Pure module | `prototype/presents.js` (no DOM, no three.js): `HUNT` rules table, `SURPRISES` table, `presentCandidates(roads)`, `pickPresentSpots(cands, start, rng, rules)`, `seededRng(seed)`, `nextSurprise(bag, rng)`, `tickSurprises(timers, dt)`, `gravityScale(timers)`, `nearestPresent(spots, found, x, z)`, `canCollect(spot, car, raceState, flying)`, `isNewHuntBest(best, t)`, `confettiBurst(n, rng)`, `stepConfetti(parts, dt)`. |
| Where the boxes go | Candidates: midpoints of non-bridge, layer-0 road segments of class residential / tertiary / secondary / primary / unclassified / living_street (hand roads: every non-bridge road). Five spots, **150–900 m** straight-line from the start, **≥ 200 m** apart, picked by shuffling with `rng`; if fewer than five fit, the gap halves (down to 50 m), then the radius grows ×1.5 (up to ×3). New spots every `startRace('hunt')` (`Math.random`). |
| Picking up | Nearest uncollected box within **7 m** horizontally and **4 m** vertically (so a box on a road under a bridge is not taken from the deck), in `'armed'` or `'racing'`, **not while flying** (as checkpoints). |
| The box | A 2.4 m gift box (one of four bright colours) with a yellow ribbon cross and a bow, bobbing and turning, plus a translucent pink light beam (Ø 6 m, 40 m tall) like the checkpoint pillar, so it is visible from far. Five objects built once at load, hidden outside the hunt. |
| On pickup | Box hidden; confetti burst (80 particles, 2 s, gravity) at the box; `SFX.present()` jingle; toast `Present n/5` + the surprise line (`TOAST_S.event`); effect applied. |
| Surprises | Drawn from a shuffled bag of the four kinds, refilled when empty, so the first four boxes are four different surprises and the fifth is a random one. `hop`: `P.y += 0.3; P.vy = 8.5` (apex ~1.6 m, lands at ~8.5 m/s < the 9 m/s damage threshold). `turbo`: 6 s; while it runs, pressing gas uses the nitro top speed and acceleration and shows the flames. `moon`: 10 s at gravity × 0.35. `repair`: `P.dmg = 0`. Timers tick only while the loop runs (not while paused) and reset at every `startRace`. A second turbo/moon restarts its timer. |
| End | Fifth pickup: clock stops (`R.state = 'finished'`), the best is recorded, and after **1.5 s** of celebration (confetti and toast visible) the result screen opens. Best = fastest clean time, `localStorage` `mm.huntBest`. Cheat flags (J, O, F) show the existing not-counted notes and skip the best. |
| HUD | Hunt: `#tl .mode` → `Surprise hunt · Hochrhein`; the `checkpointsLabel` span → `presents`; `#cpn` and the pips count presents; `#cpname` → `Nearest present`; `#best` → hunt best. Checkpoint pillars and the finish gate hidden; minimap shows uncollected boxes as pink dots (nearest one yellow-ringed), no checkpoints, no finish square. `renderModeLine()` sets the two labels; called from `startRace`, `toMainMenu` and at the end of `rerenderAll()` (after `applyStaticStrings()`, which would reset them). |
| Start screen | Button **Surprise hunt** (`#huntbtn`, class `btn`) in `#overlay .row` between Start and Style → `SFX.start(); startRace('hunt')`. A start toast "Find the 5 presents! Follow the arrow." After a hunt the hunt button reads **Retry**, Start reads **Start**; after a trial as today. |
| Result | `#ovtext` → `huntFinishedText`; `#result` → `<small>All presents found! / New record!</small>mm:ss.d<small>not-counted notes · best …</small>`; a missing best renders `—`, not `NaN`. |
| Pause | `canPause` unchanged; **Restart** → `startRace(R.mode)`; **Main menu** keeps `R.mode`. |
| Strings | `hunt`, `modeHunt`, `presentsLabel`, `presentTarget`, `huntStart`, `presentToast(number, total, line)`, `surpriseHop`, `surpriseTurbo(secs)`, `surpriseMoon(secs)`, `surpriseRepair`, `huntAllFound`, `huntFinishedText` — en + de. |
| Test hooks | `__mm.hunt()` → `{ mode, state, found, total, spots: [[x, z, y]], timers, gravity, dmg, best, last }`; `__mm.startHunt(seed)` starts a hunt with `seededRng(seed)` for spots and surprises; `__mm.surprise(id)` applies one surprise. |
| Not in this slice | Surprises in the trial / Blitz / free drive, more surprise kinds (giant car etc.), riddles, mascots, air presents, a best display on the start screen, a touch-specific button (the start-screen button is touchable), sounds beyond one jingle. |

## Interactions

- **#128 Blitz:** same `R.mode` / `startRace(mode)` / `renderModeLine()`; the second to land adds its branch to the first one's functions. Button row: Start, Blitz, Surprise hunt, Style.
- **#107 delivery:** separate `R.state = 'delivery'`, its own button; no shared state.
- **#83 pause:** Restart passes the mode.
- **#18 autopilot (O), J jump list, #10 helicopter (F):** flags as in the trial; a flying car takes no box, a jumped / autopiloted hunt is "not counted".
- **#9 i18n:** a language switch mid-run re-renders through `renderModeLine()`; the toast in flight keeps its language until it fades (as all toasts today).

## Acceptance criteria

- [ ] The start screen shows a **Surprise hunt** / **Überraschungsjagd** button next to Start; clicking it hides the overlay, shows the toast "Find the 5 presents! Follow the arrow." / "Finde die 5 Geschenke! Folge dem Pfeil.", and `__mm.hunt()` reports `mode === 'hunt'`, `total === 5`, five spots.
- [ ] In both layouts (hand and OSM) the five spots are 150–900 m from the start (or within the documented fallback), ≥ 50 m apart, each within 1 m of a road centreline; two hunts started with different seeds give different spots.
- [ ] Driving (teleporting) to a box collects it: `found` increments, the toast shows `Present n/5` / `Geschenk n/5` with a surprise line, `#cpn` and the pips update; a box is **not** collected while flying or from 5 m above (`canCollect`, unit-tested).
- [ ] Each surprise does its thing: `hop` puts the car in the air (`y` above ground within 0.3 s); `turbo` gives a higher top speed with gas only while its 6 s run; `moon` makes `gravity` 0.35 for 10 s, then 1; `repair` sets damage to 0. Pausing freezes the timers.
- [ ] The first four boxes of a hunt give four different surprises.
- [ ] HUD in a hunt: `#tl .mode` = `Surprise hunt · Hochrhein` / `Überraschungsjagd · Hochrhein`, label `presents` / `Geschenke`, `#cpname` = `Nearest present` / `Nächstes Geschenk`; still correct after a language switch mid-run; checkpoint pillars and the finish gate are hidden.
- [ ] Collecting the fifth box opens the result screen within ~2 s with `All presents found!` / `Alle Geschenke gefunden!` and the time; `mm.huntBest` is saved on a clean run and untouched after J / O / F; the hunt button then reads **Retry** / **Nochmals** and Start reads **Start**.
- [ ] Pause → Restart during a hunt starts a new hunt (new spots, `found === 0`).
- [ ] The time trial is unchanged: after Start `mode === 'trial'`, pillars visible, boxes hidden, `mm.best2` logic untouched; `node --test prototype/tests/*.test.mjs` passes (incl. the new `presents.test.mjs` and `strings.test.mjs`); `test_pause.py` and `test_i18n.py` still pass.
- [ ] No console errors during a hunt.
- [ ] `CHANGELOG.md` `[Unreleased]` → `Added` has a player-facing entry.

## Assumptions

- **A1** [med] The first slice is a **stand-alone Surprise hunt**, not Blitz surprises. Rejected: building on Blitz (#128 is specified but not implemented, so #108 would wait on it; and a countdown plus a "time thief" is the stressful kind of surprise for a 10-year-old). Evidence: Blitz spec follow-up 6 (`docs/superpowers/specs/2026-10-09-blitz-mode-design.md`, "Follow-up candidates") names those ideas as needing Blitz first.
- **A2** [high] Follow-up ideas are listed here, not created as issues (user).
- **A3** [med] All four surprises are **good news** (no "bad luck" box like a slowdown or a spin). Rejected: mixed good/bad boxes (Mario-Kart style) — the user asked for surprises for a 10-year-old and "nothing frightening"; losing something at random reads as unfair at that age.
- **A4** [med] Effects chosen for cost and safety: each touches one existing variable (`P.vy`, the nitro branch, the gravity constant, `P.dmg`). Rejected for this slice: giant/tiny car (interacts with `CAR_SIZE` / `carRadius()`, #69), paint colours (per-vehicle materials, DeLorean), camera tricks (can cause motion discomfort).
- **A5** [med] Ring 150–900 m, gap 200 m. Evidence: probe above — 378 candidates in the ring, five spots fit on every seed tried, tour 1.8–3.4 km ≈ 3–5 min at city speeds. Rejected: boxes at the five checkpoints (no "where is it?" surprise, and it is the trial's course).
- **A6** [med] Boxes may land on the other side of the Rhine (the ring around the start crosses it). "Across the border" is a concept pillar (`docs/01-concept.md:14`); the arrow and minimap show the way. Rejected: same-bank filter (needs a bank test the code does not have).
- **A7** [med] No pickups while flying, as checkpoints (`index.html:1396`). Rejected: heli pickups (makes the hunt trivial; "air presents" is a follow-up).
- **A8** [med] Best time persisted (`mm.huntBest`) with the trial's cheat rules. Evidence: `mm.best2` precedent (`index.html:1386`, `:1397`). Rejected: no record at all (kids like beating their record; cost is one key).
- **A9** [high] UI text via `tr()` with en + de; German addresses the player with capitalised `Du` (`strings.js:148` uses `Deine`).
- **A10** [med] Names: mode "Surprise hunt" / "Überraschungsjagd", objects "presents" / "Geschenke". Rejected: "Treasure hunt" (suggests riddles / a map, a follow-up).
- **A11** [med] One new sound (`SFX.present`, a four-note rising arpeggio via the existing `beep`). Evidence: `SFX.checkpoint` / `SFX.finish` are the same pattern (`index.html:1223-1224`).

## Consequences

- The start-screen row grows to three buttons (four with Blitz, five with Delivery); `.row` wraps on narrow screens.
- A hunt's length varies with the draw (tour 1.8–3.4 km straight-line); best times are therefore only loosely comparable between runs — acceptable for a fun record.
- The turbo surprise makes the car briefly faster than a player may expect; it only acts while gas is held, so letting go stops it.
- Moon gravity also lengthens jumps off the Sprungschanze and bridge humps; landings stay soft because the impact threshold (9 m/s) is reached later.
- `R.last` gains `mode`; `finish()` sets `mode: 'trial'`; anything reading `R.last.t` keeps working.
- `presents.js` is reusable for the follow-up "mystery boxes in other modes".
- The existing trial result can show `NaN` as best after a cheat-flagged first run (`resultHtml`, `index.html:1398`, `fmt(null)`); the hunt result guards this; the trial bug is pre-existing and left alone (mention, not fix).

## Follow-up candidates (not created — for the user to pick)

1. **Blitz surprises** — after #128: a random checkpoint pays double seconds; a friendly "bonus clock" box instead of a time thief.
2. **Mystery boxes in the trial and free drive** — scatter `presents.js` boxes on the map outside the hunt; surprises apply as in the hunt.
3. **More surprise kinds** — giant / tiny car (after checking `CAR_SIZE` / collider), rainbow paint, a horn that plays a tune, a bouncy-tyres mode.
4. **Landmark riddle hunt** — clues like "the tallest tower" lead to J-list landmarks; text-heavy, en + de.
5. **Mascot collectables** — a Rhine fish, a stork on the Münster: new models (Fable), a sticker album of what you found.
6. **Air presents** — boxes floating high up, reachable only by helicopter (F).
7. **Hunt best on the start screen** — show the hunt record next to the button.
