# Steam loco turntable at Sisseln — design (#496)

## Goal

The steam loco (#462) can only run forward one way and reverse slowly the other. A **turntable** in the track at its start
spot in Sisseln lets the player turn it round, so W drives the other way at full speed.

## Decisions (maintainer, 2026-10-27)

- **Place:** in the main line, centred on the loco's home spot at Bahnhof Sisseln (`TRAIN.home`). No new track, the track
  graph stays as it is. Not true to the real station (it has none); accepted for play.
- **Use:** with the loco **at rest** and its centre at most **3 m** from the disc centre, **A** turns it 180° anticlockwise
  (seen from above, a left turn), **D** clockwise (right turn). The bridge and the loco turn together, visibly, in **6 s**
  with a smooth start and stop (smoothstep). Afterwards the loco faces the other way and W drives that way.

## Behaviour

- On A/D the loco is first pulled onto the disc centre (`s = home.s` on the home edge), then turns.
- While turning, W, S, Q and E do nothing. H (whistle) and C (camera) still work.
- Z, R and anything that ends the train mode (`endTrain`, via `resetCar`) **finish a running turn at once** first, then do
  their normal thing, so the loco is never left half-turned across the track.
- A/D away from the disc or while moving shows the toast "Stop on the turntable at Sisseln to turn round" and changes
  nothing.
- Done: the toast "Loco turned round".
- Help line `keyTrain` gains "A · D turn on the turntable"; the `<kbd>` reads `W · S · Q · E · H · A · D`.

## Look

`buildTurntable()` in `locomesh.js`: a dark pit disc (radius 11 m, 0.3 m thick, top flush with the rail top), a grey ring
rail on its rim, and a turning **bridge** (`userData.bridge`): two dark girders 22 m long, 0.6 m high, 2.2 m apart, with
two rails on top. The bridge is symmetric end to end, so after a turn and after R it always lines up with the track.

## Code shape

- `train.js` (pure, `node --test`):
  - `TURNTABLE = { radius: 11, reach: 3, turnTime: 6 }`
  - `onTurntable(g, st, home, cfg)`: at rest (|v| < 0.05) and within `reach` of the home pose.
  - `turnAngle(t, cfg)`: 0 → π, smoothstep over `turnTime`, clamped.
  - `turnedState(g, st, home)`: on the home edge at `home.s`, at rest, `choice` 0, facing opposite to `st`'s heading
    (works when `st` is on a neighbouring edge too).
  - `trainKeyAction`: `KeyA` → `turnLeft`, `KeyD` → `turnRight`.
- `index.html`: `TRAIN.turn = { t, sign, th0, to } | null`, `TRAIN.table` (the mesh), `startTurn(sign)`, `stepTurn(dt)`,
  `finishTurn()`; `stepTrainMode` hands over to `stepTurn` while turning; `__mm.train()` adds `turning`.
- Ctrl+D stays the debug key: `isDebugKey` runs before the train keys.

## Testing

- Node: the three functions and the two keys.
- Playwright (`test_train.py`, GPU browser): at home, D then `trainSim(7)` → heading + π, then W moves the loco against its
  old heading; away from the disc, A only shows the hint and the heading stays.

## Out of scope

Turntables elsewhere (Stein), a stub siding, turntable sound, manual free rotation.
