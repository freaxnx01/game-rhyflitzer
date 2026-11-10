# Postauto "Vielen Dank!" display (#800)

Goal: when the player lets a Postauto pull out of a stop (waits behind it), the bus's rear display shows a dot-matrix
smiley and "Vielen Dank!" / "Thank you!" for 4 s, then returns to the line number.

## Assumptions

- **A1** [confirmed] Route: "Enrich, then pipeline" -- the plan is dispatched to the ai-implement pipeline (opencode/GLM), so it is small, concrete, exact code and failing tests per task, at most ~10k characters.
- **A2** [confirmed] Behaviour, trigger, style, rate limit and localisation: "exactly as written in the issue body (player behind the pulling-out bus within ~40 m in the same lane, slows/stays behind instead of overtaking; rear display shows smiley + "Vielen Dank!" / "Thank you!" for ~4 s; once per departure)".
- **A3** [high] The decision is a pure function `thankDue` in `postauto.js` beside `obstacleGap` (`postauto.js:319`), tested with node. The bus state it reads already exists: `phase`, `s`, `leftAt` (set at departure, `postauto.js:289`).
- **A4** [confirmed] Rear only, separate material: "Rear only, separate material" ("Clean like real life, but needs a rebuild of the bus model (tools/prepare-bus.mjs) and a larger plan"). The front and side displays keep line + destination at all times.
- **A5** [med] The rear texture is free to use its whole area, so the thank-you is a 7x7 dot smiley above ONE line of text ("Vielen Dank!" / "Thank you!"), centred, font fitted to the width. Rejected: two lines beside the smiley (that was only needed for the shared 22 % window).
- **A6** [med] "Waits behind, same lane": the player is 6.1..40 m behind the bus centre along the route (`trackRoute`, seeded 30 m back because it only scans 10 m behind its seed, `route.js:259`), within 2.5 m of the lane centre (`routeLaneOffset`), and at most 20 km/h. The side of the road is not distinguished (a slow oncoming car in the opposite lane would also count).
- **A7** [med] A departure is thanked at most once, and only within 10 s after the bus left the stop (`leftAt`). A bus placed already driving (`leftAt = -Infinity`) is never thanked. The "player stops to let a bus out of a terminus" case is the same rule (the terminus departure also sets `leftAt`).
- **A9** [med] No model rebuild: the split is done at runtime in `index.html`. The model contract is "+x forward, no node transform left except the wheels" (`tools/prepare-bus.mjs:12`) and the rear quad sits at x = -5.825, the front at +5.820, the side at x 2.447..4.009 (spec 2026-11-07 table), so the Display primitive's triangles whose three vertices lie within 0.1 m of its most negative x are the rear quad. The Postauto's own clone of the geometry gets two groups (front/side, rear) with a material array [front, rear], and the rear vertices' UVs are renormalised to 0..1 so the rear texture covers the whole quad. Rejected: rebuilding bus.glb (committed asset change, a `sharp`/gltf-transform toolchain outside the repo, no gain). If the split finds no rear triangles the bus keeps one material and simply never shows the thank-you (a console warning). The player's bus and the cached glTF stay untouched.
- **A10** [med] The rear texture is 330 x 200 px (the quad is 0.464 x 0.281 m) and shows the line number centred in normal operation (it used to show the left 22 % of the shared texture). The UV renormalisation keeps the u/v direction, so the existing correct reading direction of the rear is kept (the maintainer checks it in the playtest).
- **A8** [high] Localisation goes through `strings.js` (`tr()`), en and de, like every UI text; the language is read when the thanks starts.

## Consequences

- The rear line number looks different from before: centred and larger instead of cropped from the shared texture (A10).
- A Postauto's Display mesh gets its own geometry copy and a second material (a few KB per bus); two more small canvas textures per bus.
- Two repaints of the rear texture per thanked departure (start and end); the front texture is not repainted.
- Debug hook `__mm.postauto().buses[].led` gains `thanks` (the text or null); `__mm.postautoDisplay()` gains `frontMap`, `rearMap` (texture uuids) and `split`.
