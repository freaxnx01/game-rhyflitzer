# Rename the game to "Rhyflitzer – Map Madness" (#555)

Maintainer decision (2026-10-29, issue #555): **Rhyflitzer** is the title, **Map Madness** the subtitle. Until now it was the other way round (Map Madness the name, Rhyflitzer the codename). Reason: for the Neue Fricktaler Zeitung and the region "Rhyflitzer" is the stronger name; "Map Madness" alone sits too close to Midtown Madness, as a subtitle it stays the nod to the model.

## Scope

In scope: every player-visible occurrence of the old name in the game at the repo root. Everything else found along the way gets written down, not acted on.

## Decisions

- Start screen: `<h1>` becomes `Rhyflitzer`. The tag line `sub` becomes `Map Madness · Prototype v0.2` (en) / `Map Madness · Prototyp v0.2` (de). The `Codename` word goes away because Rhyflitzer is now the real name.
- Browser tab title (`index.html` `<title>`): `Rhyflitzer – Map Madness` (en dash, as in the issue).
- About: `aboutTitle` = `About Rhyflitzer` / `Über Rhyflitzer`; `aboutBuilt` starts with `Rhyflitzer` instead of `Map Madness`; `keyAbout` = `About Rhyflitzer: dedication, credits, how it is built` / `Über Rhyflitzer: Widmung, Credits, so entsteht das Spiel`. `aboutInspired` (Midtown Madness) stays untouched.
- `index.html` has the same literals as static fallback text (`keyAbout` span, `abouttitle` h1); they change with the strings.
- `prototype/index.html` (redirect stub): `<title>` and link text `Rhyflitzer – Map Madness` / `Play Rhyflitzer`.
- `README.md`: heading `# Rhyflitzer – Map Madness`, the italic codename line is removed (the repo name already is `game-rhyflitzer`).
- `CHANGELOG.md`: one player-voiced entry under `[Unreleased]` / `Changed`, with date and time (Europe/Zurich). Earlier entries are not rewritten.
- `docs/12-project-glossary.md`: the "Map Madness" entry becomes the game-name entry: title Rhyflitzer, subtitle Map Madness.
- Tests that assert the old strings follow: `tests/test_about.py` (two titles), `tests/test_i18n.py` (`sub`), plus a new assertion for the start-screen h1 and the document title.

## Unchanged on purpose

- `errNotMmh`, `.mmh` ("Map Madness Heightmap"), `pipeline/*.py` docstrings: a file-format name, not the game title.
- `editor/index.html` / `editor/strings.js` title "Region editor · Map Madness" and `tests/test_editor.py`: not in the issue's list; a separate decision (see Assumptions in the issue).
- `TODO.md`, `docs/01`, `docs/09`, `docs/10`, `docs/design/**`, `design/mockups/**`: historical.
- Repo name, domain (`rhyflitzer.freaxnx01.ch`, `CNAME`), `localStorage` keys: no change.

## Manual follow-up (outside this repo, not a plan task)

- GamesHub card in `freaxnx01.github.io/games/index.html`: title, alt text, `data-title`. The pipeline cannot touch that repo.

## Notes

- There is no `404.html` in the repo; the only "Play Map Madness" text is in `prototype/index.html`, covered above.
- The title "Rhyflitzer" is one character shorter than "Map Madness", so the start-screen logo (48 px on phones, `index.html:199`) cannot overflow more than today. The subtitle sits in the existing `.sub` tag plate.
