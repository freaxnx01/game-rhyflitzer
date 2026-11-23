# Switch the game mode without leaving the multiplayer session (#1110)

## Problem

In a multiplayer session the players want to go from cruising to a race (or back) without
everyone connecting again. Today the only way out of a running session is **Main menu**, and
`toMainMenu` calls `netLeave()` when `NET.session` is set (`index.html:7726`), which sends `bye`
and closes every link (`index.html:7457-7468`). Everybody has to swap codes again.

The building blocks already exist:

- The lobby already offers both session modes to the host: **Drive together** (`#mpgo`, cruise)
  and **Start race** (`#mprace`) (`index.html:968-969`, wired at `index.html:7491-7497`). They
  show whenever `NET.session` is false (`index.html:7051-7055`). `START_MODES` stays
  `['cruise', 'race']` (`netcodec.js:18`).
- `#837 part d` added a host-only **Back to lobby** path: the host broadcasts `{ type: 'back' }`
  and calls `netBackToLobby()`; guests do the same on receipt (`index.html:7005`, `7447-7455`,
  `7499`). The link, the clock and the lobby survive; the session ends.
- But **Back to lobby** (`#mpback`) only shows on the race result (`index.html:7187`). During a
  cruise, or during a race still running, there is no way back to the lobby.

## Design

Give the host a **Change mode** button in the pause menu while a session runs. It does exactly
what `#mpback` does: broadcast `back`, then `netBackToLobby()`. Everyone lands in the lobby with
the link intact; the host picks **Drive together** or **Start race** there, as for the first start.

1. **Pause menu button** `#pauselobby` (label key `pauseMpMode`, en "Change mode (lobby)",
   de "Modus wechseln (Lobby)"), placed just before **Main menu**. Shown only to the host while
   `NET.session` is true. Click: `netHostToLobby()` = `NET.link.broadcast({ type: 'back' });
   netBackToLobby();` — the same two calls `#mpback` makes, so `#mpback` uses the helper too.
2. **Pure rule in `pause.js`**: `withLobbyButton(ids)` returns `ids` with `'pauselobby'` inserted
   before `'pausemenu'` (unchanged when `'pausemenu'` is absent, e.g. the tutorial). `pauseIds()`
   in `index.html` applies it when `NET.role === 'H' && NET.session`. `PAUSE_ALL` gains
   `'pauselobby'` so `openPause` hides it everywhere else.
3. **`netBackToLobby()` closes the run first**, on host and guest alike, because now it can
   arrive mid-drive: it closes an open timetable / About / Settings dialog and the pause menu
   (`closeTimetable(); closeAbout(); closeSettings(); closePause();` — each is a no-op when not
   open; `closePause` also undoes an open vehicle swap and hides the abandon question), and if
   `R.state` is `'armed'` or `'racing'` it records `trackModeEnd('abandoned')` and sets
   `R.state = 'ready'`, as `toMainMenu` does. After a finished race (`R.state === 'finished'`)
   nothing changes from today.
4. No new network message, no codec change: `back` already exists and is already parsed.

### Acceptance criteria

- During a shared cruise, the host's pause menu shows **Change mode (lobby)**; the guest's does not.
- Pressing it puts host and guest in the lobby, `NET.session` false on both, the link still open
  (`__mm.net().peers` unchanged), no reconnect.
- In the lobby the host sees **Drive together** and **Start race**; after both are ready again,
  **Start race** starts a race on both pages.
- Pressing it during a running race ends the race for everyone and opens the lobby.
- A guest whose pause menu (or About / Settings / Timetable from it) is open when the host
  switches ends up in the lobby with no dialog left over the road.
- The guest's **Main menu** still leaves the session (unchanged).
- `node --test tests/*.test.mjs` passes; the new Playwright test passes; no page errors.

## Assumptions

- **A1** [confirmed] Only the host switches the mode, in the lobby. Answer: „Nur Host, in der
  Lobby": the host picks the next mode in the lobby, all guests follow automatically
  (host-authoritative; fits the existing `back` path of #837).
- **A2** [high] Reuse the `back` message and `netBackToLobby()` unchanged on the wire.
  Rejected: a new `mode` message that switches cruise ↔ race directly from the pause menu. A1
  puts the choice in the lobby, and the lobby already has both mode buttons
  (`index.html:7051-7055`).
- **A3** [confirmed: "Ja, alle bestätigen neu", maintainer 2026-11-23] Going back to the lobby clears every ready flag, as `netBackToLobby` does today
  (`index.html:7449-7452`), so each guest presses **Ready** once before the host can start the
  new mode. Rejected: keep the ready flags on a mode switch so the host can start at once — it
  needs a second back path and departs from #837 part d's "everyone confirms a new start".
- **A4** [med] No confirmation when the host switches during a running race; the race simply
  ends for everyone. Rejected: route it through the abandon question (`#abandon`), whose OK is
  hard-wired to `toMainMenu` (`index.html:7736`). The button text already says what happens.
- **A5** [med] New label "Change mode (lobby)" / „Modus wechseln (Lobby)" (key `pauseMpMode`),
  not the existing `mpBackLobby` "Back to lobby" string. Rejected: reusing `mpBackLobby` —
  the issue asks for a mode switch, and "back to lobby" from the road does not say that.
- **A6** [high] Only `cruise` and `race` stay session modes. Rejected: more modes (hunt, blitz)
  in multiplayer — out of scope; the issue names only the existing two (`netcodec.js:18`).
- **A7** [high] Guests get no new button; their **Main menu** still leaves the session
  (`index.html:7726`), per A1.

## Consequences

- A guest mid-drive is pulled into the lobby without warning when the host switches; the lobby
  itself is the feedback.
- Analytics: a switch from cruise or a running race logs a `mode-end` with outcome `abandoned`
  for every player, the same as **Main menu** does today.
- `#mpback` on the race result now goes through the same `netBackToLobby`, which additionally
  closes dialogs; with `R.state === 'finished'` the run state is untouched, so its behaviour is
  unchanged.

## Discovered, out of scope (not fixed here)

- `openPause` re-shows **Restart race** in a multiplayer race: `netStartSession` hides
  `#pauserestart` (`index.html:7229`), but `openPause` resets every `PAUSE_ALL` button from
  `pauseIds()` (`index.html:7722`), and `pauseButtonsFor('trial')` includes it. Worth its own issue.

## File overlap with issues enriched in parallel

| File | #1110 | Likely also touched by |
|---|---|---|
| `index.html` (pause markup, `pauseIds`, `netBackToLobby`, `#mpback` wiring) | yes | #1119, #1115, #1112, #1111 |
| `strings.js` (one new key, en + de) | yes | #1119, #1111, possibly #1112 |
| `pause.js`, `tests/pause.test.mjs` | yes | possibly #1115 (if the heli lock touches the pause menu) |
| `CHANGELOG.md` | yes | all |
| `netcodec.js` | **no** | #1112 (new message types) |

No dependency on another plan; conflicts would be textual only (different functions in
`index.html`, different keys in `strings.js`).
