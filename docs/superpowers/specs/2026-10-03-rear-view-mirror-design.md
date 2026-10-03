# Rear-view mirror — design

Issue #92 (split off from #24). Related: #65 (hold B looks back, merged).

## Goal

In the **cockpit view** a small rear-view mirror sits at the top centre of the screen and shows what is behind the car, live. It needs no key and no setting: it is there when the driver's eyes are the camera and gone otherwise. Success: in the cockpit view you can see a car (or anything) that chases you without pressing B; in the chase views, the bumper view, the helicopter, the pause menu's frozen picture aside, nothing changes.

## Starting point (verified 2026-10-03 on `main` @ `ccdcca0`)

- One `WebGLRenderer` (`prototype/index.html:853`), one `camera` (`:874`), one `scene`. `loop` (`:1223`) calls `stepCamera(dt)` then `renderer.render(scene, camera)` once. `resize()` (`:958`) sets the size in CSS pixels; the pixel ratio comes from the graphic style (`pixel:` in `STYLES`, `:950`/`:952`: up to 1.5 original, up to 2 smooth).
- Views: `CAM_VIEWS` (`:1082`) has chase, near, cockpit (`eye: true`), bumper (`eye: true`). The eye position is `vehEye(v.k)` = the table's `VEH.camera[k].eye` times `VEH.scale` (`:1083`), so it follows the vehicle table (#69). The cockpit eye is `[-0.25, 1.22, -0.38]` in model metres (`:905`).
- In an eye view `car.visible` is false (`stepCamera`, `:1091`), so the car's own body never appears in the picture.
- #65: `CAM.back` is true while B is held (`:1085`, `:1090`).
- #10: `FLY.on` is the helicopter; `stepCamera` calls `flyCamera` (`:1092`).
- #83: while `PAUSE.on`, `loop` skips all stepping and only calls `renderer.render(scene, camera)` (`:1223`).
- The minimap `#br` (`:50`) and the HUD are DOM above the canvas. The full map (#77, specified in `docs/superpowers/specs/2026-10-03-tab-full-map-design.md`, not built yet) enlarges `#br` into the middle of the screen while Tab is held. Tab is read as `keys.Tab`.
- Night driving (#2, specified in `docs/superpowers/specs/2026-10-03-night-driving-design.md`, not built yet) puts the headlights in the same `scene` as `SpotLight`s and additive cones.
- Touch devices are detected by `@media (pointer:coarse)` in CSS (`:36`, `:77`); there is no JS flag.
- The sky dome (radius 3800) is moved to the camera position every frame (`stepCamera`, `:1095`); the camera far plane is 4200.
- Keys taken: B C E F G H J K L M N O P/Esc Q R T V Tab Enter Space F1 F3.

## Decisions

| Question | Decision |
|---|---|
| When it shows | **Cockpit view only** (`camView` 2), when also: no B held, not flying, no start/result overlay, no full map (Tab held), not on a touch device. |
| Camera | A second `PerspectiveCamera` (fov 36, aspect 3.2, near 0.5, far 4200) at the cockpit eye's forward and height offset but on the **car's centre line** (side offset 0, as a real mirror), 0.1 m higher, looking straight back along the car's heading. |
| How it is rendered | Into a small **`WebGLRenderTarget` (256 × 80)**, then drawn as a textured quad in an inset **viewport + scissor** of the main canvas at the top centre, after the main render. The quad is flipped horizontally (UV mapping) because a mirror image is reversed; the camera projection is not mirrored, so triangle winding stays correct. |
| Cost control | The target is re-rendered **every second frame**; the other frames only redraw the quad. The shadow map is not recomputed for the mirror pass (`renderer.shadowMap.autoUpdate = false` around it). The mirror camera sees the same scene; no extra objects are built. Fixed 256 × 80 independent of the screen and of the pixel ratio. |
| Touch devices | **Off.** `matchMedia('(pointer:coarse)')` is read once at start. Phones are the weakest GPUs, and the touch bar has no room for a driving view anyway. |
| On/off | **Always on in the cockpit view, no key.** C already switches the view; B hides it while held (looking back would show the road ahead in the mirror). Nothing is added to the F1 help, the strings or the touch bar. |
| Look | A dark frame in the HUD's style (`var(--ink)` fill, 4 px steel-light bevel as `#br`), 22 % of the screen width, clamped to 220–420 px wide, 80/256 of that tall, 12 px below the top edge (below the safe-area inset). Drawn in the canvas, so no DOM element and no layout change. |
| Pause (#83) | **Frozen**: while `PAUSE.on` the quad is drawn from the last rendered target, the target is not re-rendered. |
| Night (#2) | Nothing special: the mirror camera renders the same `scene`, so it sees the chaser's headlights and the lit street lamps as soon as #2 lands. The car's own tail lights are not visible (the car is hidden in the cockpit view). |
| Helicopter (#10) | No mirror while `FLY.on`. |
| Full map (#77) | Hidden while Tab is held (the map takes the middle of the screen). |
| Car size (#69) | The camera position is `vehEye('cockpit')` (already scaled by `VEH.scale`), so a larger or smaller vehicle moves the mirror camera with it. Side offset forced to 0. |
| Pure logic | New `prototype/mirror.js` (ES module, like `heli.js`/`pause.js`): `mirrorVisible(state)`, `mirrorRect(w, h, inset)`, `mirrorDue(frame)`. Node-testable without a browser. |
| Test hook | `__mm.mirror()` → `{ visible, renders, frame, rect: { x, y, w, h }, pos: [x, y, z], look: [x, y, z] }`. `renders` counts the target renders. |
| Version / changelog | One sentence under `[Unreleased] / Added`. No version bump. |

## Assumptions

- **A1** [med] The mirror shows in the cockpit view only. Rejected: also as a HUD inset in the chase views and the bumper view. In the chase views the camera is behind the car and the car body is visible, so a mirror adds a second picture of the same thing; `CAM_VIEWS[k].eye` (`index.html:1082`) already marks the two views that are "the driver's eyes", and the bumper view has no windscreen to hang a mirror on.
- **A2** [med] Rendering into a 256 × 80 `WebGLRenderTarget` and drawing it as a quad in a viewport inset. Rejected: a second scissor render of the full scene directly into the canvas (the default framebuffer is cleared by the main render every frame, so the mirror would have to be rendered every frame at the screen's pixel ratio, up to 2×, and could not be frozen in pause).
- **A3** [med] Re-render the target every second frame. Rejected: every frame (doubles the draw calls of the whole scene), every fourth frame (a chaser visibly stutters in the glass). At 60 fps a mirror at 30 fps is not noticed; at 30 fps it is 15, still readable at 256 px.
- **A4** [med] Off on touch devices (`pointer:coarse`). Rejected: on everywhere (the scene is the heavy part: `renderer.info` reaches thousands of draw calls in the OSM world; phones are the weakest players). The repo already keys touch behaviour on `pointer:coarse` (`index.html:36`, `:77`).
- **A5** [high] No key, no toggle: the mirror follows the camera view. Rejected: a new toggle key (the user listed 23 keys as taken; C already controls the view).
- **A6** [med] The mirror camera sits on the car's centre line, 0.1 m above the eye. Rejected: at the driver's seat offset (a real mirror is in the middle of the windscreen; the offset image would also show the car's pillar-free rear differently from a real mirror).
- **A7** [med] Hidden while B is held. Rejected: showing the forward view in the mirror (confusing, and the same road twice).
- **A8** [high] Mirror image is made by flipping the quad's UVs. Rejected: a negative-x projection matrix (it reverses the triangle winding and needs `material.side` games for every material in the scene).
- **A9** [med] Fixed 22 % of the screen width clamped 220–420 px, aspect 3.2 : 1. Rejected: a size setting (not asked for).
- **A10** [high] Shadows are not recomputed for the mirror pass. Rejected: letting the pass update them (a second shadow render per mirror frame in the smooth style; the sun does not move with the camera, so the map from the main pass is valid).

## Consequences

- Cost: in the cockpit view on a non-touch device the scene is drawn about 1.5 times per frame on average (the mirror frames render the whole scene at 256 × 80, which is cheap in fill rate but not in draw calls). The other views and touch devices pay nothing. `__mm.physMs` is unaffected (the pass is outside it).
- The mirror camera sees fog, sky and the world's far plane (4200), so distant houses pop in the mirror at the same distance as in front.
- With the car hidden, the mirror never shows the car's own rear. It shows the road, other scenery and (later) chasing vehicles.
- A GPU-memory leak test (`test_rebuilds_free_gpu_memory`, `prototype/tests/test_vehicles.py:153`) sees one extra render target and one extra texture that exist from start and do not grow; the baseline in that test is taken after start, so it stays green. This must be checked once (see plan, Task 4).
- When #77 lands, its Tab handling and the mirror both read `keys.Tab`; the mirror simply checks it, it owns nothing there.

## Out of scope

Mirror in the chase or bumper views, side mirrors, a mirror toggle or size setting, mirror shaking or dirt, showing the own car's rear, persisting anything, the pause menu's mirror entry.
