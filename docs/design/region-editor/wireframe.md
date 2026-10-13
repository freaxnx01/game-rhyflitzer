# Region editor — wireframe

Page `editor/index.html`, dark, the game's tokens (`--charcoal --ink --sun --cream --steel-l --red --go`), Bungee title,
Barlow Condensed text. Map: swisstopo WMTS via vendored Leaflet, `© swisstopo` bottom-right.

## Desktop (≥ 900 px) — state `edit`

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ REGION EDITOR  Drag a frame anywhere in Switzerland — drive there in two minutes.        │
├───────────────────────────────────────────────────────────┬──────────────────────────────┤
│                                                           │ FRAME                        │
│        swisstopo map (Leaflet, pan + zoom)                │ 2.5 × 3.0 km                 │
│                                                           │ Ehrendingen                  │
│            ■───────────────■                              │                              │
│            │               │  ← LV95 rectangle (yellow)   │ ⚠ Few roads here: free       │
│            │   drag body   │     corner handles 44×44 px  │   driving only, no race.     │
│            │               │                              │                              │
│            ■───────────────■                              │ Drag the frame, pull a corner│
│                                                           │ to resize. Arrow keys move,  │
│                                                           │ Shift + arrows resize.       │
│                                                 [+] [–]   │                              │
│                                 100 m ──  © swisstopo     │ ┌──────────────────────────┐ │
│                                                           │ │        BUILD             │ │  ← .btn.primary, 64 px
│                                                           │ └──────────────────────────┘ │
│                                                           │ OpenStreetMap (ODbL),        │
│                                                           │ swisstopo                    │
├───────────────────────────────────────────────────────────┴──────────────────────────────┤
│                         v0.2.0 · More Games… · Source · Feedback · ★ · EN                 │  ← #game-nav
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Outside Switzerland: rectangle red, panel line „The frame must lie entirely inside Switzerland", BUILD disabled.

## Panel — states `queued` / `building`, `done`, `failed`

```
┌ queued / building ──────────┐  ┌ done ───────────────────────┐  ┌ failed ─────────────────────┐
│ BUILDING                    │  │ READY                       │  │ SORRY                       │
│ Ehrendingen                 │  │ Ehrendingen                 │  │ Too many buildings or roads │
│                             │  │ ┌─────────────────────────┐ │  │ in this frame. Try a smaller│
│ ● Queued (#3)               │  │ │        DRIVE!           │ │  │ one.                        │
│ ○ Cutting                   │  │ └─────────────────────────┘ │  │                             │
│ ○ Terrain                   │  │ Share  [https://…?world=…]  │  │ ┌─────────────────────────┐ │
│ ○ World                     │  │        [ Copy ]             │  │ │    CHANGE THE FRAME     │ │
│ ○ Race                      │  │ [ Download world ]          │  │ └─────────────────────────┘ │
│ ○ Done                      │  │ ⚠ Free driving only.        │  │                             │
│ about 1–2 minutes           │  │ [ New frame ]               │  │                             │
└─────────────────────────────┘  └─────────────────────────────┘  └─────────────────────────────┘
```

Active step lit (`--sun`), finished steps `--go`, waiting steps `--steel-l`. Share: read-only input + Copy (44 px).

## Phone (360 px)

```
┌──────────────────────┐
│ REGION EDITOR        │
├──────────────────────┤
│                      │
│   map, 52 vh         │
│   ■──────■           │
│   │      │           │
│   ■──────■           │
│          © swisstopo │
├──────────────────────┤
│ 2.0 × 2.0 km         │
│ Ehrendingen          │
│ Drag the frame…      │
│ ┌──────────────────┐ │
│ │      BUILD       │ │  ← 64 px
│ └──────────────────┘ │
│ ODbL · swisstopo     │
│  v0.2.0 · More… · DE │  ← #game-nav, static at the bottom
└──────────────────────┘
```

Single column, page scrolls, no horizontal scroll; every button and handle ≥ 44 px; `touch-action:none` on the frame.

## Dropped (v1 scope)

Map search, "use my location", rotated frames, job cancel, gallery row (phase 5), hub card.
