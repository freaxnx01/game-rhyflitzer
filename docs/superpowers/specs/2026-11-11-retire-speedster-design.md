# Retire the Sissle Speedster, the hatchback becomes the start car (#830)

## Goal

The **Sissle Speedster** (`VEHICLES.compact`, the procedural car built by `buildCompact`) stops being a vehicle the
player can pick. The unbranded Mazda 3 hatchback (`VEHICLES.hatchback`, #236) becomes the start car. The compact
stays in the vehicle table as the **stand-in** that every glTF car shows while its file loads, and as the fallback
when loading fails.

## Maintainer decisions (2026-11-10, confirmed)

- The hatchback is the start car.
- The Speedster leaves the car selection, the gallery and the vehicle depot (#553).
- `buildCompact` and `VEHICLES.compact` stay as the stand-in and load-failure fallback (`gltf.fallback: 'compact'`
  in every glTF vehicle file, `setVehicle` at `index.html:3285`).
- Supersedes #778 (closed).

## Design

### One list of selectable ids

`carselect.js` gets a pure rule:

```js
export const STAND_IN_IDS = ['compact'];   // #830: built as the stand-in and the load-failure fallback, never offered
export const selectableIds = (ids) => ids.filter(id => !STAND_IN_IDS.includes(id));
```

`index.html` adds `function vehicleIds() { return selectableIds(Object.keys(VEHICLES)); }` next to the vehicle table.
It is a function, not a constant, because `__mm.registerVehicle` adds test vehicles at run time and those must stay
selectable. Every place that today offers or counts the vehicles reads `vehicleIds()` instead of
`Object.keys(VEHICLES)`:

| Place (`index.html`, line on `8c37dda`) | Use |
|---|---|
| `initialChoice(...)` (3292) | stored choice and `?vehicle=` validation |
| `stepVehicle` (5639) | ‹ › cycling |
| `renderCarSel` (5642) | "Car i of n", garage count |
| `stepGallery` (5690), `galleryIds` (5693) | gallery tiles and photos |
| `__mm.carsel` (5706) | test hook index and count |
| depot `depotLayout(...)` (5773) | depot slots: 21 → 20 |
| `vehicleSource(...)` in `game-ready` (6520) | analytics source |

The id key is the filter, not a flag on the definition: tests activate modified copies of `compact` through
`__mm.setVehicle` and `__mm.registerVehicle` (e.g. `test_carselect.py` `SLOW`), and a flag would ride along in
those copies and hide them.

### Start car

- `DEFAULT_CHOICE` becomes `{ id: 'hatchback', paint: 'navy' }`. `navy` stays the factory paint that
  `paintOnSelect` (`gltfvehicle.js:28`) treats as automatic, so a new player's hatchback turns `swiss` red when the
  model swaps in, as it does today on a first pick of the hatchback.
- The `hatchback:` entry moves to the top of the `VEHICLES` literal, right after `compact`, so the start car is
  "Car 1 of 20" and ‹ › cycling starts there.
- `let VEH = VEHICLES.compact;` (3003) stays: it is the placeholder before `setVehicle(VEHICLES[CHOICE.id])` (3300),
  and the compact is what that call builds anyway while the hatchback loads.

### Old choices

`parseChoice` / `initialChoice` already fall back to `DEFAULT_CHOICE.id` for an id that is not in the valid list.
With `vehicleIds()` as that list:

- a stored `mm.car` with `id: 'compact'` reads as the hatchback; its paint is kept (a chosen paint stays, an
  untouched navy becomes the hatchback's red on swap-in);
- `?vehicle=compact` is ignored like any unknown id, so the stored choice (or the default) wins;
  `vehicleSource` reports `stored`/`default`, not `query`.

`mm.car` is not rewritten at boot; the next `saveChoice` stores the new id.

### Load timing

The hatchback file (`assets/hatchback.glb`, 270 KB) is already requested at boot for any glTF choice
(`index.html:5708`); the first frame and the start screen draw the compact stand-in without waiting. The Race
button waits for the model (`raceBlocked`, `gltfvehicle.js:38`), the same rule every glTF choice has today, and the
model swaps in on the start screen as soon as it arrives (`vehicleLoaded`, 5636). No new code; the change accepts
that a first-time player on a slow connection sees Race enabled a moment later than with the instant compact.

### Load failure

Unchanged: `vehicleFailed` (5637) drives the compact and keeps the stored choice so the next visit tries again. The
car selection then shows the stand-in under its own name; that only happens after a failed download. The toast
stops naming "the compact", which the player can no longer know:

- EN `vehicleLoadFailed`: `The ${name} could not be loaded — driving a stand-in car instead.`
- DE: `${name} konnte nicht geladen werden — es fährt ein Ersatzauto.`

`veh_compact_*` strings stay (the stand-in can still be on the stage after a failure).

### Player-facing text

- `veh_hatchback_desc` no longer compares to the compact:
  EN `A proper little family car, red from the factory. Revs high, grips hard and sounds like it means it.`
  DE `Ein richtiger kleiner Familienwagen, ab Werk rot. Dreht hoch, haftet gut und klingt, als meine er es ernst.`
- CHANGELOG under `[Unreleased]` → `### Changed`.

## Tests

Classification of the ~49 test files that name `compact`:

| Kind | Rule | Files |
|---|---|---|
| A: modified copy of the compact as a test vehicle (`__mm.vehicles().compact` + `setVehicle`/`registerVehicle`) | keep | test_crash, test_xss, test_wreck, test_debug, test_sound, test_blaze_model, test_shadow (121/128), test_vehicles (copies), test_carselect `SLOW` |
| B: pure unit tests using `'compact'` as a literal id, fallback or reference numbers | keep | `*.test.mjs` for every glTF vehicle (`fallback: 'compact'`), vehicle, sound, wreck, impact, depot, analytics, most of carselect/hatchback.test.mjs |
| C: asserts the compact is the default/start/selectable car | move to the hatchback / new counts | carselect.test.mjs + hatchback.test.mjs `DEFAULT_CHOICE` and fallback-id asserts; test_carselect (counts 21→20, start id, cycling wrap), test_car_gallery (pressed tile, spread id), test_depot (driven id, slot count), test_analytics (`?vehicle=compact`), test_vehicles 337–346 (unknown id falls back) |
| D: relies on the default car's numbers without naming it (golden traces, true size, shadow size, underwater speed) | pin the compact: call `window.__mm.setVehicle(window.__mm.vehicles().compact)` after boot | test_vehicles (`GOLDEN`, true-to-size, gears), test_shadow (`test_shadow_is_sized_from_the_car`, DeLorean comparison), test_underwater, test_building_collision, test_lights, and any other file that fails the same way |
| E: pins the stand-in / fallback | keep | test_hatchback 120–128, glTF `*_model.py` "compact stands in" |

Kind D keeps the golden physics traces valid: they test the physics, and the compact remains the reference
vehicle. Moving them to the hatchback would mean re-recording every trace and racing the async swap.

New unit tests: `selectableIds` drops `compact` and keeps order and unknown ids; `initialChoice` maps a stored or
queried `compact` to the hatchback when `compact` is not in the valid ids; depot layout from selectable ids has no
`compact` slot.

## Out of scope

- The depot's near/far build (#807) and the DeLorean glTF (#831). Both touch nearby code (#807: depot glue at
  `index.html:5770–5800` and `test_depot.py`; #831: `VEHICLES.delorean` with its own fallback) but neither depends
  on this change logically; whichever lands second rebases.
- Removing `buildCompact` or the `veh_compact_*` strings.
