# Multiplayer part 1: connect and lobby (#834)

**Status:** quick-enriched 2026-11-10 from the approved epic spec
[`2026-11-10-multiplayer-race-design.md`](2026-11-10-multiplayer-race-design.md) (sections *netcodec*, *netlink*,
*Player flow* 1–3, *Failure handling*). That spec stays the source of truth; this file only pins the part-1 details it
leaves open. Nothing from parts 2–4 (#835 poses, #836 collisions, #837 race rules) is in scope.

## Pinned details

- **Code payload.** `R1H.` / `R1G.` + base64url(deflate-raw(JSON)). Host: `{ t, g, s }` (t = Unix seconds when made,
  g = region id, s = SDP). Guest: `{ t, s }`. `decodeCode(code, expectRole, nowSec)` returns `{ ok: true, t, g?, sdp }`
  or `{ ok: false, error }` with `error ∈ format | version | role | expired | size`. Expired = older than 300 s
  (or more than 60 s in the future: clock skew). Codes over 16 000 chars are `size`.
- **Region.** The lobby's region is the region the host has loaded (a region switch reloads the page, which would drop
  every connection). The host code carries it. A guest whose page shows another region keeps the code in
  `sessionStorage` (`mm.mpJoin`), reloads with `?region=<g>` and the join screen reopens with the code filled in.
  Custom worlds (`?world=`) hide the multiplayer button.
- **Reliable messages (part 1 only):** `hello {name}`, `lobby {you, region, cls, players[]}`, `pick {car, paint}`,
  `ready {on}`, `deny {reason}`, `bye`. JSON, ≤ 4096 chars. `parseMessage(raw, ctx)` returns the normalised message or
  `null`; ctx carries the valid car, paint and region ids. `pose`, `start`, `cp`, `finish`, `result` arrive with their
  own parts. Both channels (`pose` unreliable, `ev` reliable) are opened in part 1 so part 2 only adds traffic.
- **Lobby state** lives in a pure `netrace.js` (the lobby state of the epic's state machine; part 4 adds the rest):
  `createLobby`, `addPlayer` (max 4), `removePlayer`, `setClass` (clears cars that no longer fit and their ready flag),
  `pickCar` (refused with `class` when `powerClass(def)` ≠ class), `setReady` (only with a car), `canStart`
  (≥ 2 players, all ready), `lobbyMessage`. The host owns the state and broadcasts `lobby` after each change.
- **Car pick** reuses the existing car picker: opened from the lobby it only cycles cars that fit the class, and its
  primary button reads "Übernehmen" and sends `pick` instead of starting a race.
- **Names** ≤ 24 chars, trimmed, control characters removed, rendered with `textContent`. Kept in `localStorage`
  (`mm.mpName`).
- **No race start in part 1.** The lobby shows each player's name, car, class and ready flag and "Alle bereit" when
  `canStart`; the start button arrives with #837.
- **Failures in part 1:** guest drops → removed from the lobby; host drops → guests see "Verbindung zum Host verloren"
  and return to the start screen; no connection 20 s after the answer is pasted → the NAT/Wi-Fi error text; invalid
  messages dropped and counted (`__mm.net().bad`).
- **Test hook:** `?netice=none` makes `netlink` use no STUN servers (loopback test, no internet).
