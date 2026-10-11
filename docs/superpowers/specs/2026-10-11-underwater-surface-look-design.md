# The water surface seen from below (#217) — design

Status: enriched 2026-10-11 (`--quick`). Playtest entry 14 of `docs/ai-notes/feedback/2026-10-10-playtest.md`. Builds on #101.

## Finding (one reproduction, headless Chromium, real world, `main` @ `b4d1279`)

Car on the bed 6 m down, chase camera 3 m under the surface looking ahead: the upper part of the frame is a dark navy-teal band, darker than the murk
below it, with no texture and no light — the tester's "dark board" (screenshot reviewed 2026-10-11, no code change).

Cause, from the code: the surface is the same mesh as from above, `MeshPhongMaterial` (`MeshStandardMaterial` in the Smooth style) with
`side: THREE.DoubleSide`, `opacity 0.96`, `vertexColors`, specular highlights (`index.html`, the `STYLES` entries, `role === 'water'`). Seen from below
three.js flips the normal of a back face, so the sun (above) and the hemisphere light (scaled by `UW.hemiFactor` 0.6, `setUnderwater`) light the *other* side: the underside
only gets a sliver of ambient light, and the sun disc is hidden (`sunSprite.visible = !on`). Result: a dark, flat, opaque ceiling.

## Design

While the camera is under the surface, make the surface's material self-lit with a bright teal, lighter than the fog colour, so it reads as the lit underside of the water
(a glowing ceiling); restore on the way up. No new meshes, no new materials.

- `prototype/underwater.js`: `SURFACE_UNDER = { emissive: '#3f9fb0', intensity: 0.8 }` and `surfaceLook(on)` -> `{ emissive, emissiveIntensity }` (on: the teal; off: black, 0). Pure, node-tested.
- `index.html`: `waterUnderside(on)` sets `MESH.water.material.emissive` / `emissiveIntensity`; `setUnderwater(on)` calls it (it already runs on every camera crossing and at the end of `applyStyle`, so the Smooth style and the T key are covered).
- Hook: `__mm.underwater().surface = { lit }` (true while the underside glow is on) for the test.

## Assumptions

- **A1** [med] Emissive glow, not a second "underside" mesh with its own material. Rejected: a second plane (z-fighting, a second set of vertices for the ring-shaped river polygons); a `ShaderMaterial` with Snell's window and caustics (too much for a buildless prototype).
- **A2** [high] Opacity stays as is (0.96 / 0.9): from below a lighter ceiling is enough, and changing it would also change the view from above only if not restored.
- **A3** [low] `[needs maintainer]` The look: a flat bright teal ceiling. If it should ripple or show a sun glow, that is a follow-up. The colour/intensity are one constant (`SURFACE_UNDER`) to tune after looking at it.
- **A4** [med] The fix is judged by eye once (a screenshot in the PR); the automated test only pins that the glow turns on under the surface and off above it.

## Consequences

- From above nothing changes: the glow is off whenever the camera is dry (and restored after `applyStyle`).
- The brighter ceiling also lights nothing else (emissive does not light other objects).
