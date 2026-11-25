# Knocked-over props fall for the other players too (#1191)

Follow-up from #1112 (remote knock sound) and #1179 (host knock gate). In scope: a prop one player knocks over also falls over, and later stands up again, on every other device in the session. Everything else found along the way gets written down, not acted on.

## Problem

`knock.js` state is local. Since #1112 the `knock` message carries only the sound and its level (`netcodec.js` `knock` validator), so the other players hear the bin go over at the remote car's position, but on their screens the bin keeps standing.

## Design

### Wire: the `knock` message grows three optional fields

`{ type: 'knock', s, l, id?, k?, i?, a? }`

- `k`: the prop kind, one of `KNOCKABLE` (`knock.js`), and `KINDS[k].sound === s` (a lamp's knock is always `'lamp'`).
- `i`: the prop's index in its kind's group list, an integer `0..65535`.
- `a`: the direction the knocking car drove, `Math.atan2(vz, vx)` in radians, finite and `|a| <= PI`.
- `k`, `i`, `a` come all three or not at all. A knock without them stays valid and means "sound only" (the #1112 test hook `__mm.netKnock(s, l)` keeps using it).
- `CODE_VERSION` goes 2 → 3, so a build that would ignore the new fields cannot join a newer one.

### Prop identity

A prop is `(kind, index)`: `createKnock` builds `all` per kind from `groups[kind].list` in list order (`knock.js`, `createKnock`, the `for (const kind of KNOCKABLE)` loop), and `a.i` is that index. `propMeshes` (`index.html:2572-2597`) fills the lists from the world file's `L.props` plus the deterministic `yardProps()` (`crashyard.js:23`), and drops `modern` props once at build time regardless of the era (`index.html:2574`). Same build (code version) and same region (the lobby) means the same lists on every device.

On receipt the prop must exist locally: `byKind[k][i]` defined. Otherwise the fall is ignored (the sound still plays).

### knock.js

- New pure helpers, exported and node-tested:
  - `fallAction(kind)`: `'bend'` for a lamp, `'fly'` otherwise. A remote knock is already a confirmed knock, so no speed threshold is re-checked.
  - `remoteSpeed(level)`: the inverse of `soundLevel` (`(level - 0.3) * 22`), clamped to `3 .. 15.4` m/s.
  - `remoteCar(angle, level)`: `{ vx, vz }` of a car driving at `remoteSpeed(level)` in direction `angle`; what `launch` and the bend read.
- `createKnock` splits `knock()` into `topple(a, action, c)` (body or bend, collider off, fountain, clothes, poo, `active.push`) and the local `knock()` (topple + count + `play` + hiss + `knocked`).
- The `knocked` callback gets a third argument `{ k: a.kind, i: a.i, a: Math.atan2(c.vz, c.vx) }`.
- New `knockRemote(kind, i, angle, level)`: returns `false` if the prop does not exist or is already down (`a.hit`); otherwise marks it `a.remote = true`, topples it with `remoteCar(angle, level)` and returns `true`. No sound, no count, no `knocked` echo.
- A remote prop's bounce sounds in `animate` are skipped; its hydrant fountain sprays without the hiss. `restore` clears `a.remote`.
- Restore is unchanged: each device stands the prop up by its own `restoreDue(age, distance to its own car)`.
- `debug()` gains `remote` (active remote props); new `hit(kind, i)` knocks a prop through the local path (test hook).

### index.html

- `netSendKnock(s, l, prop)`: with a prop, the 60 ms per-sound sender gate is skipped (each prop is knocked once until it stands again) and `k, i, a` go into the message.
- New `netFallKnock(msg)`: `if (msg.k !== undefined && KNOCK) KNOCK.knockRemote(msg.k, msg.i, msg.a, msg.l)`. Called before `netHearKnock` on the host and on the guest, so the fall happens whatever the hearing distance.
- Host branch: the #1179 gate `knockAllowed` is keyed by `k + '#' + i` when a prop is carried, else by the sound as before; the relayed message carries `k, i, a` plus the stamped `id`. The host relays even when its own copy is already down.
- Test hook `__mm.knockHit()`: knocks the first standing non-lamp prop locally and returns `{ k, i }`.

### netsync.js

`knockAllowed(seen, slot, key, now)`: the third parameter is renamed `sound` → `key` and the comment says it is a sound or a `kind#index`. No logic change, no second limiter.

## Acceptance criteria

- When a player knocks a prop over, every other player in the session sees the same prop fall over in the same direction, animated on their own device.
- A lamp bends over on the other screens, all other kinds fly and tumble; clothes, poo and the hydrant fountain appear there too.
- A remote-knocked prop stands up again on each device by that device's own restore rule (60 s and the own car more than 70 m away).
- A remote knock does not raise the receiver's "umgefahren" counter, and makes no local bounce or hiss sounds; the knock sound itself is still the #1112 distance-scaled one.
- A remote knock of a prop already down locally, or of a prop index that does not exist, changes nothing.
- Every prop of a pile reaches the others: neither the sender gate nor the host gate drops a second, different prop.
- `parseMessage` refuses: an unknown `k`, a `k` whose sound is not `s`, a non-integer or out-of-range `i`, a non-finite or `|a| > PI` `a`, and a message carrying only some of `k, i, a`.
- Connection codes start with `R3`.
- Node tests for the knock.js helpers and the codec pass; the full `node --test` suite stays green; the new Playwright test in `tests/test_multiplayer_cruise.py` passes both directions (host → guest, guest → host).

## Assumptions

- **A1** [high] Each device animates the fall itself from "which prop, which direction" and restores it on its own timer. [confirmed] Answer: "Lokal umfallen lassen": send only which prop falls and in which direction; each device animates the fall and restores the prop itself on its own timer. Not a physics/impulse sync, not an end-state-only snap.
- **A2** [high] A prop is named by kind + index within its kind's list (`a.i`). Rejected: a global index into `all` (no kind cross-check) and a position fingerprint (unneeded: same build via the code version, same region via the lobby). `knock.js` `createKnock` builds `all` from `groups[kind].list` in order; `index.html:2572-2597` fills those lists deterministically from `L.props` and `yardProps()` (`crashyard.js:23`).
- **A3** [high] Direction is the knocking car's heading of travel `atan2(vz, vx)`; the throw speed is derived from the level `l` the message already carries (inverse of `soundLevel`, `knock.js`). Rejected: a separate speed or impulse field, which the confirmed answer excludes. `launch` and the bend read only `car.vx/vz` (`knock.js` `launch`, `knock()`).
- **A4** [high] The existing `knock` message is extended with optional `k, i, a`; a prop-less knock stays a valid sound-only message. Rejected: a new message type, which would duplicate the sound path and the #1179 gate. `netcodec.js` `knock` validator.
- **A5** [med] The host's #1179 gate is keyed by `kind#index` for a prop-bearing knock instead of by sound; same function, parameter renamed `key`. Rejected: keeping the sound key (the second bin of a pile hit in one frame would be dropped and stay standing for the others) and a second limiter (the brief forbids it). `index.html:7069`, `netsync.js` `knockAllowed`.
- **A6** [med] The sender's 60 ms per-sound gate (`knockSentAt`, `index.html:7528`) is skipped for prop-bearing knocks. Rejected: keeping it, for the same pile reason; a prop is knocked at most once until it stands again (`if (a.hit) continue` in `step()`), so the sender cannot repeat one.
- **A7** [med] A remote-knocked prop makes no local sound of its own: no bounce clinks, no hydrant hiss. The primary knock remains `netHearKnock`'s distance-scaled sound (`index.html:7521`). Rejected: playing them through `play`/`hiss`, which are full-volume and would make a bin knocked a kilometre away clink at your ear.
- **A8** [high] A remote knock does not count towards the receiver's "umgefahren" HUD row, which counts the player's own knocks (`index.html:2531`, `onCount`).
- **A9** [high] The fall is applied before and independent of the hearing gain cut-off (`netHearKnock` returns early below 0.02, `index.html:7521`): a prop far away still falls.
- **A10** [high] A remote knock for a prop already down locally is ignored, as the local hit test already does (`if (a.hit) continue`, `knock.js` `step()`).
- **A11** [med] `CODE_VERSION` 2 → 3 although the new fields are optional. Rejected: no bump, which lets an old build join and silently keep the props standing, the very bug. `netcodec.js:7`. #1190 (pontoon sync) is enriched in parallel and also bumps `CODE_VERSION`: the two land one after the other, and the later one rebases onto the other's bump (3 → 4) and updates the `R<n>` literals in its tests.
- **A12** [high] The host applies a guest's knock locally and relays it whatever its own copy's state; each device decides for itself whether the prop is standing. Restore timers differ per device, so the host's state is no authority.

## Consequences

- Props are not in lockstep: each device rolls its own random spin and side kick, so the bin lands in a slightly different spot on each screen, and stands up again at a different moment (each device's own car distance).
- A prop standing again on one screen but still lying on another: a new knock of it shows only where it stands; the sound plays everywhere.
- The throw strength saturates where `soundLevel` does (about 55 km/h): a faster car's knock throws a bit less far on the other screens.
- One reliable message per knocked prop instead of at most one per sound per 60 ms; a bus through a row of bins sends one per bin.
- A modified client can name many different props in a burst; each falls at most once per device until it stands again. Traffic only, no state outside the props.
- The "Set up props" button (`#knockreset`) still resets only the own device.
