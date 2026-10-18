# Start screen redesign, "Sunset Steel" (#346)

Issue: #346 `feat(ui): start screen redesign after title mockup A (Sunset Steel)`. Size: medium-large, one
screen rebuilt plus one new dialog, all in `prototype/index.html` + `prototype/strings.js` + one small pure module.

**Source of truth for the design:** the approved UI-workflow artefacts on `main`:

- `docs/design/start-screen/wireframe.md` (phase 1, approved 2026-10-17): layout A/B/C, states, and the eight
  resolved open questions.
- `docs/design/start-screen/flow.md` (phase 2, approved 2026-10-17): journeys 1a/1b, the component/state map,
  and the five screen-inventory decisions.

This spec does not re-open any of those decisions. It adds the technical design: exact DOM, CSS, handlers, state,
strings, the test contract, and the list of existing tests whose assertions encode the old layout.

## Problem

The start panel (`prototype/index.html:262-306`, `#overlay > .panel`) is a 640 px steel card with a title, one
intro paragraph, a static Blitz paragraph, five buttons, the region row, the worlds row (#170), the terrain/world
file row and a blurb. It neither looks like the chosen title mockup (`design/mockups/Main.dc.html`) nor has room
for the entries that are coming (Credits #267, Tutorial #268, What's new #263). Keyboard navigation on it is also
broken today: the global keydown handler calls `e.preventDefault()` on every `Tab` (`index.html:2143`, comment
"#129"), including while the overlay is up, so `Tab` never moves focus between the start buttons.

## Design

### 1. Start screen (`#overlay`)

`#overlay` becomes a full-bleed screen (no 640 px card). The live three.js scene stays behind it; the sunset of
the mockup is a CSS backdrop on `#overlay` (see 6). The HUD plates and touch buttons are hidden while the overlay
is up, as `#carsel` already does (`index.html:161`).

New markup, replacing `index.html:262-306`. Every existing id and handler is kept; ids marked *new* are new.

```html
<div id="overlay">
  <div class="start">
    <div class="tags">
      <div class="sub" data-i18n="sub">Codename Rhyflitzer · Prototype v0.2</div>
      <div id="cartag" class="tag" aria-hidden="true"><i></i><span id="cartagname"></span></div>   <!-- new -->
    </div>
    <div class="logo">
      <h1>Map Madness</h1>
      <div class="edition"><i></i><span id="edition"></span><i></i></div>                         <!-- new -->
    </div>
    <div class="mid">
      <div class="slot">
        <div id="worldgone" hidden role="alert"> …unchanged children: #worldgonetitle, #worldgonetext, .row > #buildagain + #drivehere… </div>
        <div id="result" hidden></div>
        <p id="ovtext" aria-live="polite">Building the world…</p>
      </div>
      <div id="sticker" hidden aria-hidden="true"></div>                                             <!-- new -->
    </div>
    <div class="bar">
      <div class="row">
        <button id="startbtn" class="btn primary" type="button" disabled>Start</button>
        <button id="blitzbtn" class="btn" type="button" disabled>Blitz</button>
        <button id="huntbtn" class="btn" type="button" disabled data-i18n="hunt">Surprise hunt</button>
        <button id="carbtn" class="btn" type="button" data-i18n="chooseCar">Choose car</button>
      </div>
      <div class="row secondary">
        <button id="worldbtn" class="btn small" type="button"></button>                              <!-- new -->
        <button id="stylebtn2" class="btn small" type="button">Style: Original</button>
      </div>
    </div>
    <div class="foot">
      <p id="blurb">Layout traced from OpenStreetMap by hand. Timer starts when you move.</p>
      <p class="status"><span id="mmhstatus">Terrain: made up (smooth hills, not measured)</span></p>
    </div>
  </div>
</div>
```

- **Tags.** `.sub` keeps its class and `data-i18n` (test_i18n reads `document.querySelector('.sub')`). `#cartag`
  shows `● CAR: <name>` from `vehicleText(tr, CHOICE.id, 'name')` (the same call that fills `#csname`), updated
  from `renderCarSel()`'s render path and on `gg-langchange`. Not focusable, `aria-hidden` (decision "Driver tag").
- **Logo + edition plate.** `h1` keeps "Map Madness" (Bungee, skew -9°, extruded shadow stack from the mockup).
  `#edition` = `tr('edition', REGION.name)` for the two built-in regions ("Hochrhein Edition" / "Hochrhein-Edition"),
  plain `REGION.name` for a generated world (decision "Edition plate wording"). Rendered with `textContent`.
- **Sticker.** One string per built-in region, `stickerHochrhein` / `stickerEhrendingen`; `hidden` for generated and
  file worlds (decision "Sticker copy"). Decorative: `aria-hidden`, not focusable, hidden under 600 px.
- **Mode-text slot.** Holds, in this order, `#worldgone` (error state), `#result` (result view) and `#ovtext`.
  `#ovtext` gets `aria-live="polite"`. `#blitzhint` is removed: the Blitz intro is now the mode text while BLITZ
  has focus or hover.
- **Steel bar.** Primary row 1–4 and secondary row 5–6. `#worldbtn` reads `tr('worldBtn', REGION.name)`
  ("World: Hochrhein ▸") and opens the Worlds dialog. `#stylebtn2` keeps its id and its text format
  (`renderStyleName()` unchanged). 7 TUTORIAL, 8 WHAT'S NEW and the footer's 9 CREDITS are not built here — each
  follow-up issue adds its own button (see A5).
- **Footer.** `#blurb` (unchanged source: `renderStatus()`) and the status line. `#mmhstatus`
  stays in the start screen footer, with `#worldstatus` still created by `$('mmhstatus').after(s)`
  (`index.html:2692`). Reason: eight Playwright files wait with `page.wait_for_selector("#mmhstatus.real")`,
  which requires the element to be *visible*; the Worlds preview shows the same two lines through its own
  elements (see 2). Rendered small (13 px, `--steel-l`) so the footer reads as the wireframe's blurb line.
- **Loading state.** The three mode buttons carry `disabled` in the static HTML and `#ovtext` says
  "Building the world…" until the module script reaches the handler wiring, where `disabled` is removed
  (`renderOverlay()`), then `rerenderAll()` replaces the text. Today the buttons look live but have no handlers
  during the build. A percentage is not shown: the world is built synchronously on the main thread
  (`index.html` top level), so no DOM update can run between its steps; the wireframe's "62 %" bar would need a
  chunked build, which is out of scope.
- **Error state.** `#worldgone` and its handlers are unchanged; it now sits in the slot. When it is shown, 1–3 get
  `disabled` and focus goes to `#worldbtn` (wireframe A, error state).
- **Free-drive worlds** (`RACELESS`, `index.html:2593`): `#startbtn` and `#blitzbtn` stay hidden as today; the
  first visible mode button (`#huntbtn`) gets the autofocus.

### 2. Worlds dialog (`#worlds`, new)

A full-screen dialog like `#carsel` (`index.html:309-324`): `role="dialog" aria-modal="true"
aria-labelledby="worldstitle"`, opened by `#worldbtn`, closed by `#worldsback` or `Esc`. Open/close mirror
`openCarSel()`/`closeCarSel()` (`index.html:2603-2604`): the overlay is hidden while the dialog is shown, and
closing re-shows the overlay and focuses `#worldbtn`.

```html
<div id="worlds" hidden role="dialog" aria-modal="true" aria-labelledby="worldstitle">
  <div class="ws-head"><h1 id="worldstitle" data-i18n="worldsTitle">Worlds</h1><span class="ws-sub" data-i18n="worldsSub">Choose where to drive</span>
    <button id="worldsback" class="btn" type="button" data-i18n="carselBack">‹ Back</button></div>
  <div class="ws-body">
    <div class="ws-list">
      <div class="regionrow" role="group" aria-labelledby="regionslabel">
        <span id="regionslabel" class="ws-label" data-i18n="region">Region</span>
        <button id="region-hochrhein" class="ws-row" type="button" aria-pressed="true">Hochrhein</button>
        <button id="region-ehrendingen" class="ws-row" type="button" aria-pressed="false">Ehrendingen</button>
        <button id="region-world" class="ws-row" type="button" aria-pressed="true" hidden></button>
      </div>
      <div id="worldsrow" class="regionrow" role="group" aria-labelledby="worldslabel">
        <span id="worldslabel" class="ws-label" data-i18n="worldsRow">Worlds</span>
        <span id="worldsbtns" style="display:contents"></span>
        <p id="worldsempty" class="ws-empty" data-i18n="worldsEmpty"></p>
        <a id="buildworld" class="btn small" href="../editor.html" data-i18n="buildYourOwn">+ Build your own world…</a>
      </div>
    </div>
    <div class="ws-preview">
      <div id="wpname" class="ws-name"></div>
      <p id="worldsdesc" role="status"></p>
      <p id="wpworld" class="ws-line"></p>
      <p id="wpterrain" class="ws-line"></p>
      <p id="wpbest" class="ws-line"></p>
      <details id="wpfiles" class="ws-files" open>
        <summary data-i18n="filesTitle">Files</summary>
        <div class="terrainrow">
          <label for="mmhfile" class="btn small" data-i18n="loadTerrain">Load terrain (.mmh)</label>
          <input id="mmhfile" type="file" accept=".mmh" hidden>
          <button id="mmhclear" class="btn small" type="button" hidden data-i18n="useMadeUp">Use made-up terrain</button>
          <label for="worldfile" class="btn small" data-i18n="loadWorldFile">Load world file (.zip)</label>
          <input id="worldfile" type="file" accept=".zip,application/zip" hidden>
          <button id="worlddl" class="btn small" type="button" hidden data-i18n="downloadWorld">Download world</button>
          <button id="worldforget" class="btn small" type="button" hidden data-i18n="forgetWorld">Remove saved copy</button>
          <span id="worldforgetask" hidden><span data-i18n="removeAsk">Really remove?</span>
            <button id="worldforgetyes" class="btn small" type="button" data-i18n="removeYes">Yes</button>
            <button id="worldforgetno" class="btn small" type="button" data-i18n="removeNo">No</button></span>
          <span id="worldfilestatus" role="status"></span>
        </div>
      </details>
    </div>
  </div>
  <div class="ws-foot"><span id="wpsource" class="ws-source"></span><button id="drivebtn" class="btn primary" type="button" data-i18n="driveHere">Drive here ›</button></div>
</div>
```

- **Rows are toggle buttons, not radios.** The list keeps `aria-pressed` on `#region-*` and on the gallery buttons
  (set in `showGallery()`, `index.html:2928-2940`) because `test_region.py`, `test_gallery.py` and `test_world.py`
  read that attribute. A `role="group"` with arrow-key movement gives the same keyboard behaviour the wireframe asks
  of a radiogroup. Roving tabindex: the pressed row has `tabindex="0"`, the others `-1`, so the list is one tab stop.
- **Selection vs. drive.** Clicking a row or pressing ↑/↓ *selects* it (`WORLDS.sel = {kind:'region'|'world', id}`),
  updates `aria-pressed`, the roving tabindex and the preview. Nothing reloads until `#drivebtn`, which calls
  `location.search = regionSearch(location.search, id)` or `worldSearch(location.search, id)` — the same calls the
  row buttons make today (`index.html:2600`, `2937`). When the selection is the loaded world, `#drivebtn` just
  closes the dialog. (Flow 1b: "PV -- DRIVE HERE --> RL".)
- **Preview.** `#wpname` = selected name. `#worldsdesc` keeps its current `focus`/`mouseenter` semantics for gallery
  rows (test_gallery hovers and reads it) and additionally shows the gallery description of the selected world, or
  the region's intro string (`tr(REGIONS[id].strings.intro)`) for a region. `#wpworld`/`#wpterrain` show the
  `worldOsm`/`worldHand` and `terrainMeasured`/`terrainMadeUp` lines only when the selection is the loaded world —
  nothing else is known about an unloaded one; `renderStatus()` fills them next to `#worldstatus`/`#mmhstatus`.
  `#wpbest` = `tr('wpBest', time)` from `localStorage[bestKey]` (`REGIONS[id].bestKey`, or
  `mm.best2.world.<id>` as `generatedRegion()` derives it), "—" when unset. `#wpsource` in the footer = name +
  " · OpenStreetMap + swisstopo" for OSM worlds, name alone otherwise.
- **FILES.** The whole `.terrainrow` moves in unchanged, inside a `<details>`: `open` at 1280 px; `openWorlds()`
  sets `open = !matchMedia('(max-width:600px)').matches` (wireframe C, phone: collapsed by default). Its ids,
  handlers and status lines (`index.html:2700-2727`) are untouched except **Remove saved copy**: the click now hides
  `#worldforget` and shows `#worldforgetask`; `#worldforgetyes` runs the old handler body
  (`idbSet(savedKey(WORLD_ID), null); location.reload()`), `#worldforgetno` restores the button and focuses it
  (flow decision 4).
- **Empty state.** `#worldsempty` is shown when `showGallery()` resolves with no entries; the regions and
  `#buildworld` stay (wireframe C, empty). `#buildworld` stays the last `button, a` in `#worldsrow`
  (test_gallery). PR#344 adds `target="_blank" rel="noopener"` to this anchor; keep the line shape so it merges.
- **Error state.** Only what already exists: file errors print in `#worldfilestatus` / `#mmhstatus`. The
  "EXPIRED/OFFLINE badge on a row" of wireframe C has no data source yet (the gallery API does not report expiry per
  entry) and is not built; `#worldgone` on the start screen covers the loaded-world failure.
- **Keys.** The global keydown dispatch (`index.html:2143`) gets `if (WORLDS.on) { worldsKey(e); return; }` right
  after the `CARSEL.on` branch. `worldsKeyAction(e)` (pure, in `prototype/startscreen.js`) returns `'back'` for
  `Escape`, `'prev'`/`'next'` for `ArrowUp`/`ArrowDown` (only while focus is on a `.ws-row`), `'pass'` for `Tab`,
  `Enter`, `NumpadEnter`, `Space`, else `'ignore'` — the `carselKeyAction()` pattern (`carselect.js:76-82`).
  Focus movement uses `nextFocus()` from `pause.js:53`.
- **Loading inside the dialog** (wireframe C "Building Lenzburg… 62 %") does not apply: a drive reloads the page
  (flow decision 3), and the start screen's loading state shows while it builds.

### 3. Mode text follows focus

- `MODE_TEXT_KEYS = { trial: REGION.strings.intro, blitz: 'blitzIntro', hunt: 'huntIntro' }` (`huntIntro` is new;
  `huntStart` stays the in-race toast).
- `showModeText(mode)` writes `tr(key)` into `#ovtext`. `focus` and `mouseenter` on `#startbtn`/`#blitzbtn`/
  `#huntbtn` call it with their mode; `blur`/`mouseleave` call `showModeText(focusedMode() ?? SHOWN.mode)`.
  `focusedMode()` reads `document.activeElement.id`. Buttons 4–8 leave the text alone (they do not call it).
- `SHOWN.mode` = the default when nothing is focused: `R.mode` in the result view, else `lastModeFrom(localStorage
  .getItem('mm.lastMode'))` (pure, validates against `['trial','blitz','hunt']`, falls back to `'trial'`; in a
  `RACELESS` world always `'hunt'`). `startRace()` writes `mm.lastMode` (flow decision 5).
- In the result view (`R.state === 'finished'`), `#ovtext` shows the finished text of the played mode as today
  (`renderOverlay()`, `index.html:2592`), hover/focus still swap it, blur reverts to the finished text.
- **Initial focus.** On load, `toMainMenu()` and `closeCarSel()`/`closeWorlds()`, the first visible mode button gets
  focus, except on load when `matchMedia('(pointer:coarse)').matches` — then nothing is focused, so the slot shows
  the last played mode and a tap on a mode button starts it directly (decision "Mode text on touch").
- `Enter` starts because the focused `<button>` handles it natively; the horn branch already requires
  `$('overlay').hidden` (`index.html:2143`).

### 4. Result view

`#result` keeps its id, markup (`resultHtml()`) and show/hide points (`finish()`, `timeUp()`, `showHuntResult()`,
`toMainMenu()`, `startRace()`); it now renders inside the slot above `#ovtext`. The played mode's button reads
`tr('retry')` as today, and the English value of `retry` changes from "Retry" to **"Again"** (flow decision 1:
"START reads AGAIN"); German stays "Nochmals".

### 5. Keyboard

- Focus order on the start screen = DOM order: 1 START → 2 BLITZ → 3 HUNT → 4 CAR → 5 WORLD → 6 STYLE → (7, 8, 9
  once unhidden) → `#game-nav` links. Tags, logo, sticker, slot and footer texts are not focusable.
- **Tab fix.** `index.html:2143` becomes `if (e.code === 'Tab' && $('overlay').hidden && !WORLDS.on) e.preventDefault();`
  so the #129 guard (a held Tab leaving the canvas mid-race) still holds while racing, and native focus navigation
  works on the start screen and in the dialog. `#carsel` and `#pause` already pass or handle Tab themselves.
- Dialog: `Esc`/BACK return focus to `#worldbtn`; `Esc` on the start screen itself does nothing new
  (`canPause()` is false there, `pause.js`).

### 6. Visuals (tokens from `design/mockups/StyleSheet.dc.html`, `TODO.md` "Design tokens")

- `:root` gains `--burnt:#c24a00`. Existing tokens are reused; no new colours beyond the sunset gradient stops.
- **Sunset backdrop:** `#overlay{background:radial-gradient(ellipse at center,transparent 55%,rgba(10,8,20,.55)),
  linear-gradient(180deg,rgba(26,18,54,.78),rgba(90,38,71,.62) 35%,rgba(200,83,47,.45) 62%,rgba(240,147,60,.35) 80%,
  rgba(247,198,94,.3))}` — the mockup's `#skyA` stops with alpha, so the live scene shows through and the title
  reads as sunset even over the current day sky. The scene's own sky, fog and lights are not touched by this issue.
- **Logo:** `font:400 clamp(56px,11vw,150px)/.9 Bungee; transform:skewX(-9deg); -webkit-text-stroke:3px var(--charcoal);
  text-shadow:4px 4px 0 var(--signal),8px 8px 0 var(--burnt),12px 12px 0 #6b2400,16px 16px 0 var(--charcoal),0 0 60px rgba(255,122,26,.55)`.
- **Edition plate:** `padding:6px 20px; background:linear-gradient(#3a3f4b,#1c1f26); border:3px solid; border-color:#8d96a3
  #2a2e38 #2a2e38 #8d96a3; font:800 italic 22px; letter-spacing:3px; uppercase; color:var(--sun)`, flanked by two
  4 px × 120 px gradient rules.
- **Tags:** `padding:6px 14px; background:rgba(20,23,29,.75); border:2px solid #4a515e; font:700 15px; letter-spacing:2px;
  uppercase; color:var(--steel-l)`; the car dot `10px` Sunflower with glow.
- **Sticker:** `transform:rotate(-7deg); padding:12px 18px; background:var(--sun); border:5px solid var(--charcoal);
  box-shadow:8px 8px 0 var(--charcoal); color:var(--charcoal); font:800 italic 20px/1.05; uppercase; max-width:260px`.
- **Bar:** `background:linear-gradient(#66707e,#3a404b 40%,#23272f); border-top:5px solid #9ea7b3; box-shadow:0 -12px 30px
  rgba(0,0,0,.5); padding:18px 32px 14px`, both rows centred, `gap:16px`/`10px`. Buttons keep `.btn`/`.btn.small`
  (bevel, 64 px / 40 px); primary row buttons get `min-width:180px`. New: `.btn:hover:not(:disabled)` uses the
  primary Sunflower gradient (StyleSheet hover state), `.btn:disabled{background:#5f6673;border-color:#737b88 #3a404b
  #3a404b #737b88;box-shadow:none;color:#2a2e38;cursor:default}` (flat disabled state). Focus ring unchanged.
- **Slot:** `max-width:560px; padding:12px 16px; background:rgba(20,23,29,.78); border:3px solid; border-color:#4a515e
  var(--ink) var(--ink) #4a515e`. `#result` styles unchanged. `#worldgone` keeps its red-brown border.
- **Footer:** `padding:8px 32px calc(64px + env(safe-area-inset-bottom,0px))` — the fixed `#game-nav` sits 8 px above
  the bottom while the overlay is open (`index.html:2956`), so the blurb must clear it.
- **Layering:** `#overlay{z-index:10}`, `#worlds{z-index:12}`; `#carsel` 15, `#help` 21, `#pause` 30 stay above.
- **Hide the HUD under the overlay:** `body:has(#overlay:not([hidden])) :is(#tl,#tr,#tc,#bl,#br,#stylebtn,#pausebtn,#touch){display:none}`
  — the same mechanism `#carsel` uses (`index.html:161`). `#debug` and `#toast` stay (F3 and toasts work on the
  start screen today).
- **Worlds dialog:** RaceSetup vocabulary — head with Bungee title, left `.ws-list` as a sunken well
  (`background:var(--ink); border:3px solid; border-color:#0b0d12 #4a515e #4a515e #0b0d12`), rows 48 px high, full
  width, `aria-pressed="true"` row in Sunflower text with a 4 px left bar; right `.ws-preview` raised
  (`.panel`-like bevel); footer bar like the start bar with `#drivebtn` right-aligned.
- **Phone (`max-width:600px`):** tags 11 px on one line; logo 56 px; sticker `display:none`; `.bar` is
  `position:sticky; bottom:0`; primary row `display:grid; grid-template-columns:1fr 1fr; gap:8px`, buttons 48 px /
  20 px font / `padding:0 8px`; secondary row `flex-wrap` with `#worldbtn{flex-basis:100%}` and the rest `flex:1`;
  footer blurb 2 lines (`font-size:13px`); dialog body stacks (`flex-direction:column`), preview collapses to
  name + source + terrain lines, FILES `<details>` closed, `.ws-foot` sticky bottom with a full-width `#drivebtn`.
  `#game-nav` stays hidden under 600 px while a dialog is open, as today (`index.html:2957`).
- **`prefers-reduced-motion`:** this issue adds no animation or transition (the hover state is a static colour
  swap), so there is nothing to switch off and no rule is added. The decision "static frame when reduced motion,
  pause the flight while a dialog is open" transfers to the follow-up that adds the flight (see Deferred).

### 7. Strings (`prototype/strings.js`, both `en` and `de`)

New keys: `edition(n)`, `worldBtn(n)`, `carTag(n)`, `huntIntro`, `stickerHochrhein`, `stickerEhrendingen`,
`worldsTitle`, `worldsSub`, `driveHere`, `filesTitle`, `worldsEmpty`, `wpBest(t)`, `wpSource(n)`, `removeAsk`,
`removeYes`, `removeNo`, `tutorial`, `whatsNew`, `credits`. Changed: `en.retry` "Retry" → "Again". Removed: none
(`blitzIntro` is still used as the Blitz mode text). The de/en key-parity test (`strings.test.mjs`) and the
no-sharp-s test apply.

### 8. Pure module `prototype/startscreen.js` (new)

`export const MODES = ['trial', 'blitz', 'hunt']`, `lastModeFrom(stored, raceless)`, `modeTextKey(mode, regionStrings)`,
`editionText(region, tr)`, `worldsKeyAction(e, onRow)`, `bestKeyFor(sel)`. Node tests in
`prototype/tests/startscreen.test.mjs`. Mapped in `prototype/tests/test-map.json` to `test_start_screen.py`.

### 9. Test hook

`window.__mm.startScreen = () => ({ mode: SHOWN.mode, text: $('ovtext').textContent, worldsOpen: WORLDS.on,
sel: WORLDS.sel, focus: document.activeElement && document.activeElement.id })`.

## Existing tests that touch the overlay

Must run locally (foreground, one file at a time, see Verification):

| file | why it is affected | change needed |
|---|---|---|
| `test_start_screen.py` (new) | the new screen | — |
| `test_carselect.py` | line 59 asserts the old five-button `.row` order | assert `#overlay .bar .row` children = `startbtn, blitzbtn, huntbtn, carbtn` and the `.secondary` row starts with `worldbtn, stylebtn2` |
| `test_region.py` | 30–39 click a region (now in the dialog, select-then-drive); 91–96 the "not covered by nav" test targets region buttons | open the dialog (`#worldbtn`) before reading/clicking; add `page.click("#drivebtn", no_wait_after=True)` after selecting; retarget the nav test to `#worldbtn`, `#stylebtn2`, `#gg-lang-toggle` |
| `test_gallery.py` | 32–50 hover/click gallery buttons; 37 expects the click to reload; 59–61 empty gallery; 66–74 `#worldsrow` ends with `#buildworld` | open the dialog first; after the row click add the `#drivebtn` click; the rest holds unchanged |
| `test_world.py` | 81 `#region-world` visible; 116 `#worlddl`; 131 `label[for=worldfile]`; 176–178 `#worldforget` click; 141–158 `#worldgone` | open the dialog before 81/116/131/176; after `#worldforget` click `#worldforgetyes`; additionally assert `#edition` text = "Testdorf" on the start screen; `#worldgone` assertions unchanged |
| `test_blitz.py` | 36 reads `#blitzhint`; 73 expects "Retry" | hover `#blitzbtn` and read `#ovtext`; expect "Again" |
| `test_hunt.py` | 79 expects "Retry" | expect "Again" |
| `test_i18n.py` | 64–65, 96–102, 194–200: element texts; 199 expects "Retry" | expect "Again"; everything else reads `textContent`, which works for elements inside the hidden dialog |
| `test_pause.py` | overlay visible/hidden waits; `.panel` for the pause dialog | none expected; run it |
| `test_help_filter.py` | F1 on the start screen, `#overlay .keys` | none expected; run it |
| `test_smoke.py::test_bundled_terrain_loads_without_upload` | `#mmhstatus.real` visible on the start screen | none expected; run it |
| `test_xss.py` | `#overlay img` count, `#region-world` text with a hostile name | open the dialog before reading `#region-world`; also read `#edition` |

CI (`select_tests.py`): the new and edited test files are picked by rule a; `strings.js` maps to `test_i18n.py`;
`index.html` adds the smoke trio by rule d; `startscreen.js` maps to `test_start_screen.py` via the new
`test-map.json` entry. That is more than the cap of 8, so CI runs the smoke set plus the changed test files —
which is exactly the list above minus `test_pause.py` and `test_help_filter.py`; those two run locally.

## Relation to other issues

- **#202** (on-foot mode, `ai-implement`, running): also edits `prototype/index.html` and `prototype/strings.js`.
  Do not run the two concurrently; whichever lands second rebases. #202 does not touch the overlay markup.
- **PR#344** (editor link in a new tab): one attribute on `#buildworld` plus a `test_gallery.py` line — trivial
  rebase either way, keep the anchor on one line.
- **#263 What's new, #267 Credits, #268 Tutorial:** each adds its own button (`#newsbtn`, `#creditsbtn`,
  `#tutorialbtn`), its string and its handler; `mm.newsSeen` and the NEW dot are #263's.
- **#170** (closed): `showGallery()` keeps its contract (`window.__mm.gallery`, `#worldsbtns button`,
  `#worldsdesc` on hover/focus); only the click action and the container move.

## Deferred (explicitly out of this issue)

- **Live sunset flight behind the start screen** — scene sunset preset (sky uniforms, fog, hemi/sun colours) and a
  slow camera flight over the Holzbrücke, paused while a dialog is open, static frame under
  `prefers-reduced-motion`. It touches `applyStyle()`, `setUnderwater()`, the cave/room look restores
  (`index.html:1947-1988`) and `stepCamera()` (`2517`), is visible in every start-screen screenshot of the visual
  test runs, and interacts with the result view (the car is at the finish when the overlay returns). Filed as
  **#351**; this spec's CSS backdrop is the stand-in until then.
- Per-row EXPIRED/OFFLINE badges in the Worlds list (no per-entry data from the gallery API today).
- A build progress percentage (needs a chunked world build).

## Assumptions

- **A1** [high] The wireframe and flow decisions are final; this spec only adds the technical design.
  Rejected: re-opening any of them. Both files say "Approved 2026-10-17" and the issue brief names them as the
  source of truth.
- **A2** [high] `#mmhstatus` (and the `#worldstatus` created after it) stay visible on the start screen, in the
  footer status line; the Worlds preview shows the same text through `#wpworld`/`#wpterrain`. Rejected: moving the
  two ids into the dialog as wireframe C sketches. `grep -c 'wait_for_selector("#mmhstatus.real"' prototype/tests/*.py`
  finds 8 waits (test_smoke.py ×5 plus test_fridolinsbruecke.py, test_jump.py, test_suedspange.py, test_underpass.py),
  and Playwright's `wait_for_selector` defaults to `state="visible"`; an element inside a `hidden` dialog never
  becomes visible, so those tests would time out. The `#worldstatus` waits use `wait_for_function` on
  `textContent` (45 files) and do not care.
- **A3** [high] The world/region rows stay `<button aria-pressed>` elements inside `#worldsbtns`/the region group,
  with a `role="group"` container and arrow-key movement, instead of `role="radio"`/`aria-checked`. Rejected: a
  real radiogroup. `test_region.py:30-31`, `test_gallery.py:61`, `test_world.py:82` read `aria-pressed`;
  `test_gallery.py:32-50` select `#worldsbtns button`. Keyboard behaviour is the same.
- **A4** [high] Clicking a row selects; only DRIVE HERE reloads. Rejected: keep click = reload and make DRIVE HERE
  a duplicate. Flow 1b draws the reload from "DRIVE HERE" only, and the wireframe's loading note ("re-select
  cancels and restarts") presumes selecting is cheap.
- **A5** [med] ~~7 TUTORIAL, 8 WHAT'S NEW and 9 CREDITS are built as `hidden` buttons with their labels in
  `strings.js` and no handlers.~~ **Reversed in review:** no markup at all (as the #224 spec chose for the credits
  slot). Nothing un-hides or wires the three buttons, so they were scaffolding for unannounced features, and a
  `hidden` button verifies neither the phone grid nor the focus order — both skip it. Each issue adds its own
  button (and its string) when it lands; the secondary row is 2 buttons until then.
- **A6** [med] `en.retry` becomes "Again" (de "Nochmals" already means that). Rejected: leaving "Retry" and
  ignoring the wording in flow decision 1, or adding a second key. The decision names the word; the three test
  assertions on "Retry" (`test_blitz.py:73`, `test_hunt.py:79`, `test_i18n.py:199`) are one-word edits whose intent
  (the played mode's button changes label after a finish) is kept.
- **A7** [high] Tests whose assertions encode the old layout are updated as listed above, keeping each test's
  intent; no test is weakened to pass. Rejected: keeping the tests unchanged (impossible: `test_carselect.py:59`
  asserts the literal old button order) or deleting them.
- **A8** [med] The HUD plates, map, style/pause buttons and touch controls are hidden while the overlay is up.
  Rejected: leaving them visible under the full-bleed screen. The mockup shows no HUD, the new tags sit exactly where
  `#tl`/`#tr` are, and `#carsel` already hides them (`index.html:161`). `#debug` and `#toast` stay. No test reads a
  HUD element's *visibility* on the start screen (test_i18n reads `textContent`; test_pause taps `#pausebtn` after
  `open_page(start=True)` started the race, `test_pause.py:17,243`).
- **A9** [high] The global `Tab` `preventDefault` (`index.html:2143`) is narrowed to "while racing" so native focus
  navigation works on the start screen and in the dialog. Rejected: a hand-rolled focus manager. #129's concern is a
  held Tab during a race; the pause menu (`pause.js`) and `#carsel` already let Tab through when a dialog is up.
- **A10** [med] The loading state is `disabled` on the three mode buttons plus the static text "Building the
  world…", without a percentage. Rejected: the wireframe's "▓▓▓▓░░ 62 %" bar. The world is built synchronously
  at module top level (`index.html:574-1606` region), so no progress can render mid-build; adding a chunked build
  is a different issue.
- **A11** [med] The sunset of the mockup is a CSS gradient on `#overlay` over the live scene; the scene's own sky,
  fog and lights are unchanged and the camera flight is a follow-up. Rejected: a scene preset now. The maintainer's
  brief allows deferring the live flight if it is large; a scene preset alone would have to be re-applied by
  `applyStyle()` (the Style button works on the start screen), `setUnderwater()`, the cave and room look restores,
  and `toMainMenu()`, which is the same surface as the flight — so the two go together in the follow-up.
- **A12** [high] On touch devices nothing is focused on load, so the slot shows the last played mode; on pointer
  devices the first visible mode button is focused and the slot follows it. Rejected: autofocus everywhere (the
  "last played mode" text would never show on a phone) or nowhere (`Enter` must start, wireframe A). Decision "Mode
  text on touch" in the wireframe.
- **A13** [high] No `prefers-reduced-motion` rule is added because this issue adds no motion. Rejected: an empty
  media query for the future flight (dead CSS). The follow-up carries the decision.
- **A14** [med] Preview "Best" line reads the existing best-time keys from `localStorage`; "World"/"Terrain" lines
  appear only for the loaded world. Rejected: fetching metadata for unloaded worlds (no API for it) or leaving the
  preview empty.
- **A15** [high] `Drive here` on the already-loaded world closes the dialog without a reload. Rejected: reloading
  anyway (loses nothing but takes seconds).

## Consequences

- Choosing a region or world is now two steps (select, then DRIVE HERE) instead of one click; the region buttons
  are no longer on the start screen itself.
- The Blitz explanation is no longer always visible; it shows while BLITZ has hover or focus (and as the default
  text after a Blitz was the last mode played).
- The HUD is no longer visible behind the start screen, so a player sees the speedo/map only once the race starts.
- `#blitzhint` no longer exists; `mm.lastMode` is a new `localStorage` key (shared across worlds).
- Until the follow-up lands, the "sunset" is a tint over whatever sky the current style renders at the start
  position; the Holzbrücke is not in view.
- The start screen's English "Building the world…" placeholder shows untranslated during the build, like today's
  English intro paragraph in the static HTML (`i18n.js` loads after the module script).
- `index.html` has no `<meta name="viewport">` (`test_pause.py:20-21`), so on a real phone the page lays out at
  980 CSS px and the `max-width:600px` layout fires only in tests and on narrow desktop windows. Pre-existing for
  the whole game; not changed here.

## Verification

- Unit: `node --test prototype/tests/startscreen.test.mjs prototype/tests/strings.test.mjs`.
- Browser, locally only, foreground, one file per call:
  `direnv exec /home/freax/repos/github/freaxnx01/public systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/<file> -x`
  for `test_start_screen.py`, then the table above.
- Screenshots at 1280×720 and 390×844 (`test_start_screen.py::test_screenshots` writes them to `tmp_path` and
  prints the paths) are looked at, not just produced: logo not clipped, bar inside the viewport, no horizontal
  scroll, nav not over the footer.
