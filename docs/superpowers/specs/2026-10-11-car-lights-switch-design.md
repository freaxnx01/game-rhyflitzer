# Car lights on/off (#270) — design

Shared light setup for #270 (lights), #271 (hazard) and #230 (brake lights). #270 lands the shared part; #271 and #230 only wire one input each. Implement #270 first.

## Behaviour

- **L** toggles the headlights and the tail lights on/off, any time of day, in every camera. Toast: "Lights on" / "Lights off" (`toast(tr(...))`, 4 s).
- Off = today's look (nothing changes for existing players). On = the lenses glow clearly: head lenses bright warm white, tail lenses a steady red.
- State is `LIGHTS.head` (boolean), session only, not persisted. Not reset by R, car swap or race restart. #2 (automatic night headlights) will later OR into the same flag.

## Shared light setup (the part #271 and #230 reuse)

New pure module `prototype/lights.js`, node-testable like `blitz.js`:

`lampState({ head, hazard, blinker, braking, flashOn }) -> { headLevel, tailLevel, left, right }`

- `headLevel`: `LAMP.head.on` if `head`, else `LAMP.head.off`.
- `tailLevel` (priority): `braking` -> `LAMP.tail.brake`; else `head` -> `LAMP.tail.rear`; else `LAMP.tail.off`. Brake light also shows with the lights off (that is what #230 asks).
- `left` / `right` (the amber blinker boxes + HUD arrows): `hazard` -> both = `flashOn`; else the side equal to `blinker` = `flashOn`. Hazard wins over Q/E.
- `LAMP` values: head off 0.35 / on 2.0, tail off 0.45 / rear 1.0 / brake 2.4 (today's `carMats.lampHead` / `lampTail` emissiveIntensity are 0.35 / 0.45).

Application (one function `applyLamps()` called from `hud(dt)` where the blinker block is today):
- compact: set `carMats.lampHead.emissiveIntensity` and `carMats.lampTail.emissiveIntensity` (shared by all compact lamp meshes, so no per-mesh work).
- DeLorean: its lamps are local `MeshBasicMaterial`s (`hl`, `tl` in `buildDelorean`). Hoist them to a module-level `delLamps = { head, tail }` and set `color` by lerping dim -> bright by level. Same `lampState` numbers.
- No real `THREE.Light` objects: adding lights changes every lit material's shader program (a recompile hitch, see #201). Glow is emissive only.
- Debug hook `window.__mm.lights()` -> `{ head, hazard, braking, headLevel, tailLevel, left, right }` for tests.

## Keys (checked)

Grepped every `prototype/*.js` (incl. `pause.js`, `carselect.js`) and `prototype/index.html`. Taken: A B C D E F G H I J K M N O P Q R S T U V W X, F1 F3 F5, Tab, Esc, Enter, Space, Ctrl, +/-, ?. **KeyL is free.** Help overlay rows in both `#help` blocks of index.html plus `keyLights` in `strings.js` (en + de).

## Assumptions

- **A1** [high] Emissive-only glow, no SpotLights. Rejected: real headlight cones. `carMats.lampHead/lampTail` already exist and are shared (`index.html` `const carMats`), and #201 notes lights change the shader programs.
- **A2** [high] One shared pure `lampState` for all three issues. Rejected: three independent toggles in `hud()`; they would fight over the same materials.
- **A3** [med] Key **L**, one toggle for head+tail together. Rejected: separate head/tail keys; no real use for a kid.
- **A4** [med] Not persisted. Rejected: localStorage; a lamp left on across sessions is surprising.

## Needs maintainer

- **[needs maintainer]** Persist the lights state? Default: no.
- **[needs maintainer]** Touch button for lights? Default: none for now (no spare space next to `#tH`).

## Consequences

- When #2 lands, automatic night lights set the same `head` flag; manual L should then override auto. Not decided here.
- Both `#help` blocks grow by one row.
