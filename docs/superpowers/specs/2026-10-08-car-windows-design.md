# Dark, opaque car windows (#123)

## Goal

Car windows read clearly as dark, tinted glass, never as a see-through half-state. The helicopter's glass matches.

## Today

- Car glass (`prototype/index.html:1095`, `carMats.glass`): `MeshPhongMaterial({ color: 0x1a2430, shininess: 140,
  specular: 0xffffff, transparent: true, opacity: 0.92 })`. It is dark blue-grey and 8 % see-through, so it is neither
  clearly glass nor clearly dark, and transparency sorting against the body can flicker.
- The glass is one solid extruded block over the cabin (`:1101-1102`), with no interior behind it.
- Helicopter glass (`:1126`): its own `MeshPhongMaterial` with the same colour, opaque.

## Decisions

| Topic | Decision |
|---|---|
| Look | **Dark and opaque**: near-black `0x0b0f14`, `shininess: 140`, `specular: 0xffffff` (the highlight keeps it reading as glass). No `transparent`, no `opacity`. |
| Sharing | The helicopter uses `carMats.glass` instead of its own copy, so both share one look. `carMats` are never disposed (`SHARED_CAR_MATS`, `:1115`), and `applyStyle` only touches `carMats.body` (`:1136`), so sharing is safe. |
| Cockpit view | Unchanged. The cockpit eye sits inside the glass block, whose faces point outward and are culled from inside (`FrontSide`), exactly as today. |
| Test hook | A read-only `window.__mm.glass()` returns `{ car, heli }`, each `{ color, transparent, opacity }`, read from the glass mesh actually on the car and helicopter (each glass mesh is tagged `userData.glass = true` where it is built). |

## Tests

- Playwright (`prototype/tests/test_vehicles.py`): `__mm.glass()`. For both car and helicopter, `transparent` is false, `opacity` is 1, the colour's channels are each ≤ 0x20, and both report the same colour.
- Regression: `test_vehicles.py`, `test_heli.py` and `test_look_back.py` (cockpit and bumper views look out through or past the glass).

## Docs

- CHANGELOG `[Unreleased]` → `Changed`: "The car's windows are dark, tinted glass now — the same on the helicopter — instead of a murky, half see-through blue."
- `test-todo.md`: a "Dark car windows (#123)" section that checks the glass reads as dark and tinted in all 4 camera views (**C**), and on the helicopter (**F**), and that there is no flicker where the glass meets the body.

## Out of scope

- Clear glass with a car interior (seats, dashboard, driver). A separate issue if wanted; it is graphics work for Fable.
