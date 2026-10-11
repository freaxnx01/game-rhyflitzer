# Testhub — playtest list, jump targets and feedback export (#251)

Status: approved design (brainstorm 2026-10-11). Supersedes #248's in-game dev list.

## Goal

The maintainer playtests by reading the changelog and finding each change in the game by hand. That
has two costs: remembering what is already tested, and getting to the place a change is about (a long
drive, or a sunken wreck that is hard to find). The Testhub fixes both:

- a list of what is still to test, per game, in its own window (second screen);
- one click puts the car at the place an item is about;
- a note per item, with a game screenshot when needed, exported in one go into
  `/processing-test-feedback`;
- items marked tested disappear, and the mark flows back into the repo.

It works for every `game-*` repo, starting with Rhyflitzer; Wipfelkratzer and others join with a
loader and a few registrations.

**Success:** open the hub, see only untested items, jump to each with one click, type a note, press
**Copy all**, paste into `/processing-test-feedback`.

**Out of scope:** the player-facing "What's new" list (own issue; it can reuse the registry later),
any server, GitHub tokens in the browser, an in-game dev list.

## Constraints

- Static only (GitHub Pages). No server, no token.
- All games share the origin `https://github.freaxnx01.ch`, so they share `localStorage` and can talk
  across windows with `BroadcastChannel`. Pages serves `test-todo.md` raw (`.nojekyll`,
  `text/markdown`, same origin; checked 2026-10-11).
- Players never see anything of it: the game loads nothing unless dev mode is on.
- `test-todo.md` in each game repo stays the source of truth for what is owed.

## Architecture

```
 hub window (github.freaxnx01.ch/testhub/)          game window (/game-<name>/?dev=1)
 ┌──────────────────────────────┐   BroadcastChannel   ┌────────────────────────────┐
 │ parse /game-<name>/test-todo │ ── hello ──────────▶ │ /testhub/client.js         │
 │ list · notes · done · export │ ◀── hello{targets} ─ │  ggTesthub.register(id,fn) │
 │                              │ ── go{id} ─────────▶ │  → fn() places the car     │
 │                              │ ── screenshot ─────▶ │  ggTesthub.onScreenshot(fn)│
 │                              │ ◀── png{dataUrl} ─── │                            │
 └──────────────────────────────┘   "gg-testhub"       └────────────────────────────┘
```

### 1. Hub page — repo `freaxnx01.github.io`, path `testhub/`

- Game picker: a list of game slugs. The hub fetches `/game-<slug>/test-todo.md`.
- Parser (pure module, node-tested): every `## ` heading is a block, every `- [ ] ` line under it is
  an item. Ticked items (`- [x]`) are skipped. Optional tag `{go: <id>}` anywhere in the item line,
  `<id>` = `[a-z0-9._-]+`. The tag is stripped from the displayed text. A block heading may carry a
  tag too; its items inherit it unless they have their own.
- Item key: `<game>|<block heading>|<item text without tag>`. Rewording an item makes it new on
  purpose (changed text = changed test).
- State in `localStorage` key `gg-testhub` (shared origin): per item key `{ status: open|noted|done,
  note, screenshots: [filename], sent: bool }`. Read/write wrapped in try/catch.
- UI (approved wireframe):

```
┌─ Testhub ─────────────────────────────── [rhyflitzer ▾] ─┐
│ ● Game connected (v0.9.0 · 14 targets)       [Copy all 3] │
│ Filter: (•) Open  ( ) Noted  ( ) Done   🔍 ______________ │
├───────────────────────────────────────────────────────────┤
│ ▾ Hideout in the Hübel (#102)                     2 / 8 ✓ │
│   ☐ Before the find: „Reservoir Hübel" is in J…   [Go ▸]  │
│   ☐ Inside: the tower reads as the Eiffel Tower…  [Go ▸]  │
│      ┌──────────────────────────────────────────────┐     │
│      │ Turm wirkt von unten zu dunkel_              │     │
│      └──────────────────────────────────────────────┘     │
│      [📷 fb-rhyflitzer-1011-3.png ✓]   [Save] [✓ Done]    │
│   ☐ F inside is refused with „No sky down here"   [Go ▸]  │
│ ▸ Pontoon bridge (#100)                           0 / 4   │
│ ▸ Südspange ESP Sisslerfeld (#42)                 0 / 5   │
└───────────────────────────────────────────────────────────┘
```

  - Status line: green when a game window answered `hello` (shows its version and target count); red
    otherwise, with a link that opens `/game-<slug>/?dev=1`.
  - **Go ▸** only when the item's tag is in the game's target list. An unknown tag shows greyed with
    its name (typos visible). No tag → no button.
  - Clicking an item opens the note field. **Save** → `noted`. **✓ Done** → `done`, with or without a
    note. **📷** asks the game for a screenshot (below).
  - Block progress `done / total`; fully done blocks start collapsed. Filter Open hides `done`.
  - Works as a narrow strip beside the game. UI strings de/en via `gg-lang`; item text stays as in
    `test-todo.md`.

### 2. Client — `freaxnx01.github.io/testhub/client.js`, one copy for all games

- A game loads it only in dev mode. Loader (3 lines, in the game's `index.html`):
  `?dev=1` sets `localStorage['gg-dev']='1'`, `?dev=0` clears it; when set, append
  `<script src="/testhub/client.js">`.
- API on `window.ggTesthub`:
  - `register(id, fn, label)` — a jump target; `fn()` puts the player there.
  - `onScreenshot(fn)` — `fn()` returns a PNG data URL (or a promise of one).
  - `setInfo({ game, version })`.
- Messages on `BroadcastChannel('gg-testhub')`, all plain JSON, validated on receipt (type and field
  shapes; unknown types ignored; never `eval`):
  - hub → game: `{type:'hello'}`, `{type:'go', id}`, `{type:'screenshot', req}`
  - game → hub: `{type:'hello', game, version, targets:[{id,label}]}` (also sent once on load),
    `{type:'png', req, dataUrl}` or `{type:'error', req, message}`
  - A `go` for an unknown id answers `error`.
- Several game windows: each answers with its `game`; the hub talks to the one matching the picker.

### 3. Rhyflitzer integration (delivers #248)

- Loader in `prototype/index.html`; `setInfo` with `VERSION`.
- Every **J** list entry registers as `j.<id>` automatically, using the same jump as **J**.
- Hidden spots register explicitly, placed where today's console shortcuts put the car, facing the
  object: `uw.boat`, `uw.car` (underwater wrecks, #101), `hideout.gate`, `hideout.tower` (#102/#201).
  Later features register their own (`pontoon.*`, …).
- A Testhub jump counts like a **J** jump: a race in progress is flagged, not counted.
- Screenshot: the code behind **X** (one frame without the HUD) returns the data URL instead of
  saving it.
- `test-todo.md`: the existing blocks get `{go: …}` tags once, by hand.

### 4. Feedback and export

- **📷**: the hub sends `screenshot`, receives the PNG and downloads it at once as
  `fb-<game>-<MMDD>-<n>.png`. The note records the file name. (Text in the clipboard cannot carry
  images; the files go along with the paste.)
- **Copy all N**: N = unsent notes plus unsent done marks. Copies one Markdown block:

```
Testhub feedback — rhyflitzer v0.9.0 — 2026-10-11
- [Hideout in the Hübel · "Inside: the tower reads as…" · go:hideout.tower] Turm wirkt von unten zu dunkel (📷 fb-rhyflitzer-1011-3.png)
- ✓ tested: [Pontoon bridge · "U again: the bridge disappears…"]
```

  then marks those entries `sent`. The format is `/processing-test-feedback`'s input (one raw note
  per line, mixed language fine); the `✓ tested` lines tell it which `test-todo.md` items to tick, so
  the repo stays the source of truth.

## Shared conventions (ai-instructions)

The browser-game stack overlay gets a short "Testhub" section: the loader snippet, `register` /
`onScreenshot`, and the rule that an agent writing a `test-todo.md` block after a merge tags each
item with `{go: <id>}` where a target exists (registering a new one if the feature adds a hidden
place). `/processing-test-feedback` learns to recognise the header line and the `✓ tested:` lines.

## Error handling

- `test-todo.md` missing or fetch fails → message in the list area; the hub still opens.
- No game window → red status; Go and 📷 disabled.
- Screenshot or go fails / no answer in 10 s → inline error on that item, nothing stored.
- `localStorage` unavailable → works for the session, warns that state will not persist.
- Clipboard API refused → show the block in a textarea, selected, to copy by hand.

## Testing

- Hub: node unit tests for the parser (blocks, ticked items, tags, inherited block tags, keys) and
  the export format.
- Rhyflitzer: node test that every J entry and the hidden spots are registered with valid ids.
- One Playwright test: hub and game in two pages of one browser context (shared `BroadcastChannel`),
  checking hello/status, Go places the car, 📷 yields a download, Copy all text.

## Work split

1. `freaxnx01.github.io`: hub page, parser, client.js, tests.
2. `game-rhyflitzer`: loader, registrations, screenshot hook, tags in `test-todo.md`; closes #248.
3. `ai-instructions`: stack overlay section; `/processing-test-feedback` (agent-workflow) format note.
4. Later, per game (own issues): Wipfelkratzer etc. loader + registrations.
5. Own issue: player-facing "What's new" list.
