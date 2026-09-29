# TODO

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
