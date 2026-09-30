# TODO

## Next session prompt

Continue Map Madness (codename Rhyflitzer). Read README.md and docs/ first.
1. Run pipeline/terrain.py for the default region (Swiss side is automatic), load the .mmh in prototype/index.html, and check the Hauptstrasse climb and curve in Sisseln toward Laufenburg against the real terrain.
2. Next pipeline step: roads, river and buildings from OSM (Geofabrik extract + osmium, not the public Overpass API) to replace the hand-traced layout. See docs/04 and docs/08.

Status 2026-09-29:
- Item 1 done. The .mmh builds (10.7 MB, Swiss side only) and loads in the prototype. The Sisseln village section matches OSM within 1–7 m. The climb is wrong: the real road climbs ~13 m diagonally north-east at ~7 % from the Sissle bridge (x≈1440) to x≈1720, while the prototype hits the terrace edge head-on (~40 % wall at x 1600–1620). The curve toward Laufenburg is really at x≈2950, not x≈2300. The Smile-Kreisel is ~65 m too far west (OSM: x≈1270). The DEM shows the creek bed under the Sissle bridge (5 m dip), so bridges need their own deck profile.
- Item 2 not started. Brainstorming began: first open question is how the prototype loads the OSM world (file picker like .mmh / fetched data/world.json / committed JS module). Use `osmium extract -s simple` (smart runs out of memory on 12 GB).

## After pipeline step 2

- **Physics spike (throwaway):** try the "ball car" from mrdoob's Starter-Kit-Racing (crashcat, MIT) on the measured terrain around the Sisseln climb, and compare the feel with the prototype's own `stepCar`. The car is one rolling sphere in crashcat; the model's heading is steered directly and decoupled from the sphere's momentum, which is what makes it drift (`js/Vehicle.js`, `js/Physics.js`). crashcat is pre-1.0 (the kit pins 0.0.3). Then decide: crashcat vs. Rapier (docs/03) vs. own physics.

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
