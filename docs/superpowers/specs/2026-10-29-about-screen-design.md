# About screen: dedication, people, credits, how it is built (#509, absorbs #267)

## Why

The game may be featured in the Neue Fricktaler Zeitung (via the Verein Plattform Sisslerfeld), which brings first-time, non-gamer visitors. Today the game says nothing about itself in-game: the 3D-model credits sit at the bottom of the command search (`#help`, `prototype/index.html:311-319`), the dedication and the people who helped appear nowhere, and the data sources show only as one line on the start screen. One **About** dialog gathers all of it.

## Decisions (maintainer, 2026-10-27 … 2026-10-29)

- Name: **„Über Map Madness“ / „About Map Madness“**, button label **„Über“ / „About“**.
- Opened from the **start screen** (secondary row), the **pause menu** and the **command search** (Ctrl+P).
- Order: **dedication first, then the people**, then the game, the credits, how it is built.
- Dedication: **„Dieses Spiel ist Juliska gewidmet“** / „This game is dedicated to Juliska“.
- People: **Tschosi "forwardare" Ätti aka L.A. Brace** (one person; the line break between „forwardare"“ and „Ätti“ as in the maintainer's template) — **Tester**, and from #267: Ehrendingen and the Wanderweg on the horizon. **Kiscsi** — the idea to race over the Holzbrücke by car (#267).
- Look: the game's own style (Bungee / Barlow Condensed, `--sun`, steel panels). The maintainer's black/yellow/pink template is inspiration only, not a requirement. The dedication block stands out (larger, centred, own panel).
- Game info as on the GamesHub card, plus „Inspired by Midtown Madness“ linking the Wikipedia article. The Wikipedia screenshot is **only linked through the article, never copied or embedded** (non-free, fair use).
- Verein Plattform Sisslerfeld **linked** to https://www.plattform-sisslerfeld.com/.
- The model credits and `creditPlattform` **leave `#help`**; the start screen's source line (`#blurb`, ODbL attribution) stays.
- #267 is closed as a duplicate of #509.

## The dialog

```
┌──────────────────────────────────────────────────────────────┐
│ ÜBER MAP MADNESS                                  ‹ Zurück   │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │          Dieses Spiel ist Juliska gewidmet               │ │
│ │                                                          │ │
│ │  Tschosi "forwardare"                                    │ │
│ │  Ätti aka L.A. Brace       Tester · Ehrendingen und der  │ │
│ │                            Wanderweg am Horizont         │ │
│ │  Kiscsi                    Idee: mit dem Auto über die   │ │
│ │                            Holzbrücke düsen              │ │
│ └──────────────────────────────────────────────────────────┘ │
│ DAS SPIEL                                                    │
│  Open-World-Arcade-Racer auf echten Geodaten …               │
│  Inspiriert von Midtown Madness ↗                            │
│ CREDITS                                                      │
│  3D-Modelle   (the 8 existing credit* lines)                 │
│  Daten        © OpenStreetMap-Mitwirkende (ODbL) ↗ ·         │
│               swissALTI3D, swissSURFACE3D, swissBOUNDARIES3D,│
│               swissBUILDINGS3D © swisstopo ↗                 │
│  Plattform    Masse … vom Verein Plattform Sisslerfeld ↗     │
│               (Bau Häring AG)                                │
│  Bibliotheken three.js ↗ · crashcat/mathcat ↗ ·              │
│               Leaflet ↗ · ALTCHA ↗ (Region-Editor)           │
│  Schriften    Bungee · Barlow Condensed (Google Fonts) ↗     │
│ SO ENTSTEHT DAS SPIEL                                        │
│  Text + ai-instructions ↗ · agent-workflow ↗                 │
│  Quellcode ↗ · Glossar ↗                          v0.2.0     │
└──────────────────────────────────────────────────────────────┘
```

- `#about`: a fixed full-screen dialog like `#worlds` (`role="dialog" aria-modal="true" aria-labelledby="abouttitle"`), scrolls vertically, never horizontally; the head row with the Bungee title and the **‹ Back** button (`#aboutback`, label `carselBack`).
- On phones (≤ 600 px) the padding shrinks like `#worlds`, the people's role column wraps under the name, and `#game-nav` hides while `#about` is open (same `:has()` rule as `#worlds`).
- The HUD hides while `#about` is open (same rule as `#worlds`).
- Every external link: `target="_blank" rel="noopener"`, `https://` only.
- The version is `window.GAME_VERSION`, shown as `v0.2.0`.

### Content and links

All text in `prototype/strings.js`, `en` and `de` (capitalised Du/Dir). Names are not translated.

| Item | en | de | Link |
|---|---|---|---|
| title | About Map Madness | Über Map Madness | |
| button | About | Über | |
| dedication | This game is dedicated to Juliska | Dieses Spiel ist Juliska gewidmet | |
| role of Tschosi … L.A. Brace | Tester · Ehrendingen and the Wanderweg on the horizon | Tester · Ehrendingen und der Wanderweg am Horizont | |
| role of Kiscsi | Idea: race over the Holzbrücke by car | Idee: mit dem Auto über die Holzbrücke düsen | |
| game text | Open-world arcade racer on real geodata: checkpoint race through Sisseln, Stein and Bad Säckingen on the Hochrhein — the pedestrian-only wooden bridge is fair game. Early prototype. | Open-World-Arcade-Racer auf echten Geodaten: Checkpoint-Rennen durch Sisseln, Stein und Bad Säckingen am Hochrhein, und die Holzbrücke für Fussgänger ist freigegeben. Früher Prototyp. | |
| inspired | Inspired by Midtown Madness | Inspiriert von Midtown Madness | https://en.wikipedia.org/wiki/Midtown_Madness |
| models | the 8 existing `credit*` strings (Eiffel, Atomium, Titanic, Hatchback, Mini, Bus, ModelT, Rally) | same | |
| OSM | © OpenStreetMap contributors, ODbL | © OpenStreetMap-Mitwirkende, ODbL | https://www.openstreetmap.org/copyright |
| swisstopo | Terrain swissALTI3D, building heights swissSURFACE3D, Swiss border swissBOUNDARIES3D, Holzbrücke reference swissBUILDINGS3D © swisstopo | Gelände swissALTI3D, Gebäudehöhen swissSURFACE3D, Landesgrenze swissBOUNDARIES3D, Massstab Holzbrücke swissBUILDINGS3D © swisstopo | https://www.swisstopo.admin.ch |
| Plattform | existing `creditPlattform`, with „Verein Plattform Sisslerfeld“ as the link | same | https://www.plattform-sisslerfeld.com/ |
| libraries | three.js (MIT) · crashcat and mathcat (MIT) · in the region editor: Leaflet (BSD-2-Clause) and ALTCHA (MIT) | three.js (MIT) · crashcat und mathcat (MIT) · im Region-Editor: Leaflet (BSD-2-Clause) und ALTCHA (MIT) | https://threejs.org · https://github.com/isaac-mason/crashcat · https://leafletjs.com · https://altcha.org |
| fonts | Bungee and Barlow Condensed (SIL Open Font License, Google Fonts) | Bungee und Barlow Condensed (SIL Open Font License, Google Fonts) | https://fonts.google.com |
| how it is built | Map Madness is built with AI coding agents (Claude Code): every change starts as a GitHub issue, gets a spec and a plan, is implemented test-first by an agent pipeline and reviewed before it ships. | Map Madness entsteht mit KI-Agenten (Claude Code): Jede Änderung beginnt als GitHub-Issue, bekommt eine Spec und einen Plan, wird von einer Agenten-Pipeline testgetrieben umgesetzt und vor dem Einspielen geprüft. | |
| rules | Agent rules: ai-instructions | Regeln für die Agenten: ai-instructions | https://github.com/freaxnx01/ai-instructions |
| workflow | Workflow: agent-workflow | Ablauf: agent-workflow | https://github.com/freaxnx01/agent-workflow |
| source | Source code | Quellcode | https://github.com/freaxnx01/game-rhyflitzer |
| glossary | Glossary | Glossar | https://github.com/freaxnx01/game-rhyflitzer/blob/main/docs/12-project-glossary.md |

LGL is **not** credited: the shipped terrain lists only `swissALTI3D (c) swisstopo` as its source (`data/terrain_hochrhein.mmh` header).

## Opening and closing

- Start screen: `#aboutbtn` (class `btn small`) after `#stylebtn2` in `.bar .row.secondary`. Opens `#about` with the start overlay hidden (like `openWorlds`); Back / Esc returns to the start screen with the focus on `#aboutbtn`.
- Pause menu: `#pauseabout` after `#pausevehicle`; `PAUSE_BUTTONS` becomes `['pauseresume', 'pausevehicle', 'pauseabout', 'pauserestart', 'pausemenu']`. Opens `#about` over the paused game (pause panel hidden); Back / Esc returns to the pause menu with the focus on `#pauseabout`. The race stays paused throughout.
- Command search: a new row `<kbd data-cmd="action:about">` with the text „About Map Madness: dedication, credits, how it is built“ / „Über Map Madness: Widmung, Credits, so entsteht das Spiel“. Enter closes the help and runs the action: in a run it opens the pause menu first and then About (return to the pause menu); otherwise About from the start screen.
- While `#about` is open it owns the keyboard (`aboutKeyAction`): Esc = back, Tab / Enter / Space pass (links and the Back button work natively), every game key is ignored. The game keys are released on open (`for (const k in keys) keys[k] = false`).

## Units

- **`prototype/about.js`** (new, pure, `node --test`): `ABOUT_LINKS` (frozen map id → https URL, the table above) and `aboutKeyAction(e)` → `'back' | 'pass' | 'ignore'`, and `aboutReturn(inRun)` → `'pause' | 'start'`.
- **`prototype/helpfilter.js`**: `parseCommand('action:<name>')` → `{ kind: 'action', name }`; new `commandAction(cmd)` → the name or `null`; `commandEventInit` returns `null` for actions (nothing to dispatch).
- **`prototype/pause.js`**: `PAUSE_BUTTONS` gains `'pauseabout'`.
- **`prototype/index.html`**: the `#about` markup and CSS; `#aboutbtn`, `#pauseabout`, the help row; `openAbout(from)`, `closeAbout()`, `aboutKey(e)` in the keydown chain right after `WORLDS.on`; `runHelpRow` runs actions; the eight `credit*` `<small>` lines move from `#help` into `#about`; `window.__mm.about()` → `{ open, from }`.
- **`prototype/strings.js`**: the new keys in `en` and `de`.

## Testing

- Node: `about.test.mjs` (links https and complete, key actions, return target), `helpfilter.test.mjs` (action kind), `pause.test.mjs` (new button order).
- Playwright `test_about.py` (one file): opens from the start screen and Esc returns with focus; dedication before the people in DOM order; the Tester line; every `#about a[href^="http"]` has `target=_blank` and `rel` containing `noopener` and an href from `ABOUT_LINKS`; the Verein link; German strings with `gg-lang=de`; the pause button opens and Back returns to the pause menu; Ctrl+P → type „about“ → Enter opens it; `#help` holds no `credit*` element any more, `#about` holds all eight.
- Updated: `test_start_screen.py` `SECONDARY` gains `aboutbtn`; `test_credits.py` keeps passing (the `data-i18n="credit…"` attributes still exist, now in `#about`).

## Out of scope

The tutorial (#534), a screenshot gallery (#508), the domain (#537), Umami events (#538).
