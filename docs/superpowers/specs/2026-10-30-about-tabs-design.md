# About dialog in tabs, all agents and LLMs, more of Kiscsi's ideas (#564)

Follow-up to the About dialog (#509, PR#543; spec `2026-10-29-about-screen-design.md`).

## Why

The About dialog is one long scrolling column and says only "Claude Code" about how the game is built, although several agents and models work on it. The maintainer wants it split into tabs, the full agent/LLM list, and Kiscsi's further ideas credited.

## Decisions (maintainer, 2026-10-30, issue #564)

- The **dedication stays fixed at the top**, below it **four tabs**: Leute · Das Spiel · Credits · So ist es gebaut (en: People · The game · Credits · How it is built).
- The **first tab is active on open** (every open, also after Back from another screen).
- The **footer** (source · glossary · version) stays **visible below the tabs** on every tab.
- Keyboard (arrow keys, Tab) and touch work; **Back / Esc behave as before** (`about.js`).
- Existing texts, `ABOUT_LINKS` and the entry points (start screen, pause menu, command search) stay.
- **Kiscsi's role** names the Holzbrücke, the Robidogs (#415), the flying poo piles (#469) and ends with "and many other ideas …" (de: „und viele andere Ideen mehr …“).

## Layout

```
About Map Madness                                  ‹ Back
┌ This game is dedicated to Juliska ───────────────────┐   fixed
[ People ] [ The game ] [ Credits ] [ How it is built ]    tablist
────────────────────────────────────────────────────────
 active panel only (scrolls inside if it is long)          tabpanel
────────────────────────────────────────────────────────
 source code · glossary · v0.x                             fixed
```

- **People** (`#aboutpanel-people`): the `.ab-people` list (Tschosi / Ätti / Kiscsi), moved out of the dedication block.
- **The game** (`#aboutpanel-game`): `aboutGame` + the Midtown Madness link.
- **Credits** (`#aboutpanel-credits`): the existing `.ab-credits` list unchanged (models, data, Plattform Sisslerfeld, libraries, fonts).
- **How it is built** (`#aboutpanel-built`): `aboutBuilt` (reworded: several agents and models), the **agent/LLM list** (below), then agent rules / workflow links.
- The footer `.ab-foot` leaves the last section and sits under the panels; `#about` no longer scrolls as a whole, the **panel area** (`.ab-panels`) scrolls (`flex:1; min-height:0; overflow-y:auto`), so dedication, tabs and footer never scroll away.

## Accessibility and input

- `role="tablist"` (aria-label = the dialog title) with four `<button role="tab" id="abouttab-<id>" aria-controls="aboutpanel-<id>" aria-selected>`; four `role="tabpanel"` with `aria-labelledby` and `hidden` when inactive.
- Roving tabindex: selected tab `tabindex=0`, the others `-1`. Tab moves from the tablist into the panel / footer / Back as usual.
- Arrow Left/Right move to the previous/next tab and select it (automatic activation, wraps), Home/End jump to first/last. Pure rule in `about.js` (`aboutTabIndex`), `aboutKeyAction` returns `'tab'` for those four keys; the handler only acts when focus is on a tab, otherwise the key does nothing (the game keys stay blocked).
- Click/tap selects (buttons, min height 44 px). Phone width: the tabs wrap onto two rows (`flex-wrap`), no sideways scroll.
- Esc / Back: unchanged (`aboutKeyAction` → `'back'`, `closeAbout`).

## Agents and LLMs (verified)

Sources: `.github/workflows/agent.yml` (`agent: opencode`, `default-model: z-ai/glm-5.3`, `review-model: claude-sonnet-5`, "Sonnet instead of the Opus default", `self-fix: true` "the implementing agent (GLM) fixes the findings, Sonnet re-reviews"), its git history (`1d3a7f0` 2026-10-10 "implement on GLM via OpenRouter, review on Sonnet" #185; GLM 5.2 → 5.3 #282, back #294, 5.3 again #338), and the `Co-Authored-By` trailers on `main` (Claude Opus 5 / 5.5, Sonnet 5 / 5.5, Fable 5.1, Haiku 4.5; no other vendor appears).

| Role | Agent | Model |
|---|---|---|
| Implementation (since 2026-10-10) | OpenCode | GLM 5.3 (z.ai, via OpenRouter) |
| Review, re-review after self-fix | Claude Code | Claude Sonnet |
| Design and graphics issues (labels `agent:claude` + `model:fable`) | Claude Code | Claude Fable |
| Local sessions: enrichment, specs, plans, tests | Claude Code | Claude Opus |
| Implementation until 2026-10-10 (before GLM) | Claude Code | Claude Opus (the pipeline's default) |
| Small helper tasks | Claude Code | Claude Haiku |
| UI mockups (`docs/09-design-workflow.md`) | Claude Design | n/a |

Strings name families, not versions (versions rot), except GLM 5.3 which the workflow pins.

## Strings

New keys (en + de, same key set): `aboutTabPeople` and one role/text pair per table row: `aboutAg<X>Role` + `aboutAg<X>` for X in `Impl`, `Review`, `Design`, `Local`, `Early`, `Helper`, `Mockup`. Changed: `aboutRoleKiscsi`, `aboutBuilt`, de `aboutBuiltTitle` ("So ist es gebaut", matching the tab). The tab labels reuse `aboutGameTitle`, `aboutCredits`, `aboutBuiltTitle`; the panel `<h2>`s go (the tab is the heading).

## Units

- `prototype/about.js`: `ABOUT_TABS`, `aboutTabIndex(code, current)`, `aboutKeyAction` gains `'tab'`.
- `prototype/index.html`: markup, CSS, `selectAboutTab(i)`, `openAbout` resets to tab 0, `aboutKey` handles `'tab'`, click handlers, `window.__mm.aboutTab()`.
- `prototype/strings.js`: keys above.

## Testing

- Node: `about.test.mjs` (tab order, `aboutTabIndex` wrap/Home/End, `aboutKeyAction` 'tab'), `strings.test.mjs` passes (same key set) plus a test that the Kiscsi text names the three ideas in both languages.
- Playwright, one new file `prototype/tests/test_about_tabs.py`; `test_about.py` is adjusted where it relied on the old single column. Run only these two files.

## Assumptions

- [low] CHANGELOG entry is **English with the `YYYY-MM-DD HH:MM` prefix**, because that is what `CHANGELOG.md` actually uses in this repo (the dispatch brief asked for German style; German style applies to the German strings).
- [low] Claude Haiku is listed as "small helper tasks": it appears only in `Co-Authored-By` trailers (13x), the role is inferred.
- Panels are removed from view with `hidden`, not CSS only, so screen readers skip them.
- Automatic activation (arrow selects) because every panel is static text and cheap to show.
- Version numbers are left out of the model names (except GLM 5.3), to avoid stale text.
- German tab label for the build tab becomes „So ist es gebaut“ (was „So entsteht das Spiel“ as heading); `keyAbout` command-search text is left alone.

## Consequences

- `test_about.py::test_german_texts` read the `h2` headings; it is rewritten to read the tabs.
- The About dialog no longer scrolls as a whole; very small viewports scroll the panel only.
- Adding a fifth tab later means: one entry in `ABOUT_TABS`, one button, one panel.
- The agent list is static text: when `agent.yml` changes its models, the strings need a manual update (a drift test is out of scope).

## Out of scope

Deep links to a tab (`?about=credits`), remembering the last tab, animations, a drift test against `agent.yml`.
