# Postauto clock and time-lapse from the F3 panel (#726) - design

## Goal

The F3 Postauto section (#707) can set the fleet clock and a time-lapse speed, not only via `?patime=`. The buses stay on the timetable at every speed.

## Ground truth in the code

- Clock: `PATIME`/`PATIME_T0` and `postautoClock()` at `index.html:3868-3869`; `?patime=` parsed by `parsePatime` at `postauto.js:28`. The clock line is `clockLine` in `postautodebug.js:14`, drawn at `index.html:5418`.
- Frame dt is clamped to 0.05 s real (`index.html:5565`). `stepPostauto(dt)` (`index.html:3929`) calls `stepBus(b, now, dt, gap)` once per frame.
- `driveStep` (`postauto.js:219-226`) integrates in the dt it is given: `b.v` changes by at most `accel*dt` (1.2 m/s^2) or `hardBrake*dt`, and `b.s += v*dt`. Stand/leave decisions use `t = now + b.shift` (`postauto.js:229-233`).
- So the dynamics are per second of the dt passed in. With the clock at f x but dt left in real seconds, a bus covers at most 16.7 m/s x 0.05 s per frame while the timetable moves f x faster: at 10x and above it falls behind the timetable, and `fleetJumped` (`postauto.js:271`, `|now - prev - dt| > resync (5 s)`) re-places every bus each frame or second.
- `syncFleet` re-places by timetable (`placeTrip`, `postauto.js:172`), so a jump is always timetable-correct, only discontinuous (`v` reset).
- Keys: one window keydown handler (`index.html:3698`) handles Enter (horn), Space/arrows (drive), letters, F3, Esc (pause, follow). The panel already protects a select with `keydown` + `stopPropagation` (`index.html:5408`). No other file registers keydown/keyup (`controls.js`, `foot.js`, `train.js` are pure helpers called from that handler; `pressKey` at `index.html:3706` dispatches synthetic events on window).

## Design

1. **Pure module `paclock.js`** (no DOM, node --test): clock state `{ mode: 'wall'|'set', base, t0, factor, given }`; `clockNow`, `setTime`, `setWall`, `setFactor` (rebases base/t0 so there is no jump), `parseFactor`, `PA_SPEEDS`, `fleetSteps(dtFleet)`, `jumpLimit(factor)`, `clockQuery` (the `patime`/`pasp` URL params) and `clockFromQuery`.
2. **Panel row** in `#debugpa`: HH:MM text input, **Setzen**, **Echtzeit**, and a **Zeitraffer** select (1x, 2x, 5x, 10x, 30x, 60x). Handlers stop keydown/keyup/click propagation; Enter applies and blurs, Esc blurs.
3. **Clock line**: `Uhr 07:44:40 (gesetzt 07:30)`, `Uhr 07:44:40 · 10x (gesetzt 07:30)`, `Uhr 07:44:40 (Echtzeit)`, `Uhr 07:44:40 · 10x (ab Echtzeit)`.
4. **Fleet-time stepping**: `stepPostauto` computes `dtFleet = dt * factor`, splits it with `fleetSteps` into sub-steps of at most 0.05 s fleet time (at most 64), and calls `stepBus(b, subNow, h, gap)` per sub-step with `subNow = now - dtFleet + i*h`. Buses therefore accelerate, brake and dwell in fleet time and keep to the timetable. Drawing, colliders and `syncFleet` stay once per frame.
5. **`fleetJumped` under time-lapse**: called with `dtFleet` and a limit of `PA.resync * max(1, factor)`, so a real frame stall of up to 5 s real does not re-place buses. A user clock change (Setzen, Echtzeit) sets `POSTAUTO.forceSync`, which re-places the fleet once. A factor change rebases and does not re-place. Midnight wrap still exceeds the limit and re-places, as before.
6. **URL sync**: `history.replaceState` keeps `patime` (the value last set, not the running time) and `pasp` (factor) in the address bar; Echtzeit removes both; other params and the hash stay.

## Acceptance criteria

- The F3 Postauto section has a HH:MM input, Setzen, Echtzeit and a Zeitraffer select.
- Setzen with a valid time jumps the fleet clock there, it runs on in real time, buses are re-placed by the timetable; an invalid time changes nothing and marks the input.
- Echtzeit returns to the Europe/Zurich wall clock at 1x.
- A Zeitraffer factor from the set runs the clock at that rate from now on without a jump, from a set time and from real time (from real time it starts at the current wall time).
- At 60x the buses drive the timetable: they are not re-placed every second and do not fall behind it.
- The clock line shows time, factor and source in de and en.
- Typing in the input or select (letters, digits, Enter, Space, arrows, Esc, F3) neither drives the car nor fires hotkeys, the horn, pause or toggles.
- `?patime=` and `?pasp=` reload the state; Echtzeit clears them.
- Pure logic covered by `node --test`; one Playwright test.

## Assumptions

- **A1** [high] New pure module `paclock.js`, panel DOM and handlers in `index.html` next to `drawPostautoPanel` (`index.html:5415`). Rejected: growing `postautodebug.js` into a state holder; it is pure formatting only (`postautodebug.js:1-2`).
- **A2** [high] Same semantics as `?patime=`: base + real elapsed, modulo 86400 (`index.html:3869`). Rejected: a separate clock.
- **A3** [med] Speed set 1x, 2x, 5x, 10x, 30x, 60x. Rejected: free numeric entry (needs validation, unbounded sub-steps); 120x+ (a 60x bus covers ~1 km/s real, already past one stop spacing per frame).
- **A4** [med] The time input is a text field `HH:MM` (validated by `parsePatime`, `postauto.js:28`), applied by Setzen or Enter. Rejected: `type="time"` (locale 12h display, spinner keys), applying on every keystroke (partial values jump the fleet).
- **A5** [med] A factor change rebases `base/t0` (no jump); switching from real time starts at the current wall time and the source reads `ab Echtzeit`. Rejected: keeping the wall clock under a factor (it cannot run faster).
- **A6** [med] Buses step in fleet time with sub-steps of at most 0.05 s fleet time, capped at 64 per frame. Rejected: one big step (`driveStep` braking and stop checks assume small steps, `postauto.js:219-226`); scaling accel/speed (breaks the timetable arithmetic).
- **A7** [med] `fleetJumped` gets `dtFleet` and a limit scaled by the factor; a user clock change forces one re-place via `POSTAUTO.forceSync`. Rejected: leaving `resync` at 5 s (a 0.1 s real stall at 60x is 6 s of fleet time and re-places every frame); disabling jump detection (hides a real clock set).
- **A8** [med] URL sync: `patime` carries the last set value (as on reload today), `pasp` the factor, both via `history.replaceState`; Echtzeit removes both. Rejected: writing the running time on every tick (address-bar churn, reload would not reproduce a start).
- **A9** [med] Enter in the input applies and blurs; Esc blurs only (the panel never reaches pause/follow handling while the input has focus). Rejected: leaving focus in the field (arrows would stay dead until a click elsewhere).
- **A10** [med] Strings `dbgPaClockWall`/`dbgPaClockPatime` are replaced by `dbgPaClock` + three source strings, and the existing `clockLine` test and the Playwright check are updated; the old text `(Zürich)`/`(patime ..)` is gone. Rejected: keeping the old wording next to a new line (two clocks of wording).
- **A11** [med] The panel row is shown whenever the Postauto section is shown (`index.html:5416-5417`), not behind another toggle.

## Consequences

- At high factors a bus is physically fast: it flashes by, its blinkers (`busBlinker`, fleet seconds) flicker, and anything that reads `b.v` per frame (#709 bus sound, if it keys off `b.v`) hears a speed up to 60x real. Whoever lands the sound should clamp for the time-lapse.
- Buses run through the player's car visually at high factor: the bus stops for a player in its lane by `gap` braking in fleet time (`postauto.js:245-252`), which is only as good as the 0.05 s sub-step.
- `maxBuses` (8, `postauto.js:14`) still caps the fleet; at 60x trips open and close fast, so the visible set churns.
- Cost per frame grows with the factor (up to 64 sub-steps x 8 buses).
- #709, #711, #712 edit `index.html` at the same time; this change touches `stepPostauto` (`index.html:3929-3948`), `PATIME` (`index.html:3868-3869`) and the debug panel block (`index.html:5415-5452`, markup line 439, CSS lines 62-65).
