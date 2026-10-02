# German and English UI (i18n DE/EN) — design

Issue: #9 · Enriched headless (`/enrich 9 --headless`), 2026-10-02.

## Goal

Every user-facing UI text of the prototype (`prototype/index.html`) exists in
English and German. The player picks the language with the house `EN/DE` toggle
in `#game-nav`; the choice is shared with every other `game-*` repo via the
`gg-lang` localStorage key. Without a stored choice the browser language decides
(`de*` → German, anything else → English). Switching updates the visible UI at
once, without a reload.

The "Grüss mir die Fische!" / "Sleep with the fishes!" toast follows the game
language instead of `navigator.language`.

## Out of scope (stays as it is)

- Checkpoint, finish and place names (`CPS[].n`, `FINISH.n`, `PLACES[].n`) — the
  issue says so explicitly; they are proper names.
- Everything drawn into the 3D world: place labels, street names, house numbers,
  station boards, the Hallenbad and parking signs, the number plate.
- Minimap place labels (`BAD SÄCKINGEN`, `RHEIN`, `HOLZBRÜCKE`, …) — proper names.
- The game title "Map Madness" and codename "Rhyflitzer".
- The hub links in `#game-nav` ("More Games…", "Source", "Feedback", "Star") and
  the fullscreen button's title — shared hub markup, not this game's strings.
- Number formatting (`toFixed`, `fmt()`): unchanged. de-CH (the house fallback
  region) uses `.` as decimal separator, so the output is already correct there.
- The test hooks on `window.__mm` (e.g. `hud().compass` returns English `N/NE/E…`)
  — not user-facing.

## Architecture

Three pieces, following `.ai/stacks/browser-game.md` → "Localization (i18n)":

1. **`prototype/i18n.js`** — copied **verbatim** from the stack overlay (includes
   the delegated `document` click listener and the `btn.blur()` fix). Loaded as a
   classic script right after `version.js` (`index.html:979`). The page is plain
   HTML, not a dc-tool bundle (no `data-dc-script` / `text/x-dc` marker), and
   already has a static `#game-nav` (`index.html:980`), so `injectToggle()` adds
   the button itself — no static button markup needed.
2. **`prototype/strings.js`** — a new ES module that owns the game's strings:
   `export const STRINGS = { en: {...}, de: {...} }` and a pure
   `export function translate(lang, key, ...args)`. A value is either a string or
   a function of the args (for interpolated strings such as `Checkpoint 3/5`).
   Lookup order: `STRINGS[lang][key]` → `STRINGS.en[key]` → `key`. Pure and free of
   DOM/`window`, so it is unit-tested with `node --test` like `world.js`.
3. **Glue in the `index.html` module script:**
   - `const t = (key, ...args) => translate(window.GG_LANG, key, ...args);`
   - Static markup gets `data-i18n="key"` (sets `innerHTML`, since several strings
     carry `<b>`/`<br>` — the strings are our own constants, never remote input)
     and `data-i18n-aria="key"` (sets `aria-label`). `applyStaticStrings()` walks
     both and also sets `document.documentElement.lang`.
   - Every literal UI string in a JS render path becomes `t('key')`.
   - Dynamic, state-dependent texts get a small render function each
     (`renderStyleName()`, `renderOverlay()`, `renderStatus()`,
     `renderJumpList()`), called where they are set today **and** from one
     `addEventListener('gg-langchange', rerenderAll)`.
   - Per-frame HUD texts (`#best`, `#cpname`, `#odo`, `#mapzoom`) already re-render
     every frame or second through `hud()`, so they need only `t()`.

Load order works because the inline `<script type="module">` (`index.html:189`)
is deferred: it runs after the parser has executed the classic `version.js` and
`i18n.js` at the end of the body, so `window.GG_LANG` is set before any module
code reads it.

`FISH_TEXT` (`index.html:844`) is removed; the water toast becomes
`toast(t('fishes'))`, evaluated at the moment the car lands in the water.

## String inventory

Key → English (current text) → German.

### Start / result screen (`#overlay`, `index.html:157-185`, `:927`, `:931-934`)

| key | en | de |
|---|---|---|
| `sub` | Codename Rhyflitzer · Prototype v0.2 | Codename Rhyflitzer · Prototyp v0.2 |
| `intro` | Sisseln → Sisslerfeld → Stein → Bad Säckingen. Five checkpoints in any order, then the finish at the Münsterplatz. The Holzbrücke is for pedestrians. Nobody told the timer. | Sisseln → Sisslerfeld → Stein → Bad Säckingen. Fünf Checkpoints in beliebiger Reihenfolge, dann das Ziel auf dem Münsterplatz. Die Holzbrücke ist für Fussgänger. Das hat der Stoppuhr niemand gesagt. |
| `finishedText` | Münsterplatz reached. Retry for a better line, or take the other bridge next time. | Münsterplatz erreicht. Nochmals für eine bessere Linie – oder nächstes Mal die andere Brücke. |
| `start` | Start | Start |
| `retry` | Retry | Nochmals |
| `styleLabel` | Style: (before the style name) | Stil: |
| `styleOriginal` | Original | Original |
| `styleSmooth` | Smooth | Glatt |
| `loadTerrain` | Load terrain (.mmh) | Gelände laden (.mmh) |
| `useMadeUp` | Use made-up terrain | Erfundenes Gelände verwenden |
| `terrainMadeUp` | Terrain: made up (smooth hills, not measured) | Gelände: erfunden (sanfte Hügel, nicht gemessen) |
| `terrainMeasured` (fn) | Terrain: measured{ (your file)} · {w}×{h} at {step} m · {sources} | Gelände: gemessen{ (Deine Datei)} · {w}×{h} zu {step} m · {sources} |
| `terrainSaving` | Saving terrain, rebuilding the world… | Gelände wird gespeichert, die Welt neu aufgebaut… |
| `terrainCouldNotLoad` (fn) | Could not load: {msg} | Konnte nicht geladen werden: {msg} |
| `errNotMmh` | Not a Map Madness heightmap (MMH1) | Keine Map-Madness-Höhenkarte (MMH1) |
| `errNoStorage` | This browser blocks storage, so the terrain cannot be kept | Dieser Browser blockiert den Speicher, das Gelände kann nicht behalten werden |
| `blurbHand` | Layout traced from OpenStreetMap by hand. Timer starts when you move. | Strassennetz von Hand aus OpenStreetMap abgezeichnet. Die Zeit läuft, sobald Du fährst. |
| `blurbOsm` | Roads, the Rhine, houses and landmarks from OpenStreetMap, terrain from swisstopo. Timer starts when you move. | Strassen, Rhein, Häuser und Wahrzeichen aus OpenStreetMap, Gelände von swisstopo. Die Zeit läuft, sobald Du fährst. |
| `worldOsm` (fn) | World: OpenStreetMap · {n} roads · {m} buildings · {sources} | Welt: OpenStreetMap · {n} Strassen · {m} Gebäude · {sources} |
| `worldHand` | World: traced by hand (no data/world_hochrhein.json) | Welt: von Hand abgezeichnet (keine data/world_hochrhein.json) |
| `newRecord` | New record! | Neuer Rekord! |
| `finished` | Finished | Im Ziel |
| `notCountedJump` | with a jump, not counted · | mit Sprung, zählt nicht · |
| `notCountedFast` | with time-lapse, not counted · | mit Zeitraffer, zählt nicht · |
| `viaHolz` | via the Holzbrücke · | über die Holzbrücke · |
| `bestLower` | best | Bestzeit |

The short key list on the start screen (`index.html:163-173`) reuses the help keys
below plus `keyHornMute` (horn (also Enter) · mute / Hupe (auch Enter) · Ton aus),
`keyNitroJump` (nitro (hold) · jump to a place / Nitro (halten) · an einen Ort
springen) and `keyAllKeys` (all keys / alle Tasten).

### HUD (`index.html:81-147`, `:962`)

| key | en | de |
|---|---|---|
| `mode` | Time trial · Hochrhein | Zeitfahren · Hochrhein |
| `checkpointsLabel` | checkpoints (after `0 / 5`) | Checkpoints |
| `ready` | Ready | Bereit |
| `cpTarget` (fn) | Checkpoint {i} · {name} | Checkpoint {i} · {name} |
| `finishTarget` (fn) | Finish · {name} | Ziel · {name} |
| `time` | Time | Zeit |
| `best` (fn) | Best {time} / Best — | Bestzeit {time} / Bestzeit — |
| `damage` | Damage | Schaden |
| `gear` | Gear | Gang |
| `trip` | Trip | Trip |
| `odo` (fn) | Total {km} km · K resets trip | Total {km} km · K setzt Trip zurück |
| `map` | Map · Hochrhein · | Karte · Hochrhein · |
| `compassAria` | Compass | Kompass |
| `compassEast` | E | O |
| `speedoAria` | Speedometer | Tachometer |
| `steerLeft` / `steerRight` / `accelerate` / `brake` / `handbrake` (aria) | Steer left / Steer right / Accelerate / Brake / Handbrake | Links lenken / Rechts lenken / Gas geben / Bremsen / Handbremse |

### Toasts (`index.html:816`, `:848-851`, `:895`, `:911`, `:926`)

| key | en | de |
|---|---|---|
| `muted` / `soundOn` | Muted / Sound on | Ton aus / Ton an |
| `camera` (fn) | Camera: {view} | Kamera: {view} |
| `camChase` / `camNear` / `camCockpit` / `camBumper` | Chase / Chase near / Cockpit / Bumper | Verfolger / Verfolger nah / Cockpit / Stossstange |
| `cpToast` (fn) | Checkpoint {n}/5<br>{name} | Checkpoint {n}/5<br>{name} |
| `holzToast` | Holzbrücke!<br>Pedestrians only. Allegedly. | Holzbrücke!<br>Nur für Fussgänger. Angeblich. |
| `fishes` | Sleep with the fishes! | Grüss mir die Fische! |
| `randomSpot` | Random spot | Zufälliger Ort |
| `fromMap` | From the map | Von der Karte |

The place-name toast after a J jump (`toast(p.n)`) stays a proper name.

### F1 help (`#help`, `index.html:102-119`)

| key | en | de |
|---|---|---|
| `helpTitle` | Keys · F1 closes | Tasten · F1 schliesst |
| `keyAccel` | accelerate (W or ↑ also work) | Gas geben (W oder ↑ gehen auch) |
| `keySteer` | or ← →: steer · **S** / ↓ brake, reverse | oder ← →: lenken · **S** / ↓ bremsen, rückwärts |
| `keyHandbrake` | handbrake (drift) | Handbremse (Drift) |
| `keyNitro` | Nitro (hold) | Nitro (halten) |
| `keyTab` | game speed ×3 (hold; the run is not recorded) | Spieltempo ×3 (halten; die Fahrt zählt nicht) |
| `keySignals` | Turn signals left · right | Blinker links · rechts |
| `keyHorn` | horn | Hupe |
| `keyCamera` | camera: chase · near · cockpit · bumper | Kamera: Verfolger · nah · Cockpit · Stossstange |
| `keyCar` | show / hide the car | Auto zeigen / verstecken |
| `keyJump` | jump to a place | an einen Ort springen |
| `keyZoom` | zoom the map 1× · 2× · 4× · 8× (or the mouse wheel over it) · double-click or double-tap the map: put the car on the road there | Karte zoomen 1× · 2× · 4× · 8× (oder Mausrad darüber) · Doppelklick oder Doppeltipp auf die Karte: Auto dort auf die Strasse setzen |
| `keyTrip` | reset the trip odometer | Tageskilometer zurücksetzen |
| `keyReset` | back on the road | zurück auf die Strasse |
| `keyStyle` | toggle graphic style | Grafikstil wechseln |
| `keyMute` | mute | Ton aus |
| `keyHelp` | this help | diese Hilfe |

The `<kbd>` key captions (Space, Ctrl, Tab, Enter, …) stay as they are — they name
physical keys.

### J menu (`#jump`, `index.html:120`, `:929`)

| key | en | de |
|---|---|---|
| `jumpTitle` | Jump to | Springen nach |
| `jumpHint` | 1–9, 0 or click · J / Esc closes | 1–9, 0 oder Klick · J / Esc schliesst |
| `randomSpot` | Random spot | Zufälliger Ort |

### Minimap

The bar title (`map`, above) and the zoom readout `1×` (language-neutral). Map
labels are proper names and stay. The `N ↑` marker stays (N is north in both).

## Assumptions

- **A1** [high] `i18n.js` is copied verbatim and the toggle is injected by
  `injectToggle()`. Rejected: static `EN/DE` button markup. That variant is only for
  framework-managed `#game-nav` (dc-tool); this page has no `data-dc-script` marker
  and a plain static `#game-nav` (`prototype/index.html:980-990`).
- **A2** [high] The `btn.blur()` fix matters here: Enter honks the horn
  (`index.html:816`) and is not `preventDefault()`ed, so without blur a focused
  toggle would flip the language on every honk. The verbatim copy carries it; a test
  pins it.
- **A3** [high] Strings live in a separate `prototype/strings.js` ES module with a
  pure `translate()`. Rejected: inlining `STRINGS` into the 800-line module script.
  The repo already splits pure logic into `world.js` and unit-tests it with
  `node --test` (`prototype/tests/world.test.mjs:1-3`).
- **A4** [high] Static markup uses `data-i18n` / `data-i18n-aria` attributes and
  one walker. Rejected: building the overlay/help from JS. Keeps the HTML readable
  and the diff small.
- **A5** [high] Checkpoint, place, street and world-label names stay untranslated
  (issue body: "checkpoint names stay as they are").
- **A6** [med] German wording uses Swiss spelling (`ss`, no `ß`) and capitalised
  `Du`/`Deine` (repo owner's German-writing rule). "Checkpoint" and "Trip" are kept
  in German as racing/dashboard loanwords; "Cockpit" too.
- **A7** [med] The compass rose's `E` becomes `O` (Ost) in German. Rejected: leaving
  `E`, which a German player reads as nothing. `N`, `S`, `W` are the same in both.
  The `window.__mm.hud().compass` test hook keeps English points (not user-facing).
- **A8** [med] The two style names are translated (`Smooth` → `Glatt`,
  `Original` stays). The internal style keys (`original`, `smooth`) are unchanged.
- **A9** [med] A language switch re-renders all *standing* text (overlay, help, J
  menu, HUD labels, status lines); a toast already on screen keeps its language for
  its remaining ≤2.6 s. Rejected: re-rendering toasts (needs remembering the toast's
  key and args for a 2.6 s message).
- **A10** [high] Without a stored `gg-lang`, `i18n.js` falls back to
  `navigator.language`, so the existing parametrised fishes test
  (`prototype/tests/test_smoke.py:114`) stays green unchanged; Playwright's default
  locale is `en-US`, so every existing English text assertion stays green.
- **A11** [high] Error messages from `parseMMH` and the storage check are shown to
  the player in `#mmhstatus`, so they are translated (`errNotMmh`, `errNoStorage`).

## Consequences

- The `gg-lang` key is shared across all `game-*` repos on
  `github.freaxnx01.ch`: picking German here also turns other games German, and the
  other way round.
- The `#game-nav` bar gains one more item (`· EN`/`· DE`); on narrow phones it
  wraps one item earlier. The nav is already hidden on phones while the start
  dialog is open (`index.html:977`).
- After a language switch, `#mmhstatus` shows the default status line again; a
  transient "Could not load: …" error message is not kept across the switch.
- German strings are longer than English ones (help overlay, status lines). The
  help panel already scrolls (`max-height:90vh;overflow:auto`), the overlay panel
  wraps.
- `<html lang>` now follows the game language (was implicit/none in the prototype).

## Testing

Test-first. New `prototype/tests/strings.test.mjs` (node) for `translate()` and
key parity; new `prototype/tests/test_i18n.py` (Playwright, hand-traced layout with
world + terrain blocked, like `test_minimap.py`) for the toggle, persistence,
browser fallback, live re-render, the blur fix and the fishes toast. The full
existing suite (`node --test prototype/tests/`, `pytest prototype/tests`) must stay
green.

## Acceptance criteria

- [ ] `prototype/i18n.js` is a verbatim copy of the stack overlay's `i18n.js`,
      loaded right after `version.js`; an `EN`/`DE` toggle appears in `#game-nav`.
- [ ] With no stored language, a `de-*` browser shows German, any other browser
      English.
- [ ] Clicking the toggle switches every text listed in the string inventory
      without a reload, and stores the choice in `localStorage['gg-lang']`; a reload
      keeps it.
- [ ] A stored `gg-lang` wins over the browser language.
- [ ] After clicking the toggle, pressing Enter (horn) does not flip the language.
- [ ] The water toast shows "Grüss mir die Fische!" when the game language is
      German and "Sleep with the fishes!" when it is English, independent of the
      browser language.
- [ ] Checkpoint, place and street names are unchanged in both languages.
- [ ] `STRINGS.en` and `STRINGS.de` have exactly the same keys (unit test).
- [ ] The page loads with an empty console in both languages; the full existing
      test suite passes.
- [ ] `CHANGELOG.md` `[Unreleased]` has a player-facing entry.
