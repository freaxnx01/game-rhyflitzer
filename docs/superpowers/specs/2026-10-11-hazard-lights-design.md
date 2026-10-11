# Hazard lights (#271) — design

Depends on #270 (`prototype/lights.js`, `lampState`, `LIGHTS`, `applyLamps`). Shared light setup is described in `2026-10-11-car-lights-switch-design.md`; this issue only adds the input and the HUD behaviour.

## Behaviour

- Key **1** (`Digit1`) toggles `LIGHTS.hazard`. Toast "Hazard lights on" / "off".
- On: both amber blinker boxes (`BLINK.left`, `BLINK.right`) and both HUD arrows (`#blL`, `#blR`) flash together at the existing 350 ms rhythm.
- Hazard overrides Q/E and the autopilot's blinker: while hazard is on, Q/E and `AUTOP` may still change `HUD.blinker`, but the display shows both sides. Hazard off -> the stored blinker shows again. Already encoded in `lampState` (hazard wins).
- Independent of L: hazard works with lights off.
- Session only; not reset by R.

## Keys (checked)

Grepped all `prototype/*.js` (incl. `pause.js`, `carselect.js`) and `index.html`: no `Digit*` binding anywhere; KeyL is #270's. Taken letters: A B C D E F G H I J K L M N O P Q R S T U V W X. **Digit1** chosen over KeyZ/KeyY, whose printed label differs between Swiss QWERTZ and US layouts (bindings use `e.code`).

## Assumptions

- **A1** [high] Reuse the blinker boxes and arrows; no new meshes. `BLINK` groups and `#blink` already exist (`index.html` `const BLINK`, `<div id="blink">`).
- **A2** [high] Hazard wins over Q/E in `lampState` (tested in #270). Rejected: hazard clearing the blinker; a kid pressing Q mid-hazard would lose state.
- **A3** [med] Key `1`. Rejected: Shift+Q (not discoverable).

## Needs maintainer

- **[needs maintainer]** Key for hazard. Default: `1`.
- **[needs maintainer]** Hazard sound (tick-tock)? Default: none; `sound.js` has no blinker tick today.

## Consequences

- Autopilot (`AUTOP.ownBlinker`) is untouched; hazard just masks it.
