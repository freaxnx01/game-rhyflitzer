# Farm fields without z-fighting from the helicopter (#688)

## Problem (reproduced 2026-11-06)

From the helicopter (400 m up over the cereal field at about (737, −848), looking east from x 137) the meadow flickers through
the yellow fields in small patches. The field meshes sit `FIELD_LIFT = 0.02` m over the terrain (`index.html:1346`); the camera
has `near` 0.5 and `far` 4200 (`index.html:2376`) and a 24-bit depth buffer, so the depth step is about d² / (near · 2²⁴):
~1 cm at 300 m, ~3 cm at 500 m. Past ~400 m, 2 cm cannot be told apart and the terrain wins pixel by pixel.

A/B in the GPU browser, same pose: as shipped, green meadow splinters across the field; with `polygonOffset` (factor −2,
units −2) on the `field` and `meadow` role materials, the field is clean (the dots left are trees).

Roads lie 0.04 m over the terrain (`ribbon(…, 0.04, …)`, `index.html:2036`) and, like the fields, have no polygon offset; the
Crash-Platz slab has 0.04 m and offset −2 (`yardGround`, `index.html:1946`). An offset on the fields alone could push them over
the roads at range, so the fix sets an explicit order.

## Design

Polygon offset per surface role, applied wherever a role gets its material (both style profiles, `applyStyle`,
`index.html:2946`), from one pure table in `world.js`:

| layer | roles | factor / units |
|---|---|---|
| terrain | `grass` | none |
| fields | `field`, `meadow` | −1 / −1 |
| roads | `road`, `roadOsm`, `roadPlain`, `motorway`, `gravel` | −2 / −2 |
| Crash-Platz slab | (`yardGround`, own material) | −3 / −3 (was −2) |

Lifts stay as they are; nothing moves in space.

## Acceptance

- From the repro pose no meadow flickers through the fields
- Roads, car parks and the Crash-Platz still lie on top of fields where they cross
- Both style profiles (T) keep the offsets
