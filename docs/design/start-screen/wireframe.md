# Start screen redesign — wireframe

Phase 1 of the UI workflow for #346 (start screen after title mockup A, "Sunset Steel").
**Approved 2026-10-17.** Next: phase 2, `flow.md` (Mermaid).

Layout: logo and edition plate, one mode text that follows focus, a steel bar with
START · BLITZ · SURPRISE HUNT · CHOOSE CAR, a secondary row with WORLD · STYLE ·
TUTORIAL · WHAT'S NEW, Credits in the footer. Region, worlds and file loading move
to their own Worlds screen.

Sources read: `design/mockups/{Main,StyleSheet,RaceSetup}.dc.html`, `TODO.md` "UI mockups", `prototype/index.html` lines 262–306 (`#overlay .panel`), `prototype/strings.js`, issues #346, #267, #268, #263. All labels below are existing `strings.js` keys unless marked *new*.

## A. Start screen, desktop 16:9

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────┐                        ┌────────────────────┐ │
│ │ CODENAME RHYFLITZER ·        │   (live 3D world,      │ ● DRIVER: <name>   │ │  tag plates: 75% ink,
│ │ PROTOTYPE V0.2        (sub)  │    sunset, slow flight │   (or ● CAR: Polo) │ │  2px steel border
│ └──────────────────────────────┘    over the Holzbrücke)└────────────────────┘ │
│                                                                                │
│                     ███  MAP MADNESS  ███   (Bungee, skew -9°, extrude)        │
│                  ──────┤ HOCHRHEIN EDITION ├──────   (plate = current world)   │
│                                                                                │
│                                                     ╔══════════════════╗       │
│                                                     ║ BRIDGE IS FOR    ║ ↶ -7° │  sticker: one line
│   ┌─────────────────────────────────────────┐       ║ PEDESTRIANS. WE  ║       │  per world, fixed
│   │ MODE TEXT (one, follows focus/hover):   │       ║ CHECKED. STILL   ║       │  copy, not a button
│   │ "Sisseln → Sisslerfeld → Stein → Bad    │       ║ JUMPING.         ║       │
│   │  Säckingen. Five checkpoints…"  #ovtext │       ╚══════════════════╝       │
│   └─────────────────────────────────────────┘                                  │
│   aria-live=polite; default = last played mode (START)                         │
│                                                                                │
│ ┌══════════════════════════ STEEL BAR (bevel top, shadow) ══════════════════┐ │
│ │ [1 ▶ START ]   [2 BLITZ ]   [3 SURPRISE HUNT ]   [4 CHOOSE CAR ]           │ │  1 = Sunflower (primary)
│ │                                                                            │ │  2–4 = steel; focus → Sunflower
│ │ [5 WORLD: HOCHRHEIN ▸]  [6 STYLE: ORIGINAL]  [7 TUTORIAL]  [8 WHAT'S NEW •]│ │  small buttons (Tab-off look)
│ └────────────────────────────────────────────────────────────────────────────┘ │
│  Roads, the Rhine, houses… Timer starts when you move. (#blurb)  · 9 CREDITS   │  #224 slot, text link-button
│  ┌ #game-nav (unchanged, below the blurb) ──────────────────────────────────┐  │
│  │ v0.2.0 · fullscreen · More Games · Source · Feedback · Star · EN/DE      │  │  10…
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Primary:** 1 START. **Secondary:** 2–4 (modes/car), 5–8 (settings/discovery), 9 Credits + nav in the footer.
- **Mode text:** single `<p>` above the bar, `aria-live="polite"`, swapped on `focus`/`mouseenter` of 1–3 (`#ovtext`, `blitzIntro`, `huntStart`-style hunt intro); reverts to the focused/last-chosen mode on blur. Buttons 4–8 leave it untouched.
- **Focus order:** 1 START → 2 BLITZ → 3 HUNT → 4 CAR → 5 WORLD → 6 STYLE → 7 TUTORIAL → 8 WHAT'S NEW → 9 CREDITS → `#game-nav` links. Tags top-left/right are not focusable. Autofocus on 1 (`Enter` = start, as today).
- **Loading state** (world still building): bar renders, 1–3 `disabled` (flat style), mode-text box shows `terrainSaving`-style line: "Building Hochrhein… ▓▓▓▓░░ 62 %"; 4, 6, 7, 8, 9 stay enabled; 5 enabled but Worlds screen's "Drive" is disabled. Edition plate shows the target world name already.
- **Error state** (terrain/world failed): the existing `#worldgone` `role="alert"` moves into the mode-text slot: red-bordered sticker "THIS WORLD HAS EXPIRED." / `worldOffline` / `worldInvalid` + row `[BUILD AGAIN] [DRIVE HERE anyway]`; 1–3 disabled until a world is chosen; 5 WORLD gets focus.
- **Empty state:** none on start (there is always a built-in world).

## B. Start screen, phone portrait (~390 px)

```
┌──────────────────────────┐
│ CODENAME · V0.2  ●DRIVER │  two tags on one line, 11px
│                          │
│      MAP MADNESS         │  logo ~56px, two lines allowed
│   ─┤ HOCHRHEIN ED. ├─    │
│                          │  live 3D backdrop, sticker
│        ╔══════════╗      │  shrunk to 2 lines or hidden
│        ║ STICKER  ║      │  <600px (decorative only)
│        ╚══════════╝      │
│ ┌──────────────────────┐ │
│ │ MODE TEXT, 3 lines   │ │  follows focus; aria-live
│ └──────────────────────┘ │
│ ┏━━━━━━━━━━━━━━━━━━━━━━┓ │  steel bar: 2×2 grid, 48px rows
│ ┃ [1 ▶ START ][2 BLITZ]┃ │
│ ┃ [3 SURPRISE][4 CAR  ]┃ │
│ ┃ [5 WORLD: HOCHRHEIN▸]┃ │  full width
│ ┃ [6 STYLE][7 TUT][8 •]┃ │  3 small, label "NEW" on 8
│ ┗━━━━━━━━━━━━━━━━━━━━━━┛ │
│ blurb (2 lines) · 9 CREDITS│
│ #game-nav (wraps, as now) │
└──────────────────────────┘
```

Bar is `position:sticky; bottom:0` above the nav; panel scrolls if the viewport is under ~640 px tall. Same focus order as A. Loading/error states identical, the alert replaces the mode-text box.

## C. Worlds screen (desktop)

Opened by 5; full-screen overlay, `role="dialog"`, Esc / ‹ BACK returns focus to 5. Vocabulary from RaceSetup: header with Bungee title, left list in a sunken well, right raised preview panel, steel footer bar.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ WORLDS (Bungee)   Choose where to drive                        [‹ BACK]  (1)   │
│────────────────────────────────────────────────────────────────────────────────│
│ ┌ REGIONS ───────────────────────┐  ┌ PREVIEW ────────────────────────────────┐│
│ │ (2) ▶ HOCHRHEIN      selected  │  │ [ live/frozen frame of the world  ]     ││
│ │ (3)   EHRENDINGEN              │  │ HOCHRHEIN   (800 italic, Sunflower)     ││
│ ├ WORLDS (#167) ─────────────────┤  │ Bad Säckingen · Stein · Sisseln …       ││
│ │ (4)   BADEN                    │  │ World: OpenStreetMap · 2 131 roads …    ││  worldOsm / worldHand
│ │ (5)   BRUGG · WINDISCH         │  │ Terrain: measured · 5×3 km at 2 m …     ││  mmhstatus line
│ │ (6)   LENZBURG                 │  │ Best: 01:48.2 · Rank A  (if any)        ││
│ │ (7)   DIETLIKON                │  │                                         ││
│ │ (8) + BUILD YOUR OWN WORLD…  ↗ │  │ ┌ FILES (sunken well) ────────────────┐ ││
│ │                                │  │ │ (10) LOAD TERRAIN (.MMH)            │ ││
│ │ list = radiogroup, ↑↓ moves,   │  │ │ (11) USE MADE-UP TERRAIN   (if own) │ ││
│ │ Enter/Space selects, preview   │  │ │ (12) LOAD WORLD FILE (.ZIP)         │ ││
│ │ follows selection              │  │ │ (13) DOWNLOAD WORLD · (14) REMOVE   │ ││
│ └────────────────────────────────┘  │ │ status: worldfilestatus (role=status)│ ││
│                                     │ └─────────────────────────────────────┘ ││
│                                     └─────────────────────────────────────────┘│
│ ┌══════════════ steel footer ══════════════════════════════════════════════════┐│
│ │ Hochrhein · OpenStreetMap + swisstopo                 [ (9) DRIVE HERE ▸ ]   ││  primary, Sunflower
│ └──────────────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Focus order:** 1 BACK → 2–8 list (one tab stop, arrow keys inside; 8 is a link to `../editor.html`) → 9 DRIVE HERE → 10–14 file controls (less common, so after the primary). `#worldsdesc` `role=status` lives under the preview title.
- **Phone:** header (title + BACK) → list as a full-width stack of 48 px rows → preview collapses to a 3-line card under the list (name, source line, terrain line) → FILES becomes a `<details>` "Files ▸" collapsed by default → footer DRIVE HERE sticky bottom, full width.
- **Loading:** selecting a row disables 9 and shows "Building Lenzburg… 62 %" in the footer text slot; list stays interactive (re-select cancels and restarts).
- **Empty:** "WORLDS" group shows a dashed well "No worlds built yet. Worlds you build keep 30 days after the last drive." + only row 8; FILES shows "No file loaded" status.
- **Error:** row gets a red "EXPIRED" / "OFFLINE" badge (RaceSetup "Locked" column style), preview replaces the frame with the `#worldgone` alert text and `[BUILD AGAIN] [LOAD WORLD FILE]`; 9 disabled; file errors (`worldFileBad`, `terrainCouldNotLoad`) print in the FILES status line in Swiss red, focus stays on the triggering button.

## Decisions (open questions, resolved 2026-10-17)

Approved with each recommendation as the decision.

- **Driver tag top-right:** the game has no driver name. Recommend showing the chosen car (`● CAR: <name>`) and making it a second entry to CHOOSE CAR only visually, not focusable.
- **Sticker copy per world:** mockup text is Hochrhein-specific. Recommend one sticker string per built-in region (`sticker.<region>`), hide the sticker for generated/file worlds.
- **Where WHAT'S NEW opens:** panel over the start screen vs. own screen. Recommend a small panel like `#worldgone` (list + "Go there") so the backdrop stays; own screen only if #263 grows.
- **TUTORIAL entry:** button in the secondary row vs. first-run auto-start. Recommend the button plus a one-time "NEW" dot; no auto-start.
- **Edition plate wording:** "HOCHRHEIN EDITION" for the two regions, but generated worlds have arbitrary names. Recommend `<WORLD NAME>` plain, and "EDITION" only for the two built-in regions.
- **Mode text on touch:** no hover/focus before tap. Recommend default to the last played mode, and a tap on a mode button first starts it (no two-step), text is informational only.
- **Camera flight with reduced motion:** recommend a static sunset frame when `prefers-reduced-motion`, and pause the flight while any dialog (Worlds, Car) is open.
- **Style button placement:** secondary row vs. footer. Recommend secondary row (it changes the backdrop immediately, which is a nice demo), footer stays blurb + Credits + nav.
