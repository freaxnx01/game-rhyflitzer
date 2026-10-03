# Night driving with headlights and street lamps — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #2

## Goal

Night: lights / headlights (Licht/Scheinwerfer) on the car for driving at night.

Success: **L** (or the „Time of day" button on the start screen) switches the whole scene to night and back, in both graphic styles. At night the sky is dark, the fog is short and dark, the ambient light is low and a pale moon light replaces the sun. The car has two **headlights** — real spot lights that light the road ahead, with visible light cones and a glare at the lamps — and glowing red tail lights. Every **street lamp** from OpenStreetMap glows, and the few lamps nearest the car throw a light pool onto the road. By day nothing changes and nothing extra is rendered. The choice is not remembered across reloads.

## Starting point (verified 2026-10-03 on `main` @ `188eb0f`)

- **Lights and sky:** one `HemisphereLight` (`0xdfe8ff` / `0x6a5a40`, `prototype/index.html:804`), one `DirectionalLight` sun (`0xfff2d8`, `index.html:805-806`, shadow box ±180 m around the car), a shader sky sphere with `top` / `hor` colour uniforms (`index.html:807-808`) and a sun sprite (`index.html:809`). `stepCamera` moves sky, sun sprite and sun with the camera / car (`index.html:996`).
- **Styles:** `STYLES.original` / `STYLES.smooth` (`index.html:874-879`) hold `sky`, `fog` (a factory: linear 320–1400 m or `FogExp2(0.00095)`), `hemi` and `sunI` intensities, shadows, tone mapping. `applyStyle(k)` (`index.html:881`) rebuilds every material and sets sky, fog, hemi, sun. **T** toggles (`toggleStyle`, `index.html:894`); the style is **not persisted**.
- **The car:** `buildCompact` (`index.html:845-860`) draws the headlights and tail lights as unlit `MeshBasicMaterial` boxes at model (2.2, 0.82, ±0.6) and (−2.24, 0.86, ±0.62) (`index.html:857`); the group is scaled by `VEH.scale` = 1.3. Persistent sub-groups `flames` and `BLINK` are refilled by the builder (`buildCar`, `index.html:866`), which also sets `castShadow` on every descendant. `stepCamera` sets `car.visible = !v.eye && !HUD.carHidden` every frame (`index.html:993`): in the cockpit / bumper views the whole car group is invisible.
- **Street lamps:** OSM `highway=street_lamp` props (1,928 in the world file) are one `InstancedMesh` per kind (`propMeshes`, `index.html:637-648`), placed at `terrainH(x, z)` and rotated by `-rot` about y; the luminaire head sits at model (0.85, 5.8, 0) (`propGeometries`, `index.html:565`). The hand layout has no props (`L` is null).
- **Keys** (`index.html:889`): T, C, R, H, Enter, M, F1, `?`, Esc, F3, Tab, V, G, K, Q, E, `+`, `=`, `-`, J, N, driving keys. Claimed by open work: **B** (#65), **F** and Shift (#10), **Esc / P** (#83). `grep -c KeyL prototype/index.html` → 0: **L is free.**
- **Persistence:** `localStorage` holds only progress and the shared language: `mm.odo` (`index.html:917`), `mm.best2` (`index.html:1000`), `gg-lang` (`i18n.js:5`); the terrain file lives in IndexedDB. Style, camera, debug and boundaries are not remembered.
- **Overlay:** the start / result panel has a `.row` with `#startbtn` and `#stylebtn2` (`index.html:184-187`); `rerenderAll` (`index.html:1044`) re-renders every standing text on a language change.
- **Tests:** node `prototype/tests/*.test.mjs` for pure modules; pytest + Playwright `prototype/tests/test_*.py` on the hand layout (world and terrain blocked) or `needs_world`-gated on the real world file. `test_vehicles.py` pins `stepCar` with a golden trace. Screenshots for a human reviewer go to `docs/ai-notes/screenshots/<date>-<topic>/` (precedent: #45).
- **i18n (#9):** UI strings through `tr()` from `prototype/strings.js` (en and de, same keys, Swiss spelling).
- **Renderer:** three r170 (`index.html:198`), physically based light units (spot / point intensity in candela, `decay` 2).

## Decisions

| Topic | Decision |
|---|---|
| What it is | A **day / night toggle**, state `NIGHT = { on: false }`. No time cycle, no real-time clock. Night is a lighting profile applied on top of the active style, so both styles have a night look. |
| Switch | **L** toggles at any time (start screen too, like T) with a toast „Night" / „Day". The start / result panel gets a button `#nightbtn` next to the style button: „Time of day: Day" / „Time of day: Night". `toggleNight()` is the single entry point; the pause menu (#83) can call it for its own row. |
| Persistence | **Not remembered** — like the style (T). `localStorage` stays progress-only (`mm.odo`, `mm.best2`) plus the shared `gg-lang`. |
| Night look | Pure module `prototype/night.js` holds the constants `NIGHT_LOOK` and `lighting(style, night)`. **Original:** sky `#070b1a` → horizon `#1a2238`, linear fog `#1a2238` 200–900 m, hemisphere 0.18, moon 0.12. **Smooth:** sky `#0b1430` → `#2a3550`, `FogExp2(#2a3550, 0.0016)`, hemisphere 0.12, moon 0.25 (shadows stay on). Hemisphere colours at night `#3a4a7a` / `#101418`, the sun light becomes a moon `#aab8ff`; the sun sprite is hidden. **By day the profile returns today's values unchanged.** |
| Where it is applied | `applyStyle` hands its sky / fog / hemi / sun lines to a new `applyLighting()`, which reads `lighting(STYLES[styleKey], NIGHT.on)`. `toggleNight()` = flip `NIGHT.on`, `applyLighting()`, toast. `STYLES.*.fog` becomes plain data (`{ color, near, far }` / `{ color, density }`) with the same numbers. |
| Headlights | Two `SpotLight`s (`#fff2cc`, 150 cd, distance 60 m, half-angle 0.42 rad, penumbra 0.6, decay 2, **no shadows**) at the headlight boxes, aimed 40 m ahead and 3 m down; two translucent additive **cones** (14 m long, 2.2 m end radius, opacity 0.10, tilted 0.06 rad down) make the beams visible; four additive **glare sprites** (warm at the headlights, red at the tail lights). All live in a persistent group `LIGHTS` that the car builder refills (like `flames` / `BLINK`). |
| Why `LIGHTS` is not a child of `car` | In the cockpit / bumper views `car.visible` is false, and three.js skips invisible objects' lights. `LIGHTS` is a sibling in the scene; `stepNight()` copies the car's position / quaternion / scale every frame. `LIGHTS.visible = NIGHT.on && !HUD.carHidden` (and `&& !FLY.on` once #10 is in). |
| Tail lights | The red boxes are already unlit (`MeshBasicMaterial`) and read as lit at night; they get the red glare sprites. No brake lights, no rear light cone. |
| Street lamps | Three tiers, chosen for cost: (1) **one `Points` mesh** with an additive radial-gradient texture, one vertex per lamp head (`lampHeads(props, groundAt)` in `night.js`), size 2.5 m: 1,928 glows in one draw call. (2) A **pool of 6 `PointLight`s** (`#ffe0b0`, 40 cd, distance 25 m, decay 2) moved every 250 ms to the nearest lamp heads within 60 m of the car (`nearestLamps(heads, x, z, n)` over a spatial grid); unused pool lights keep intensity 0 so the light count — and the compiled shader — never changes within a night. (3) No emissive change on the lamp mesh (its one material is shared by every lamp). **No `SpotLight` per lamp.** |
| Day cost | `LIGHTS`, the glow points and the lamp pool group are invisible by day, so the day frame is exactly today's: zero extra lights, zero extra draws. Toggling recompiles the lit materials once (programs are cached afterwards). |
| Keys / strings | New keys in `strings.js` (en / de): `keyNight` (F1 line), `daytimeLabel`, `day`, `night`. F1 help gets `<kbd>L</kbd>` after the T line. |
| Helicopter (#10) | Flying at night: headlights off while `FLY.on` (the car is parked and hidden); the glow points draw the lit street network from above. No landing light. |
| Pause menu (#83) | Independent. #83 may add a „Time of day" row calling `toggleNight()` with the same strings; if #83 lands first, this issue adds nothing to its menu. Esc / P are not touched here. |
| Test hooks | `__mm.night()` → `{ on, sky, fog, hemi, hemiColor, sun, sunColor, sunSprite, headlights, spots, cones, glows, glowsVisible, lampLights, lampsVisible }`; `__mm.toggleNight()`. |

## Assumptions

- **A1** [confirmed] A day / night **toggle** (key L or a menu option), no time cycle and no real-time clock. User decision 2026-10-03.
- **A2** [high] Key **L**. `grep -c KeyL prototype/index.html` → 0; the heli spec listed F, I, L, O, P, U, X, Y, Z as free (`docs/superpowers/specs/2026-10-03-helicopter-mode-design.md:20`), and F (#10), B (#65) and Esc / P (#83) are taken since. Rejected: a second meaning on T (two toggles on one key).
- **A3** [med] The „menu option" is a `#nightbtn` on the start / result panel next to `#stylebtn2` (`index.html:184-187`), not a second HUD button at the bottom (the HUD already owns both corners and the centre bottom: `#stylebtn`, `index.html:81`, `#game-nav`, `index.html:1118`). The pause menu (#83) is the natural second home and reuses `toggleNight()`.
- **A4** [high] **Not persisted.** Precedent: the style (T) is not remembered (`applyStyle('original')` at every load, `index.html:1102`); `localStorage` carries only `mm.odo` / `mm.best2` (`index.html:917`, `1000`) and the shared `gg-lang`. Rejected: a `mm.night` key.
- **A5** [med] The night colours, fog ranges and intensities (Decisions). They are a look, not a rule; all of them sit in `NIGHT_LOOK` and the screenshot task exists so a person can judge and retune them. Rejected: one shared night profile for both styles (the smooth style uses ACES tone mapping and shadows, `index.html:877`, and needs its own numbers).
- **A6** [med] Street lamps: additive `Points` glows for every lamp plus a pool of 6 nearest `PointLight`s within 60 m. Rejected: a `SpotLight` per lamp (1,928 lights — impossible), emissive heads (the lamp `InstancedMesh` has one material for mast, arm and head, `index.html:644`), a light pool decal per lamp (a second 1,928-quad mesh for a weaker effect than real lights). 
- **A7** [med] Headlights as two `SpotLight`s without shadows plus visible cones and glare sprites; tail lights stay the unlit red boxes plus glare. Rejected: shadow-casting spots (two more shadow maps per frame in the smooth style), a projected light texture on the road (needs a decal system that does not exist).
- **A8** [med] Headlights hide with **V** (no beams floating without a car) and stay on in the cockpit / bumper views (you see your own beams on the road). Evidence: `car.visible` is driven by both in `stepCamera` (`index.html:993`); `LIGHTS` is a scene sibling so the eye views keep it.
- **A9** [high] Day values stay byte-identical: `lighting(style, false)` returns the style's own sky / fog / hemi / sun numbers; `STYLES.*.fog` changes from a factory to plain data with the same numbers (`index.html:875`, `877`). The far plane (`index.html:803`) is unchanged.
- **A10** [high] New UI text goes through `tr()` with en and de entries (`strings.test.mjs` enforces equal keys and no `ß`).
- **A11** [med] No moon sprite and no stars; the sun sprite is simply hidden at night. Rejected: a moon sprite — small win, extra texture; a follow-up if wanted.
- **A12** [med] L is allowed during a race and changes nothing about timing or records (a lighting choice, not a shortcut). Evidence: T behaves the same (`index.html:889`).
- **A13** [med] The hand layout gets no lamp glows (no props, `index.html:754`); the single Smile-Kreisel lamp (`index.html:483`) stays dark. The headless tests on the hand layout therefore check sky, fog, lights and headlights; the lamp checks are `needs_world`-gated.

## Consequences

- The first switch to night in a session compiles the lit materials with 2 spot and 6 point lights (a short hitch, as T has today); switching back reuses the cached day programs.
- The night fog is shorter (900 m linear / 0.0016 exp): the view from the helicopter (#10) and down long roads is darker and shorter than by day. Village names are unfogged sprites and stay readable.
- Unlit (`MeshBasicMaterial`) things stay bright at night: checkpoint pillars and rings, the finish beam, station boards, the „P" and bus-stop signs, the number plate, street-name decals and house-number labels. They read like lit signs, which is fine for an arcade night; a dimming pass is a follow-up.
- The 6 pool lights snap to new lamps every 250 ms; at speed a light pool can pop in or out a few metres ahead. The glow points never pop.
- In the original style (no tone mapping) the headlight pool right in front of the car can clip to white; in the smooth style ACES keeps it soft. The screenshot task is where this gets judged.
- The smooth style's shadows now come from the moon light (0.25): soft, dark-blue shadows. The water's Phong specular reflects the moon.
- Lit materials now evaluate 8 dynamic lights per fragment at night. Desktop is fine; phones are untested → playtest note.
- `V` hides headlights with the car; `R`, `J` and the map do not touch night.
- Not remembered: every reload starts by day.

## Out of scope

Time cycle or clock, moon and stars, brake lights, dimming unlit signs at night, lit windows in houses, headlight shadows, a night entry in the pause menu (#83 decides), a landing light on the helicopter (#10), persisting the choice.
