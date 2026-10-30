# Little Classic (Mr. Bean's Mini look-alike) — design

Status: approved in chat 2026-10-24 · split off from #199

## Intent

A fourth selectable car: a look-alike of the 1976 Mini 1000 that Mr. Bean drives. The player
recognises it at a glance from the colour and the matte black bonnet, and can strap an **empty
armchair** to the roof and drive "from up there", like in *Do-It-Yourself Mr. Bean*. It is a fun
car, not a slow one: it keeps up with the others.

## Goals

- A new entry `VEHICLES.mini` in `prototype/index.html`, built from primitives by a procedural
  builder `buildMini` (the DeLorean pattern, #126), selectable in the car selection screen (#7)
  and in the pause menu's *Change vehicle* (#189).
- Look: classic Mini proportions at true size, **Citron Green** body, **matte black bonnet**.
- Drives on par with the compact, a little quicker off the line and nimbler; lighter.
- Its own engine voice, gearbox and horn.
- An **armchair option** in the car selection: an empty armchair on the roof, and the cockpit
  view moves up into the chair and sways gently.

## Non-goals

- A Mr. Bean figure, the padlock on the door, the teddy, the broom and strings.
- Falling off the chair, any physics change from the chair.
- Changing collision height or clearance checks because of the chair.
- Paint choice for this car (fixed livery, see Decisions).
- The other #199 vehicles.

## Anti-goals (a failure even if it works)

- Any visible "Mr. Bean", "Mini", "Austin", "BMW" name, logo, badge or lettering in the game.
  "Mr. Bean" may appear only in code comments, docs and the changelog — as with the DeLorean
  (`docs/07-brands-and-permissions.md`).
- The real number plate `SLW 287R` or any other direct series quote besides the armchair.
- A toy look: the car must sit next to the compact at real proportions, not as a cartoon.
- The compact, DeLorean or hatchback driving, sounding or looking any different.

## Decisions

| Topic | Decision | Source |
|---|---|---|
| In-game name | `veh_mini_name`: en "Little Classic", de "Kleiner Klassiker". Class and description strings in the voice of the DeLorean's (`prototype/strings.js` ~L296/L632); the description may hint at the armchair, never name the series. | User (neutral name) |
| Livery | Citron Green body and roof (≈ `#b5b83a`, tune by eye to the series car under both styles), matte black bonnet (rough, non-metallic), chrome bumpers and grille surround, black sills. `paint: false` like the DeLorean. | User (colour); fixed livery = my call |
| Size | ≈ 3.05 m long, 1.41 m wide, 1.35 m high; wheelbase 2.04 m, track ≈ 1.2 m, 10" wheels. `scale: 1.0`, `wheels: [[1.02, 0.62], [-1.02, 0.62]]`, `wheelR: 0.26`, `collision: { shape: 'circle', r: 1.0 }` as a starting point; verify the circle reads right against walls. | My call (real dimensions) |
| Shape | Pure profile data in a new `prototype/mini.js` (like `delorean.js`): body side profile, glass profile, so it is unit-testable in node. Recognisable cues: upright boxy cabin, slightly rounded corners, exposed outer body seams (A-pillar and roof gutter), round headlamps, the wide grille, small vertical tail lamps, external door hinges. | My call |
| Plate | Fictional `AG · 1976` (year, like the DeLorean's `AG · 1981`). | My call |
| Right-hand drive | The cockpit eye sits on the right (`z > 0`), as in the UK car. | My call |
| Drive | `drive: { top: 54, topNitro: 85, accel: 17, accelNitro: 34, brake: 24, reverse: 8, reverseMax: 12, grip: 10, gripHandbrake: 1.8, steerRate: 3.0, airSteer: 0.4 }` (≈ 194 km/h; compact 60/16/9/2.6). | User ("mithalten"); numbers my call |
| Mass | `mass: 0.75`: loses a bit more speed and takes a bit more damage in a crash than the compact. | User approved "leicht" |
| Sound | 4 cylinders, higher and buzzier than the compact (higher idle filter), **four gears** (`gears` with five entries ending in 999), a thin high horn (higher `notes` than the compact's 415/523, shorter `dur`), crash a little brighter and lighter (`weight` < 1). Exact numbers by ear. | User approved; numbers builder's |
| Lamps | Round head lamps and tail lamps must follow #270 lights, #230 brake and #271 hazard like the other cars (`applyLamps`; the DeLorean's local-material route via `delLamps` is the model, generalise it rather than adding a third special case if that stays small). Blinkers via `BLINK`. | Existing behaviour |
| Armchair option | A per-vehicle option, offered only for vehicles that declare it (e.g. `options: { chair: true }` on `mini`). The car selection shows a toggle (on/off) under the paint row, keyboard and mouse operable, de/en labels. The choice is stored with the vehicle choice in `mm.car` (validated in `parseChoice`, an old stored choice without the field means off). | User (option in car select) |
| Armchair look | An **empty** upholstered armchair (seat, back, two arms, short legs) on the roof, centred, facing forward, with two straps over the roof. Fabric-coloured, not green. Present in every camera view and on the turntable. | User (empty chair) |
| Armchair camera | With the chair on, the **cockpit** view's eye moves into the chair (≈ roof 1.35 m + seat + eye height → y ≈ 2.4–2.5 m, x ≈ -0.2, z = 0). A gentle **camera-only sway**: roll and pitch of a few degrees driven by steering/lateral acceleration and speed, deterministic (no random), zero when standing. Pure function in `mini.js`, unit-tested. Chase, near, bumper and drone views unchanged. | User approved (wobble in the camera only) |
| Physics with chair | Identical to without: same `drive`, `mass`, `collision`. | User approved |
| Chair and car size | The chair is its own child group of the car, **excluded from `measureCar` / `CAR_SIZE`**, so shadow, camera heights, turntable framing and the size checks see the bare Mini. | My call |
| Chair in the cockpit view | The chair stays solid. The eye sits at head height above the seat: arms below the eye, backrest behind it, so nothing occludes the view or clips the near plane. | My call |
| Sway inputs | The pure sway function in `mini.js` takes the steering input and the forward speed (`steer`, `P.speed` or what `stepCar` already has), plus `dt` for smoothing; no new sim signal. The roll is applied after `lookAt` (e.g. `camera.rotateZ`), pitch as a small offset of the look target. | My call |
| Mirror with chair | The rear-view mirror stays as it is today for the cockpit view (no roll, not raised). | My call |
| Chair choice shape | Stored as its own field `chair: true/false` in the choice, kept when the player switches to another car and back; ignored for vehicles without the option. Old choices without the field read as off. The pause menu's *Change vehicle* (#189) reuses the car selection screen, so it gets the toggle for free; cancelling a swap restores the chair flag too. No URL parameter: tests set `mm.car` in `localStorage`. | My call |
| Stat bars | `STAT_REF` is a fixed ceiling, so adding the Mini moves no other car's bars. Mini ≈ top 7, accel 9, handling 9, mass 3. | Code (`carselect.js`) |
| Order | `mini` comes after the existing entries in `VEHICLES` (the car selection cycles `Object.keys(VEHICLES)`). | My call |
| Changelog | One player-facing entry under `[Unreleased]`, timestamped, 1–3 bold keywords, may name "Mr. Bean" (as the DeLorean entries name the DeLorean). | Repo rule |
| Brands doc | Add a tracker row to `docs/07-brands-and-permissions.md`: Mini (BMW) shape and Mr. Bean (Tiger Aspect) — not asked, look-alike, decided 2026-10-24: primitives, no logo or lettering, no name in the game, the armchair as the one series nod. | Repo rule |

## Left to the builder

- Exact profile points, colours, sound numbers, sway amplitude — by eye and ear, within the
  ranges above.
- How the armchair toggle looks inside the existing car-selection layout.
- Whether the lamp handling is generalised or the Mini gets its own `delLamps`-style hook.

## Tests

- `node --test`: new `prototype/tests/mini.test.mjs` — profile size matches the target length and
  height (± 5 cm), sway is 0 at rest, bounded, and symmetric for left/right steering;
  `carselect.test.mjs` — `parseChoice` keeps a valid chair flag, drops an invalid one, old choices
  read as chair off; `statBars(VEHICLES.mini)` gives sensible bars.
- Playwright, targeted only (`test_vehicles.py`, `test_carselect.py`, and `test_lights.py` if the
  lamp code is touched): the mini can be selected and driven (`?vehicle=mini`), no console errors;
  the chair toggle appears only for the mini, persists across a reload, and moves the cockpit eye
  up; the other vehicles' existing tests stay green unchanged.

## Acceptance criteria

- [ ] `VEHICLES.mini` exists with the drive, mass, size and collision values above; `buildMini` is
      registered in `MODELS`.
- [ ] The Mini shows in the car selection as "Little Classic" / "Kleiner Klassiker" with class,
      description and stat bars; no paint swatches apply to it.
- [ ] Citron Green body, matte black bonnet, round lamps; lights, brake lights, hazards and
      blinkers work on it.
- [ ] No logo, badge, lettering or series name visible on the car or in the UI.
- [ ] Own engine voice with four gears and its own horn.
- [ ] Armchair toggle only for the Mini; stored in `mm.car`; the chair is visible on the roof;
      the cockpit view sits in the chair and sways gently; driving is unchanged.
- [ ] Compact, DeLorean and hatchback unchanged (their tests green without edits).
- [ ] Changelog entry and brands-doc row added.
- [ ] Manual playtest: drive the Sisseln loop with chair off and on in all camera views, no
      console errors.
