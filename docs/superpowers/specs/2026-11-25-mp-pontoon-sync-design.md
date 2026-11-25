# One shared pontoon bridge in multiplayer (#1190)

## Problem

`PONTOON = { deck, error, group }` (`index.html:1443`) is local state: `pressPontoon` (`index.html:5852`) builds or removes the
deck and its meshes on this device only. `netcodec.js` has no message for it, so in a session a bridge laid by one player is
invisible and undrivable for the others.

## Design

1. **One message type, `pontoon`**, reliable channel, validated in `netcodec.js` (`VALIDATORS`, like `knock`, `netcodec.js:~145`):
   - `{ type:'pontoon', op:'lay', d }` guest -> host: the guest computed a crossing line (`crossingLine`) and asks to lay it.
   - `{ type:'pontoon', op:'take' }` guest -> host: toggle build/remove of the deck (what <kbd>U</kbd> does locally).
   - `{ type:'pontoon', op:'sync', d? }` host -> guests: the canonical state; `d` absent = no bridge.
2. **Wire deck `d`** carries only what `crossingLine` cannot be re-derived from: `a:[x,z]`, `b:[x,z]`, `h:[deckH,hNear,hFar]`,
   `r:[rampNear,rampFar]`, `built` 0..1, `dir` 1|-1, numbers rounded to 2 decimals. The receiver derives `len`, `ux`, `uz`,
   `nBays` (= `ceil(len / PONTOON_CFG.bay)`) and `hw` (= `PONTOON_CFG.hw`) itself, so they cannot disagree with `a`/`b`.
   `pontoon.js` gets pure `deckToWire(d)` and `deckFromWire(w)`.
3. **Validation (every inbound message).** All numbers finite; `a`,`b` within +-50000 m (as poses); `len` = |b-a| in (0, 600]
   (`maxWidth` 400 + `roadReach` 80 + aprons); heights in -1000..10000; ramps >= 0 and `rampNear + rampFar <= len + 0.01`;
   `built` in 0..1; `dir` is 1 or -1; `lay` needs `built === 0` and `dir === 1`; `take` carries no `d`. Anything else is `null`
   (counted in `NET.bad`). Unknown fields are dropped.
4. **Host authority.** The host holds the truth. A guest does not apply its own press; it waits for the host's `sync` (one round
   trip). Host `lay`: accepted only while the host has no deck (one at a time, as locally, `index.html:5852`), then the host
   builds it, and broadcasts `sync` to all guests, the sender included. Host `take`: accepted only while a deck exists, toggles it
   (`togglePontoon`), broadcasts `sync`. A refused or unknown request is dropped; the sender's next `sync` or none keeps its
   view true. A guest's own press on the host side (the host is also a player) goes the same way without the message hop.
5. **Rate limit (like #1179).** `pontoonAllowed(seen, slot, now)` in `netsync.js`, `PONTOON_GAP_MS = 250`: the host drops a
   second `lay`/`take` of the same slot within 250 ms (counted in `NET.bad`).
6. **Animation.** Each device runs its own `stepPontoonWorld` on the adopted deck (`built`/`dir`), so build and removal play for
   everyone (`index.html:5853`); `sync` is state, not a frame stream. Adopting a deck whose `a`/`b` differ from the current one
   rebuilds the meshes (`buildPontoonMeshes`), a `sync` with the same line only updates `built`/`dir`.
7. **Late joiners.** The host broadcasts `sync` (with `d` or without) in `netStartSession` (`index.html:7345`), right after the
   `start` message, so every guest starts a drive with the host's bridge, and a guest's own leftover bridge is replaced or
   cleared. Today nobody can join a drive that already runs (`admitHello`, `index.html:7082`, #916), so "joining later" means
   entering the lobby after the bridge was laid and starting the next drive. A helper `netSendPontoon(peerId)` serves both;
   it is also what a future lifting of #916 needs.
8. **Toast.** On adopting a `sync` that lays a bridge or flips its direction, every device shows the existing `pontoonBuilding` /
   `pontoonRemoving` toast. No new strings.
9. **Version.** `CODE_VERSION` is bumped by one: a build without the `pontoon` message would silently show a different world.

## Acceptance criteria

- A player lays a pontoon bridge with <kbd>U</kbd>; within about a second every other player sees it built (3 s animation) and
  can drive over it.
- Any player can remove it with <kbd>U</kbd> near the deck; it comes down for everyone.
- A second `lay` while a bridge exists changes nothing.
- A player starting a drive after the host laid a bridge sees it from the first frame; a guest's own old bridge is replaced.
- A forged `pontoon` (non-finite number, `len` > 600, `dir` 0, a `lay` with `built` > 0, a `sync` sent to the host) is refused and
  counted in `NET.bad`; a repeat within 250 ms is dropped.
- Single-player <kbd>U</kbd> behaves exactly as before. Page console stays empty.

## Out of scope

Syncing the bridge to a player who is not in the session. A map marker for a remote bridge (the map already draws `PONTOON.deck`,
`index.html:8375`, so it appears automatically). Ownership or limits per player.

## Assumptions

- **A1** [confirmed] Who may remove a bridge another player laid: "Jeder Spieler": one shared world, <kbd>U</kbd> toggles for
  everyone; no ownership logic.
- **A2** [confirmed] What a player joining a running session later sees: "Aktuellen Zustand": the host sends the current pontoon
  state on join, so all players have the same world.
- **A3** [high] Host-authoritative, as knock and race (`index.html:7063`). Rejected: peer-to-peer broadcast by each guest (two
  lay requests at once would build two different bridges; the topology is a star).
- **A4** [high] State-based `sync`, not an event per animation frame. Rejected: streaming `built` (needless traffic; `stepPontoon`
  is deterministic over 3 s, `pontoon.js:95`).
- **A5** [med] Geometry travels over the wire and is range-validated, rather than the receiver re-running `crossingLine` from a
  point. Rejected: sending only a start point (the sweep and road probes depend on each device's identical-but-heavy world
  queries, `index.html:5850`, and a mismatch would build different bridges).
- **A6** [med] A guest waits for the host's `sync` and does not build optimistically. Rejected: optimistic local build (needs a
  rollback when the host refuses a second `lay`).
- **A7** [med] "On join" is the start of a drive, because a running drive refuses joins (`index.html:7082`, #916). Rejected:
  lifting #916 here (a different feature).
- **A8** [med] The host does not check a guest's distance to the deck on `take`. Rejected: checking pose proximity (the pose track
  is delayed ~100 ms, <kbd>U</kbd> reach is 30 m, and "Jeder Spieler" was confirmed; the cost of a forged `take` is one bridge
  removed).
- **A9** [med] 250 ms same-slot gap for `lay`/`take`. Rejected: no limit (a toggle spam floods the star).
- **A10** [med] After a drive ends (back to the lobby or leave) each device keeps the bridge it has until the next `start` sync
  replaces it. Rejected: clearing on `netEndSession` (a bridge would vanish at pause-to-lobby for no reason; single-player after
  leaving keeps the local one as today).
- **A11** [confirmed] May a player remove the bridge while another car is driving on it? "Ja, mit Absicht": allowed on purpose, as
  fun. No occupancy check on `take`, neither on the host nor on the guest; the car on it falls into the water.

## Consequences

- In a race a bridge laid by the opponent is a shortcut for you too; driving over it marks your run "not counted"
  (`R.pontoon`, `index.html:6544`) as when you laid it yourself.
- A guest that presses <kbd>U</kbd> sees the bridge start about one round trip later.
- Leaving a session leaves the last synced bridge in the guest's single-player world.
- A car on the deck when it comes down (A11): removal runs `dir -1`, `built` shrinks, so `drivableLength` (`pontoon.js:79`) drops
  from the far end and `pontoonHit` (`pontoon.js:72`) returns null there, so `onBridge` (`index.html:1444`) no longer finds a deck.
  On the driver's own screen, over the river `waterLevelAt` (`index.html:1812`, no longer short-circuited by `onBridge`) is non-null
  and the car takes the existing water branch (`index.html:6273`): splash sound, sinks at `UW.sink` 3 m/s to the bed, "Sleep with
  the fishes!" toast after 0.35 s, then the hint "Drive up to the bank, or press R for the road" (`strings.js:236-237`). There is no
  automatic reset: the driver drives to the bank or presses R (`resetCar`, `index.html:5138`), as after any plunge into the Rhine.
  Over a ramp bay on land there is no water: the car drops to the terrain (`index.html:6274`). On every other screen the car is a
  remote mesh that only follows the driver's pose (`stepNetCars`, `index.html:7533`): it sinks and, after R, jumps back, as the pose
  says; remote cars never run the deck physics, so nothing hovers or freezes. No code change is needed for this.

## Overlaps

#1191 (knocked props sync) also adds a `VALIDATORS` entry in `netcodec.js` and bumps `CODE_VERSION`. The two land one after the
other; whichever lands second rebases its `CODE_VERSION` bump (+1 on top of the other's), and both sit as textual neighbours in
`netHostMessage`/`netGuestMessage` and `netStartSession`. The `pontoon` branch must not depend on #1191's code.
