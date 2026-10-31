# Rename to "Rhyflitzer – Map Madness" Implementation Plan (#555)

**Goal:** The game's title is Rhyflitzer, the subtitle Map Madness, everywhere a player sees it. Spec: `docs/superpowers/specs/2026-10-31-rename-rhyflitzer-map-madness-design.md`.

**Architecture:** String and markup changes only. No logic change. No new files except none.

**Files:** `strings.js`, `index.html`, `prototype/index.html`, `README.md`, `CHANGELOG.md`, `docs/12-project-glossary.md`, `tests/test_about.py`, `tests/test_i18n.py`, `tests/strings.test.mjs` (only if it pins an old string).

**Constraints:** Do not touch `errNotMmh`, `editor/**`, `pipeline/**`, `TODO.md`, `design/**`, `docs/01`, `docs/09`, `docs/10`, `docs/design/**`. No Playwright run of the full suite: run only `tests/test_about.py`, `tests/test_i18n.py` and `node --test tests/strings.test.mjs`.

## Task 1: Tests first

- [ ] In `tests/test_about.py` line 40 change `"About Map Madness"` to `"About Rhyflitzer"`; line 81 change `"Über Map Madness"` to `"Über Rhyflitzer"`.
- [ ] In `tests/test_i18n.py` line 81 change the expected `sub` to `"Map Madness · Prototyp v0.2"`. In the `page.evaluate` object (near line 66) add `h1: document.querySelector('#overlay .logo h1').textContent, docTitle: document.title,` and assert `shown["h1"] == "Rhyflitzer"` and `shown["docTitle"] == "Rhyflitzer – Map Madness"`.
- [ ] Run the two Python tests: they fail on the old strings.

## Task 2: Strings and markup

- [ ] `strings.js` en: `sub: 'Map Madness · Prototype v0.2'`, `aboutTitle: 'About Rhyflitzer'`, `aboutBuilt` starts `Rhyflitzer is built with AI coding agents: ...` (rest of the sentence unchanged), `keyAbout: 'About Rhyflitzer: dedication, credits, how it is built'`.
- [ ] `strings.js` de: `sub: 'Map Madness · Prototyp v0.2'`, `aboutTitle: 'Über Rhyflitzer'`, `aboutBuilt` starts `Rhyflitzer entsteht mit KI-Agenten: ...`, `keyAbout: 'Über Rhyflitzer: Widmung, Credits, so entsteht das Spiel'`.
- [ ] `index.html`: `<title>Rhyflitzer – Map Madness</title>` (line 5); line 338 span text, line 390 `.sub` fallback text `Map Madness · Prototype v0.2`, line 394 `<h1>Rhyflitzer</h1>`, line 484 `About Rhyflitzer`.
- [ ] `prototype/index.html`: `<title>Rhyflitzer – Map Madness</title>`, link text `Play Rhyflitzer`.
- [ ] Run `node --test tests/strings.test.mjs` and the two Python tests: green. If `strings.test.mjs` pins an old string, update it to the new one.

## Task 3: Docs

- [ ] `README.md`: line 1 `# Rhyflitzer – Map Madness`; delete line 3 (`*Codename: Rhyflitzer*`) and one of the surrounding blank lines.
- [ ] `docs/12-project-glossary.md` line 7: `**Rhyflitzer – Map Madness**: the game's title (start screen, browser tab, GamesHub card); Rhyflitzer is the title, Map Madness the subtitle. The repository is called \`game-rhyflitzer\`.`
- [ ] `CHANGELOG.md`, top of `[Unreleased]` / `### Changed`, with the current Swiss time: `- \`YYYY-MM-DD HH:MM\` The game is now called **Rhyflitzer – Map Madness**: Rhyflitzer is the title on the start screen, in the browser tab and in the About page, Map Madness the subtitle.`

## Task 4: Verify and commit

- [ ] `grep -rn "Map Madness" strings.js index.html prototype/index.html README.md` shows only the subtitle uses (and `errNotMmh`).
- [ ] Commit `feat(ui): rename the game to "Rhyflitzer – Map Madness"` with `Closes #555`.
