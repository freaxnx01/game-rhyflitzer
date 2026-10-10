# TODO

## Next session prompt

Continue Map Madness (codename Rhyflitzer). Read README.md and docs/ first.
1. Run pipeline/terrain.py for the default region (Swiss side is automatic), load the .mmh in prototype/index.html, and check the Hauptstrasse climb and curve in Sisseln toward Laufenburg against the real terrain.
2. ~~Next pipeline step: roads, river and buildings from OSM (Geofabrik extract + osmium, not the public Overpass API) to replace the hand-traced layout. See docs/04 and docs/08.~~ Done 2026-10-01, see docs/11-pipeline-osm.md.

Status 2026-09-29:
- Item 1 done. The .mmh builds (10.7 MB, Swiss side only) and loads in the prototype. The Sisseln village section matches OSM within 1–7 m. The climb is wrong: the real road climbs ~13 m diagonally north-east at ~7 % from the Sissle bridge (x≈1440) to x≈1720, while the prototype hits the terrace edge head-on (~40 % wall at x 1600–1620). The curve toward Laufenburg is really at x≈2950, not x≈2300. The Smile-Kreisel is ~65 m too far west (OSM: x≈1270). The DEM shows the creek bed under the Sissle bridge (5 m dip), so bridges need their own deck profile.
- Item 2 not started. Brainstorming began: first open question is how the prototype loads the OSM world (file picker like .mmh / fetched data/world.json / committed JS module). Use `osmium extract -s simple` (smart runs out of memory on 12 GB).

## After OSM world (pipeline step 2)

Playtest (with the user; Original and Smooth style):

[ ] **1.** Start, then west and down the climb: left/right bends, 7 % grade, no wall, no dip at the Sissle bridge.
[ ] **2.** Checkpoint lap including the Holzbrücke shortcut toast (gate t>40 is measured from the way start, not the driving direction).
[ ] **3.** Chimney visible from the Sisseln terrace; check fog distance (faint in Original from ~1 km).
[ ] **4.** Frame rate subjectively equal to the hand-traced layout.
[ ] **5.** FINISH snaps onto the Münsterplatz pedestrian way and CP5 to a living street (51.8 m); check this feels right.

Follow-ups:

- Ortstafeln from OSM `traffic_sign=city_limit`.
- Verify marking dash lengths against the VSS SN 640 850 norm itself (only cantonal guidelines quoting it were seen); ausserorts would be 3/6 m, needs an inner/outer-town flag.
- Plattform Sisslerfeld model (anchor exists, no model).
- German DGM1 terrain (the German side is flat; water may float above flat banks).
- Height floor for tiny OSM height tags in the pipeline (the prototype clamps flat buildings to 3 m).
- Rail pieces that become a MultiLineString at the clip edge are dropped silently.
- World-file robustness: wrap layoutFromWorld/sdfSampler/waterIndex in try/catch and fall back to the hand-traced layout.
- Smoke tests can fail on transient 403s from third-party CDNs (fonts, buttons.github.io); ignore third-party resource errors in the console filter.
- Mark textures miss the max-anisotropy loop (blur at grazing angles).
- Markings run through junction mouths (real ones are interrupted); bridge decks have no markings.
- Start-screen blurb still says "traced by hand" in OSM mode.

## After pipeline step 2

- **Physics spike (throwaway):** try the "ball car" from mrdoob's Starter-Kit-Racing (crashcat, MIT) on the measured terrain around the Sisseln climb, and compare the feel with the prototype's own `stepCar`. The car is one rolling sphere in crashcat; the model's heading is steered directly and decoupled from the sphere's momentum, which is what makes it drift (`js/Vehicle.js`, `js/Physics.js`). crashcat is pre-1.0 (the kit pins 0.0.3). Then decide: crashcat vs. Rapier (docs/03) vs. own physics.

## HUD layout (found 2026-09-30, not fixed)

- Phone width (390 px): the checkpoint arrow/distance (`#tc`) overlaps the time and checkpoint plates, and `#tl` (242 px) overlaps `#tr` by ~11 px.
- Window width ~1000 px: the minimap covers the right half of the hub bar (`#game-nav`).
- Camera: 62° vertical FOV gives over 100° horizontal on wide windows (fisheye look). Consider clamping the horizontal FOV.

## OSM world — open from the final review (2026-10-01)

- **Smoke-test console filter too broad** (`prototype/tests/test_smoke.py`, commit 48ef3bf): it ignores every console error from other origins, including three.js on cdn.jsdelivr.net (geometry/shader errors would pass silently). Narrow it to `api.github.com` (the rate-limited Star button) or to "Failed to load resource" messages from other origins.

## Playtest feedback (2026-10-01, from the user)

Done on `feat/publish-world` (2026-10-01): world and terrain published for GitHub Pages (the missing chimney, water tower, DSM halls, motorway and Sissle were the hand-traced fallback online), Holzbrücke rail scraping, Plattform placeholder, Winkelacker / Bodenackerstrasse quarter (all houses), N nitro, J jump, grass/fields over the road, car sinking into the Smile-Kreisel, rails drawn across the track.

Still open:
- Playtest 2026-10-02 (live version):
  - ~~Sissle invisible from the bridge~~ — done 2026-10-02: centre-line water is exported as `streams` and draped on the ground (flat 500 m chunks were under the ground on a stream falling 25 m).
  - **Bumper/cockpit camera on a steep slope** (e.g. the Sissle dam) looks into the ground mesh.
  - **Railway down into the Sissle valley / through water:** railway bridges over roads are decks over a walled underpass since #119; elsewhere (and under road bridges) the track ribbon still follows the terrain.
  - Issues filed: village names from afar #16, building heights from swisstopo #17, autopilot #18, region east to Laufenburg #19, HUD/controls bundle (help, compass, odometer, car toggle, Blinker, water names, Tab time-lapse) #20; minimap magnifier added to #11.
- Issues: helicopter #10, minimap zoom + double-click #11, road names in the HUD / house numbers / station labels #12, forests incl. Sisslerwald #13, horn + engine sound #14.
- Vehicle windows transparent.
- **Painted street names** (`streetNames()`): 45 m decal, upside down when driving west, sticks out in bends → drop once #12 shows the name in the HUD (asked the user).
- **Railway:** drivable on purpose (user: fine); the ribbon is 5 m wide, real gauge 1.435 m — narrower bed plus ballast would look better.
- **Smile-Kreisel:** the smileys render grey steel — check what the user meant. (The floating apron/island is #222.)
- Sissle is buffered at the generic river width (20 m); the real stream is far narrower → `width` override in the pipeline.

## Ideas (2026-10-01, from the user)

- **A. The Sissel stream fully visible**, flowing into the Rhine: the whole course in the play area, as visible water, with its mouth at the Rhine.
- **B. Dam track along the Sissel:** before the Smiley roundabout, a turn off the road onto the dam, then drive along the Sissel down to the Rhine. Check whether OSM maps the dam path (track/path tags) or whether it has to be added as a game-only road.

- **C. Scenic flight over the Fricktal:** drive to Schupfart (Flugplatz Fricktal-Schupfart, grass runway), leave the vehicle, board a small plane, take off from the grass strip and fly a round over the Fricktal. Needs: on-foot/vehicle switch (ties into the vehicle issues #5–#7), flight model, and a terrain area far larger than the current driving bbox (check whether Schupfart is inside it; a flight needs a coarse outer terrain ring).

## Tooling

- Update the `freax-agent-skills` marketplace: the local `sync-ai-instructions` is 0.2.0 and still fetches the removed `ui-*` skills (404). Upstream `freaxnx01/agent-skills` fixed that in 0.4.0 (`2b8f6eb`, 2026-07-26). Run `claude plugin marketplace update freax-agent-skills`, then update the plugins via `/plugin`; other plugins from that marketplace are likely stale too.

## UI mockups (design/mockups/)

The mockups are the visual spec for all menus and the HUD. They come from a Claude Design canvas; the files in git are a snapshot.

### How to read them
- Each `*.dc.html` is one 1920×1080 artboard: plain HTML with inline styles inside `<x-dc>`, plus a tiny logic script. Read the markup to get exact colors, sizes, spacing, fonts and layout.
- Do NOT try to render or run them: they need `./support.js` from the Claude Design runtime, which is not in the repo. Don't recreate that runtime.
- The 3D backdrops in the mockups are hand-drawn SVG stand-ins. They are NOT the target look for the game world; the three.js prototype defines that.
- `design/mockups/README.md` maps files to screens. `docs/01-concept.md` records the design decisions.

### Design tokens (use these, don't invent new ones)
- Palette: Sunflower #FFC61A, Signal #FF7A1A, Burnt #C24A00, Swiss red #E0322D, Charcoal #1C1F26, Ink #14171D, Steel #7D8593, Steel light #B9BFC9, Cream #F5EFE0, Rhine #2F6A96, Go green #7FE0A0; Navy #0F1C3A and Ice #7FD1FF only for title variant B.
- Fonts (Google Fonts): Bungee for the logo and big numerals, Barlow Condensed for all UI (600–800, italic for titles and buttons, uppercase labels with letter-spacing).
- Components (see StyleSheet.dc.html): beveled steel panels (light top-left border, dark bottom-right, hard 4–6 px drop shadow), buttons with normal / hover (Sunflower gradient) / pressed (inverted bevel, moves 4 px) / disabled (flat) states, tabs, sliders, tilted "sticker" badges.

### Decisions already made
- Graphic style "Original" targets the Midtown Madness 2 look (2000), not MM1: filtered textures, hard fog. UI stays Y2K chunky.
- HUD layout (HUD.dc.html, already implemented in prototype/index.html): speedometer + gear + damage bottom left, large rectangular map with labels bottom right, position + checkpoint pips top left, arrow + distance top center, timer + toasts top right.
- v0 has no traffic, pedestrians or cops. Race setup shows them as "v1" instead of dead sliders.
- Open decision: title screen A (Main.dc.html, Sunset Steel) vs B (TitleB.dc.html, Blue Chrome). Ask before building the title screen.

### When implementing screens in the prototype
- Build them as plain HTML/CSS overlays in prototype/index.html, matching the mockup markup (sizes scaled to the viewport, not fixed 1920×1080). They must work at phone width.
- Real `<button>` elements, visible focus states, keyboard navigation. Menus must be usable with the keyboard alone.
- No logos of real brands (Sissila, Volg) until docs/07-brands-and-permissions.md says permission is granted.
- If a screen needs a visual change the mockup doesn't cover, propose it first instead of improvising.
