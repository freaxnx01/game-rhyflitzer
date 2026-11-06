# The loading-screen lines in About (#695)

Tester request: the loading lines ("Hügel aufschütten …", "Robidogs aufstellen, Säckli nachfüllen …") flash by too fast to read,
especially for children. They should be readable later in the About dialog.

## Today

- `loading.js` `LOAD_STAGES` holds the 13 stages in order. `strings.js` has `load_<stage>` in en and de. `load_roads`, `load_houses`
  and `load_props` are functions of `{roads}`, `{houses}`, `{robidogs, lamps}` and fall back to a line without numbers when the
  count is empty.
- `index.html` `loadStage(stage, counts)` formats the counts with `LOAD_NUM` (OS region, `numberLocale`) and shows
  `tr('load_<stage>', shown)` in `#loadmsg`. The counts are not kept.
- About (`#about`, #509/#564) has four tabs, `ABOUT_TABS = ['people', 'game', 'credits', 'built']` in `about.js`, each tab
  `#abouttab-<id>` controlling `#aboutpanel-<id>`. `aboutTabIndex` wraps with `ABOUT_TABS.length`.

## Decisions (maintainer, 2026-11-06)

- **A fifth tab**, `loading`, labelled "While loading" / "Beim Laden", last in the row. Easier for a child to find than a section
  inside another tab.
- **The lines as they were shown while loading**, numbers included ("1'234 Strassen teeren …"). Where the build had no count (hand
  layout, generated world), the line without numbers, which the string function already gives.

## Design

- `loading.js`: new pure `loadLines(t, counts)`. `t(key, args)` translates; `counts` maps a stage to the formatted counts that
  `loadStage` showed (`{}` or missing → no numbers). Returns the 13 lines in `LOAD_STAGES` order.
- `index.html`:
  - `loadStage` stores its formatted counts in `LOAD_COUNTS[stage]`.
  - Tab button `#abouttab-loading` (`data-i18n="aboutTabLoading"`) and panel `#aboutpanel-loading` with an intro
    (`data-i18n="aboutLoadingIntro"`) and `<ol id="aboutloadlist" class="ab-load">`.
  - `renderAboutLoading()` fills the list from `loadLines((k, a) => tr(k, a), LOAD_COUNTS)`. It runs in `openAbout` and on
    `gg-langchange`, so switching the language relabels the list without reload. Numbers keep their OS-region format.
- `about.js`: `ABOUT_TABS` gains `'loading'`; keyboard wrap follows from `.length`.
- `strings.js`: `aboutTabLoading`, `aboutLoadingIntro` in en and de.
- CSS: `.ab-load` a plain numbered list in the panel's 16 px text, wrapping on phones.

## Not in scope

Timings per stage, a replay of the loading animation, the editor.

## Acceptance

- About has a fifth tab "While loading" / "Beim Laden" showing all 13 loading lines in stage order, in the current language
- Counts shown while loading appear in the same lines; without counts the line has no numbers and no "undefined"
- Switching the language updates tab label and lines without reload
- Keyboard (arrows, Home/End) and the phone layout work with five tabs
- Targeted tests: node (`loading.test.mjs`, `about.test.mjs`) and Playwright `test_about_tabs.py` only
