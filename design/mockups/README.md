# UI mockups

Source files of the Claude Design canvas "Map Madness UI Mockups" (2026-09-28). The canvas itself is a private Claude artifact; these files are the snapshot kept in git.

| File | Artboard |
|---|---|
| `Main.dc.html` | 01a Title screen, Sunset Steel (charcoal + yellow, horizontal menu) |
| `TitleB.dc.html` | 01b Title screen, Blue Chrome (navy + orange, vertical menu) |
| `RaceSetup.dc.html` | 02 Race setup (region, mode, race list, opponents, time of day, weather) |
| `CarSelect.dc.html` | 03 Car selection (turntable, stats, paint, garage) |
| `HUD.dc.html` | 04 In-race HUD (speedometer bottom left, rectangular map bottom right) |
| `Results.dc.html` | 05 Results |
| `StyleSheet.dc.html` | 06 Style sheet (palette, type, button states, HUD elements) |
| `canvas.json` | Canvas index: artboard positions and sizes, notes |

Each artboard is 1920 × 1080. Fonts: Bungee (display), Barlow Condensed (UI).

## Viewing

The `.dc.html` files are Claude Design components: HTML markup inside `<x-dc>` plus a small logic script. They reference `./support.js` from the Design runtime, which is not in this repo, so opening them directly in a browser shows the raw markup without layout logic. To edit them visually, open the canvas in Claude, or re-import these files into a new Design canvas.

The 3D backdrops are hand-drawn SVG stand-ins, not engine renders. The real look is defined by `prototype/index.html`.
