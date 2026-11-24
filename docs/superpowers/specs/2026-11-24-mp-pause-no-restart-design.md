# #1180 - no "Restart race" in the pause menu during a multiplayer race

## Problem

In a multiplayer race the pause menu shows **Restart race**, although a restart would leave the shared start.

## Cause (confirmed by reading the code, no browser reproduction needed)

- `index.html:7268` (`netStartSession`) hides it once: `$('pauserestart').hidden = race;`.
- `index.html:7810` (`openPause`) re-sets every pause button on each open: `for (const id of PAUSE_ALL) $(id).hidden = !pauseIds().includes(id);`.
- `pauseIds()` (`index.html:7809`) takes `pauseButtonsFor(R.mode)` (`pause.js:13-16`). A multiplayer race runs as mode `trial` (`index.html:7265`, `startRace('trial')`), and `pauseButtonsFor` only drops `pauserestart` for `cruise` and `tutorial`. So the full menu comes back every time the menu opens, and the hide at 7268 is overwritten.
- In cruise multiplayer the button is already absent via `pauseButtonsFor('cruise')`.

## Design

A pure rule in `pause.js`: `withoutRestartInNetRace(ids, netRace)` drops `pauserestart` while a network race is running (`netRace` set and not `netRace.over`). `pauseIds()` applies it after the mode filter, so focus order (`movePauseFocus`, `index.html:7819`) and visibility (`openPause`) both follow. The one-shot hide at `index.html:7268` becomes redundant and is removed (`openPause` is the single owner). `NET.race.over` is set by `netApplyBoard` (`index.html:7185`).

## Acceptance criteria

- During a multiplayer race (grid to race over) the pause menu has no Restart race, for host and guest, and Tab/arrow focus skips it.
- Single-player trial/blitz/hunt/delivery menus still show it; cruise (incl. multiplayer cruise) and tutorial are unchanged.
- Rule is a pure function with a node test.

## Assumptions

- **A1** [confirmed] Hidden "During a multiplayer race, from the grid until the race is over" (as the issue states). Answer given to the enrich run; in cruise multiplayer it is already hidden by `pauseButtonsFor('cruise')`.
- **A2** [high] Fix in `pauseIds()` via a new pure function, not by changing `pauseButtonsFor`'s signature. Rejected: a `mode` value for net races. `index.html:7265` shows the race is plain `trial` mode, so mode cannot tell it apart.
- **A3** [high] "Race is over" = `NET.race.over` (`index.html:7185`); after it the menu may show Restart race again, as the issue literally says. Rejected: hide for the whole session (`NET.session`, `index.html:7808`).
- **A4** [high] Remove the redundant hide at `index.html:7268`; keep the reset at `index.html:7282` (harmless, the next `openPause` recomputes).

## Consequences

- After the result screen appears, a pause menu opened on it (if reachable) offers Restart race again; this follows A3.
