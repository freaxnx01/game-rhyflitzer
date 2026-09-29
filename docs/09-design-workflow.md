# Design workflow cheat sheet

How UI design moves between Claude Design (in the Claude app) and code (Claude Code CLI). Git is the meeting point.

## Where things live

| What | Where | Source of truth? |
|---|---|---|
| Design canvas "Map Madness UI Mockups" | Claude app (private artifact) | No, it's the editor |
| Mockup sources (`*.dc.html`, `canvas.json`) | `design/mockups/` in git | **Yes** |
| Implemented screens | `prototype/index.html` in git | Yes, for code |

Claude Code in the terminal can't open or edit a Design canvas. Design happens in the Claude app; code happens in the CLI.

## The round trip

### 1. CLI: push first

Commit and push the current state, so the design session sees what's already built.

### 2. Claude app: design

Start a session with the repo attached (push access), then ask for the new screen:

> Repo game-rhyflitzer. Open the "Map Madness UI Mockups" canvas and add an artboard for the pause menu. Match design/mockups/StyleSheet.dc.html. When done, commit the new .dc.html to design/mockups/ and update the README there.

Claude reads the existing mockups from the repo, adds the artboard to the same canvas, and commits the source file back.

### 3. CLI: pull and build

```bash
git pull
```

> Implement the pause menu from design/mockups/Pause.dc.html in prototype/index.html. Follow the UI mockups section in CLAUDE.md.

## Rules

- **One canvas.** Add artboards to "Map Madness UI Mockups"; don't start new canvases. Palette and components stay consistent.
- **Git wins.** Hand edits in the Design editor (drag, recolor, retype) don't reach git by themselves. End every design session with: *"Read the canvas and commit the changed artboards."*
- **Design first, then code.** Don't change the look in the CLI and in Design at the same time. If the CLI finds a mockup doesn't work (too cramped on a phone, unreadable), write it down and fix it in Design.
- **Issues as handover.** One GitHub issue per screen, split in two: `Design: pause menu` and `Implement: pause menu`. Both sessions link to them.
- **No real logos** in mockups or code until [07-brands-and-permissions.md](07-brands-and-permissions.md) says permission is granted.

## Reading mockups in the CLI

- Each `*.dc.html` is one 1920 × 1080 artboard: plain HTML with inline styles inside `<x-dc>`, plus a small logic script. Read the markup for exact colors, sizes, spacing and fonts.
- Don't render or run them. They need `./support.js` from the Claude Design runtime, which isn't in the repo. Don't recreate it.
- The 3D backdrops are hand-drawn SVG stand-ins, not the target look for the game world. The three.js prototype defines that.
- File-to-screen mapping: [design/mockups/README.md](../design/mockups/README.md).

## Design tokens

Use these; don't invent new ones.

| Token | Hex | Use |
|---|---|---|
| Sunflower | `#FFC61A` | Primary accent, logo, active states |
| Signal | `#FF7A1A` | Secondary accent, extrude, needles |
| Burnt | `#C24A00` | Logo extrude, shadows on accent |
| Swiss red | `#E0322D` | Finish, danger, badges |
| Charcoal | `#1C1F26` | Background |
| Ink | `#14171D` | Wells, hard shadows |
| Steel | `#7D8593` | Button gradient, borders |
| Steel light | `#B9BFC9` | Labels, bevel highlights |
| Cream | `#F5EFE0` | Text |
| Rhine | `#2F6A96` | Water on maps |
| Go green | `#7FE0A0` | Done, unlocked |
| Navy / Ice | `#0F1C3A` / `#7FD1FF` | Title variant B only |

**Fonts** (Google Fonts): **Bungee** for the logo and big numerals; **Barlow Condensed** for all UI (600–800, italic for titles and buttons, uppercase labels with letter-spacing).

**Components** ([StyleSheet.dc.html](../design/mockups/StyleSheet.dc.html)):
- Raised panel: steel gradient, light top-left border, dark bottom-right, hard 4–6 px shadow
- Sunken well: dark fill, inverted bevel
- Buttons: normal (steel), hover/focus (Sunflower gradient), pressed (inverted bevel, moves 4 px, shadow collapses), disabled (flat, no shadow)
- Tabs, sliders, tilted "sticker" badges

## Decisions already made

- "Original" graphic style targets the **Midtown Madness 2** look (2000): filtered textures, hard fog. UI stays Y2K chunky.
- **HUD layout** (implemented): speedometer + gear + damage bottom left; large rectangular map bottom right; position + checkpoint pips top left; arrow + distance top center; timer + toasts top right.
- **v0 scope**: no traffic, pedestrians or cops. Race setup shows them as "v1" instead of dead sliders.

## Open decisions

- Title screen: **A** Sunset Steel (`Main.dc.html`) or **B** Blue Chrome (`TitleB.dc.html`). Ask before building it.

## Implementing a screen (CLI checklist)

- [ ] Plain HTML/CSS overlay in `prototype/index.html`, matching the mockup markup
- [ ] Scaled to the viewport, not fixed 1920 × 1080; works at phone width
- [ ] Real `<button>` elements, visible focus, full keyboard navigation
- [ ] Tokens and fonts from above, nothing new
- [ ] Anything the mockup doesn't cover: propose first, don't improvise
