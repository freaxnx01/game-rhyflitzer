# PostAuto timetable in the game (#801) — design

Issue: #801. Related: #500 (timetable fleet), #712 (stop boards), #707 (F3 panel), #808 (line 134 later).

## Goal

The player can read the real weekday timetable of every PostAuto line in the game: at a stop's board (E) the next
departures there, and from there or from the pause menu a per-line view with the next runs per direction and the bus
that is underway. de/en, readable on a phone, no debug panel needed.

## Wireframe (approved 2026-11-10, verbatim; also `docs/design/postauto-timetable/wireframe.md`)

```
STOP (E at the board)
┌ Sisseln, Unterdorf ───────── 14:07 ┐
│ Departures                          │
│ 143 → Stein-Säckingen  14:12   in 5'│
│ 143 → Laufenburg       14:19  in 12'│
│ 143 → Stein-Säckingen  14:42  in 35'│
│ 133 → Frick            16:41        │
│                                     │
│ [Line 133 ▸]  [Line 143 ▸]  [✕ Esc] │
└─────────────────────────────────────┘

LINE (from the stop or pause → Timetable)
┌ Line 143   [→ Laufenburg|→ Stein-S.] 14:07 ┐
│                  ◀  14:12 14:42 15:12 15:42 ▶│
│ Stein-S., Bhf       14:12 14:42 15:12 15:42  │
│ Stein, Novartis   🚌14:15 14:45 15:15 15:45  │
│ Sisseln, DSM        14:18 14:48 15:18 15:48  │
│ Sisseln, Unterdorf  14:21 14:51 15:21 15:51  │
│ …                                           │
│ Sisseln, Breitenacher 14:24 …   (→ Kaisten)  │
│ [Line 133]                        [✕ Esc]   │
└─────────────────────────────────────────────┘
 first column = next run (highlighted)
 🚌 = this run is underway, last stop passed
```

## Design

### Pure module `timetable.js` (node --test)

All timetable logic is pure and generic over `trips` (MMT1: `{ line, route, to, fromOutside, toOutside, calls: [uic,
arr, dep][] }`). No line number is hardcoded anywhere; lines come from the data (#808 adds 134 later).

- `lineIds(trips)` — the lines, sorted numerically.
- `stopLines(trips, uic)` — the lines that call at a stop.
- `stopDepartures(trips, uic, now, count = 4)` — departures at `uic` from `now`, wrapping past midnight: every call except
  the last call of a trip that ends inside the map (that one is an arrival). The first `count` by waiting time, then the
  next departure of every line+destination not yet listed (so a rare line like 133 still shows, as in the wireframe).
- `lineDirections(trips, line)` — one direction per `route` id: stops in the order of its longest trip, trips by first
  departure, named after its most frequent `to`, `toOutside` if any trip leaves the map; sorted by name.
- `nextRun(dir, now)` / `runWindow(dir, now, page, width = 4)` — the next run is the first trip that has not reached its
  last call yet (so a run underway stays visible); the window shows 4 runs from it, `page` moves by 4, clamped to the
  day. Past the day's last run the window starts at the first run (the weekday timetable runs every day, #500 A0a).
- `cellTime(trip, uic)` — the departure at that stop, `null` when the trip skips it (short runs show `–`).
- `liveStops(buses)` — `Map(tripKey → uic)` of the last stop each running bus passed (standing at a stop counts); a bus
  still driving in from the map edge has passed none.
- `clockText(secs, locale)` — HH:MM in the OS region's format (`numberLocale` from `loading.js`, de → de-CH).
- `minutesUntil(wait)` — whole minutes, rounded up, for "in 5'"; shown under one hour.
- `stopInReach(stops, x, z, reach)` — the stop whose board (pole) is nearest within `reach`.
- `TIMETABLE = { runs: 4, rows: 4, soon: 3600, reachFoot: 2.5, reachCar: 6, reachSpeed: 2 }`.

### E at a stop's board

`contextKeyAction` (controls.js:90) gets a lowest-priority `stopPrompt` → action `'timetable'`; in the car
`contextAction()` (index.html:4414) returns `'board'` before `'timetable'`. Key bar / touch E button pick up the label
`barTimetable` through `contextLabel` (controls.js) and `stepTouch` (index.html:3942) for free. The prompt line shows
`E: timetable` when nothing else is up (stepEnter, index.html:4433).

### Overlay `#timetable`

A modal like `#borderinfo` (index.html:734, 5789-5791): opening freezes the loop like the border popup
(index.html:6165), Esc closes. Opened from the pause menu it hides the pause panel and Esc returns to it (like About,
index.html:5410-5411). Stop view and line view render with DOM nodes (`textContent`, no data through innerHTML).
◀ ▶ buttons and ArrowLeft/ArrowRight page the runs; Tab/Enter/Space work natively on the buttons; every other key is
swallowed. The view is rendered when opened and on every interaction (no timer re-render, which would steal button
focus).

### Pause menu

New button `#pausetimetable` ("Timetable"/"Fahrplan") after Style in `PAUSE_BUTTONS` and the tutorial list
(pause.js:5-11). Hidden while no timetable is loaded (`!POSTAUTO.ready`, e.g. other regions). It opens the line view of
the first line; the footer buttons switch to the other lines.

## Acceptance criteria

- [ ] On foot within 2.5 m of a stop's board, or in the car within 6 m and under 2 m/s, the prompt shows `E: timetable`
      and E opens the stop view with the stop name, the game clock and the next departures (line, destination, time,
      `in N'` under an hour).
- [ ] Every other E action keeps working and wins over the stop: Ferris ride, lift, leave, Plattform hop, door, depot
      vehicle.
- [ ] The stop view has one `Line N ▸` button per line calling there; it opens the line view in the direction of that
      line's next departure at this stop.
- [ ] The line view shows per direction all stops top to bottom and 4 runs as columns from the game clock; the first
      (next) run is highlighted; ◀ ▶ (buttons and arrow keys) move 4 runs; a skipped stop shows `–`; a direction that
      leaves the map marks its last stop `(→ <destination>)`.
- [ ] A run that is underway shows 🚌 in its column at the last stop it passed.
- [ ] Pause menu → Timetable opens the line view; Esc goes back to the pause menu. Hidden when no timetable is loaded.
- [ ] de/en strings for all text; times in the OS region's format; the box fits a 360 px wide phone (scrolls inside).
- [ ] Node tests for `stopDepartures`, `lineDirections`, `runWindow`, `liveStops` and the rest of `timetable.js`; one
      Playwright file `tests/test_postauto_timetable.py` opens the view at a stop and shows a known time.

## Assumptions

- **A1** [confirmed] Entry points. Maintainer, 2026-11-10: "At the stop with E" (on foot or in the car next to a stop's
  board from #712, E shows the departures at this stop, from there switch to the whole line) AND "Pause menu: Timetable"
  (button in pause, pick line 133/143). NOT the map click.
- **A2** [confirmed] Line view. Maintainer, 2026-11-10: "Next runs + scrolling": per direction, stops top to bottom, as
  columns the next 4 runs from the game clock, ◀ ▶ moves 4 runs earlier/later; fits a phone.
- **A3** [confirmed] Live. Maintainer, 2026-11-10: "Yes, bus symbol": a 🚌 marker in the column of a run that is
  underway, at its last passed stop (fleet data in postauto.js).
- **A4** [confirmed] Route. Maintainer, 2026-11-10: "Enrich, then pipeline" (claude/Opus agent): plan with exact code
  and failing tests per task. Keep the plan ≤ ~25k characters; split into tasks that each touch few files.
- **A5** [confirmed] Wireframe. Maintainer, 2026-11-10: "APPROVED exactly as below" (the wireframe above).
- **A6** [high] E at the board is the lowest-priority context action: Ferris > lift > leave > hop > door > depot >
  timetable. Rejected: nearest target wins. E today is one context key with a fixed priority order
  (controls.js:88-97, index.html:4412-4419, foot.js:93); a stop board is never next to a lift or a door in practice, and
  a fixed order is what the key bar and touch button already assume. Train mode keeps E for the switch
  (train.js:198, controls.js:53): no timetable from the loco.
- **A7** [med] Reach: on foot 2.5 m from the pole (= `WALKER.enterReach`, foot.js:3; `PROMPT_RANGE`, enterables.js:9);
  in the car 6 m and under 2 m/s (the depot's `reachSpeed`, depot.js:7). The car stands on the lane, about 3 m from
  the pole (busstop.js: pole 0.6 m beyond a stop point w/2 + 0.5 m right of the route), so the depot's 4 m car reach
  would miss it. Rejected: 4 m.
- **A8** [med] Directions are grouped by the trip's `route` id; a short-turn trip (143 → Sisseln DSM) sits in its
  route's direction with `–` at the stops it skips. Data probe: 143 has 2 route ids (11533937, 9093371), 133 has 2
  (11533941, 11533940); short trips share their route id. Rejected: grouping by `to` (gives a one-trip direction).
- **A9** [med] The last stop of a direction that leaves the map is labelled `(→ <most frequent to>)`, e.g.
  "(→ Laufenburg, Bahnhof)". The wireframe's "(→ Kaisten)" names the next real stop, which the cut data does not hold
  (`data/timetable_hochrhein.json` has no stops outside the map). Rejected: adding stops to the data cut.
- **A10** [med] Stop view rows: the next 4 departures, then the next one of every line+destination not yet listed. This
  is how the wireframe shows "133 → Frick 16:41" below three 143 rows. `in N'` only under 60 min (the 133 row in the
  wireframe has none). The last call of a trip that ends inside the map is an arrival and not listed (same rule as the
  board's rows, busstop.js:20-25).
- **A11** [med] "Next run" = the first trip of the direction that has not reached its last call; that column is the
  highlighted first column of the default page. A run already underway therefore still shows (it is the one with 🚌).
  Past the last run of the day the window starts at the day's first run. Rejected: first trip whose first departure is
  after now (would hide the bus that is underway).
- **A12** [med] The pause button opens the line view of the first line (`lineIds(trips)[0]`); the footer's line
  buttons are the "pick line". Rejected: a separate picker screen (one more view for two lines).
- **A13** [med] The overlay freezes the game loop like the border-info popup (index.html:6165) and is rendered on open
  and on each interaction, not every second: a periodic re-render replaces the focused button. The fleet clock is wall
  time (index.html:4193), so it keeps running; buses resync on close (`fleetJumped`, postauto.js).
- **A14** [med] Stop names are shown in full with CSS ellipsis on narrow screens (title attribute carries the full
  name) instead of the wireframe's hand abbreviations ("Stein-S., Bhf"); no abbreviation table to maintain per line.
- **A15** [high] Times: `Intl.DateTimeFormat(numberLocale(lang, navigator.language), { hour: '2-digit', minute:
  '2-digit', timeZone: 'UTC' })` on the seconds after midnight — the repo's OS-region rule (loading.js:18-22).
- **A16** [high] Only the stops in `POSTAUTO.stops` (index.html:6194-6200) get the E action. The decorative 133 board at
  Breitenacher (index.html:2506, hardcoded rows, no uic) is left alone.
- **A17** [high] The pause.js button lists change (new id after `pausestyle`); `tests/pause.test.mjs` expectations are
  updated for the new order, as #773 did for the style button (pause.test.mjs:56).

## Consequences

- E near a stop board in the car now opens a dialog instead of doing nothing; a player parking at a stop to look at the
  shelter gets the prompt line.
- While the timetable is open the world is frozen like the pause menu; buses jump to their timetable place on close.
- The "in N'" values and the 🚌 marker are a snapshot of the moment of opening or the last click.
- `pauseButtonsFor` lists gain an id that index.html filters out in regions without a timetable.
- A future line (#808) appears automatically in the stop view, the line buttons and the pause entry.

## Out of scope

Map/minimap click (A1 says no), delays (the fleet runs on time), weekend timetables, the Breitenacher decorative board.
