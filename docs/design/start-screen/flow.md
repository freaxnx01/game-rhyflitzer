# Start screen redesign: flow

Phase 2 of the UI workflow for #346. **Approved 2026-10-17.** Wireframe: [wireframe.md](wireframe.md).

Facts from the current code (`index.html` on main, 2026-10-17):

- **Entry points to the overlay:**
  - page load (`?region=` / `?world=`);
  - race end: `finish()`, `timeUp()` and `showHuntResult()` show the overlay with `#result`;
  - Pause → main menu: `toMainMenu()`;
  - the car picker's back button: `closeCarSel()`.
- **Region, world and file changes reload the page** (`location.search = …`, `location.reload()`). A world is only built during startup.
- **Credits** (#267), **Tutorial** (#268) and **What's new** (#263) are separate open issues.

## 1a. User journey: start screen

```mermaid
flowchart TD
  L[Page load ?region / ?world] --> B{World ready?}
  RE[Race ends: finish / time up / hunt over] --> S
  PM[Pause → Main menu] --> S
  B -- building --> LD[Loading: 1–3 disabled, progress in mode text]
  LD --> B
  B -- expired / offline / invalid --> ER[Alert in mode-text slot, focus on WORLD]
  ER -- BUILD AGAIN --> ED[editor.html]
  ER -- DRIVE HERE anyway --> L
  B -- ok --> S[Start screen, focus on START, mode text = last mode]
  S -- 1 / 2 / 3 --> RACE[startRace trial / blitz / hunt → overlay hidden]
  S -- 4 CHOOSE CAR --> CS[Car picker] -- Back --> S
  CS -- Race! --> RACE
  S -- 5 WORLD --> W[Worlds screen, see 1b]
  S -- 6 STYLE --> S
  S -- 7 / 8 / 9 --> X[Tutorial / What's new / Credits: separate issues]
```

## 1b. User journey: Worlds screen

```mermaid
flowchart TD
  O[Open from 5] --> G{Gallery loaded?}
  G -- no saved worlds --> EM[Empty well: 'No worlds built yet' + Build your own]
  G -- ok --> LI[List: regions + worlds, current one selected]
  G -- offline --> LI2[Regions only + note]
  LI -- ↑↓ select --> PV[Preview follows selection]
  PV -- expired --> EX[Badge EXPIRED, DRIVE HERE disabled, BUILD AGAIN]
  PV -- DRIVE HERE --> RL[Reload with ?region= / ?world=]
  LI -- Build your own --> ED[editor.html]
  PV -- Load .mmh / .zip --> F{File valid?}
  F -- yes --> RL2[Save to IndexedDB → reload]
  F -- no --> FE[Error in the FILES status line, focus stays]
  PV -- Remove saved copy --> CF{Confirm?} -- yes --> RL2
  CF -- no --> PV
  O -- Esc / BACK --> S[Start screen, focus on 5]
```

## 2. Components and state

```mermaid
graph TD
  OV["#overlay (start screen)"] --> TAGS[Tags: codename + ● CAR]
  OV --> LOGO[Logo + edition plate + sticker]
  OV --> MT["Mode text #ovtext · aria-live"]
  OV --> RES["#result (after a race)"]
  OV --> BAR[Steel bar: 1–4 + secondary row 5–8]
  OV --> FOOT[Blurb · Credits · #game-nav]
  BAR -- 5 --> WD["#worlds dialog (new)"]
  BAR -- 4 --> CS["#carsel (unchanged)"]
  WD --> WL[List: radiogroup] & WP[Preview + FILES]
  R[(R: mode, state, last, best · index.html)] -. read .-> MT & RES
  URL[(URL ?region / ?world)] -. read .-> LOGO & WL
  LS[(localStorage: mm.car, mm.lastMode new, mm.newsSeen new)] -. read .-> TAGS & MT
  GAL[gallery.js loadGallery] -. worlds .-> WL
  IDB[(IndexedDB idbGet / idbSet)] -. saved copy .-> WP
  WL -- select event --> WP
```

Data flows from the state stores into the views. Clicks call handlers: `startRace(mode)`, `openCarSel()`, `toggleStyle()`, and `location.search` for world changes. Text comes from `strings.js` via `tr()`; a `gg-langchange` event re-renders it through `rerenderAll()`.

## Decisions (screen inventory)

1. **Result view after a race:** `#result` takes the mode-text slot, the same place as the error alert, and START reads "AGAIN".
2. **Buttons 7 / 8 / 9:** each stays hidden until its issue lands (#268, #263, #267). #346 builds only the slots.
3. **World loading:** DRIVE HERE reloads the page with `?world=`, and the progress shows on the start screen. Building a world without a reload is out of scope.
4. **Remove saved copy:** an inline "Really remove? Yes / No" confirmation instead of a dialog.
5. **New localStorage keys:** `mm.lastMode` (the mode text shows the last played mode) and `mm.newsSeen` (the NEW dot, once #263 lands).
