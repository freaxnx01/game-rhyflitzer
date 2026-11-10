# Postauto "Vielen Dank!" display (#800)

Goal: when the player lets a Postauto pull out of a stop (waits behind it), the bus's rear display shows a dot-matrix
smiley and "Vielen Dank!" / "Thank you!" for 4 s, then returns to the line number.

## Assumptions

- **A1** [confirmed] Route: "Enrich, then pipeline" -- the plan is dispatched to the ai-implement pipeline (opencode/GLM), so it is small, concrete, exact code and failing tests per task, at most ~10k characters.
- **A2** [confirmed] Behaviour, trigger, style, rate limit and localisation: "exactly as written in the issue body (player behind the pulling-out bus within ~40 m in the same lane, slows/stays behind instead of overtaking; rear display shows smiley + "Vielen Dank!" / "Thank you!" for ~4 s; once per departure)".
- **A3** [high] The decision is a pure function `thankDue` in `postauto.js` beside `obstacleGap` (`postauto.js:319`), tested with node. The bus state it reads already exists: `phase`, `s`, `leftAt` (set at departure, `postauto.js:289`).
- **A4** [med] The three display quads share one texture (`index.html:4206`); the rear quad shows only its left 22 % (u 0.004..0.22, `busdisplay.js:12`, spec 2026-11-07 A5). The thank-you block is drawn into exactly that window, so for 4 s the front and side displays show it instead of the line number too (destination text unchanged). Rejected: a separate rear material, which needs a model rebuild (`tools/prepare-bus.mjs`); the issue allows the side display, but "front unchanged" is only met for the destination.
- **A5** [med] The text is split at the space into two lines ("Vielen" / "Dank!", "Thank" / "you!") beside a 7x7 dot smiley, because the window is only ~221 x 128 texture px. Font size is fitted like `displayLayout` does.
- **A6** [med] "Waits behind, same lane": the player is 6.1..40 m behind the bus centre along the route (`trackRoute`, seeded 30 m back because it only scans 10 m behind its seed, `route.js:259`), within 2.5 m of the lane centre (`routeLaneOffset`), and at most 20 km/h. The side of the road is not distinguished (a slow oncoming car in the opposite lane would also count).
- **A7** [med] A departure is thanked at most once, and only within 10 s after the bus left the stop (`leftAt`). A bus placed already driving (`leftAt = -Infinity`) is never thanked. The "player stops to let a bus out of a terminus" case is the same rule (the terminus departure also sets `leftAt`).
- **A8** [high] Localisation goes through `strings.js` (`tr()`), en and de, like every UI text; the language is read when the thanks starts.

## Consequences

- For 4 s the front and side line number is replaced by the smiley block (A4).
- Two repaints of a 1024x128 canvas per thanked departure (start and end); the texture is the bus's own clone, shared textures untouched.
- Debug hook `__mm.postauto().buses[].led` gains `thanks` (the text or null) for tests.
