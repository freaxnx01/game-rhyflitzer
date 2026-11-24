# Host rate-limits relayed knock messages (#1179)

Follow-up from PR#1176 (#1112). In scope: the host-side gate on a guest's `knock` message. Everything else found along the way gets written down, not acted on.

## Problem

`netHostMessage` (`index.html:6982`) plays a guest's `knock` on the host and relays it to every other peer. Only the sender throttles (`netSendKnock`, 60 ms per sound, `index.html:7441`). A modified client skips that and floods every player with knock sounds.

## Design

- New pure function in `netsync.js`, next to `hearGain`: `knockAllowed(seen, slot, sound, now)` and the constant `KNOCK_GAP_MS = 60`.
  - `seen` is a plain object owned by the caller; the function reads and records `seen[slot + ':' + sound]`.
  - Returns `true` and records `now` if at least `KNOCK_GAP_MS` has passed since the last accepted knock of that slot and sound (or there was none); otherwise `false`, nothing recorded.
  - Non-finite `now` returns `false`.
- `index.html`: `let knockSeen = {}` beside `knockSentAt`. In the `knock` branch of `netHostMessage`, before `netHearKnock`: `if (!knockAllowed(knockSeen, id, msg.s, performance.now())) { NET.bad++; return; }`. A dropped knock is neither played on the host nor relayed.
- `netEndSession` resets `knockSeen = {}` next to `knockSentAt = {}`.
- Guests do not gate: a guest receives knocks only from the host, which now limits them.
- The host's own knocks go through `netSendKnock` and its sender gate; unchanged.

## Acceptance criteria

- A guest knock arriving less than 60 ms after an accepted knock of the same slot and sound is dropped: not played on the host, not relayed, `NET.bad` incremented.
- Different sounds from one slot, and the same sound from different slots, are gated independently.
- A knock at 60 ms or later is accepted and relayed as before.
- A fresh session starts with empty gates.
- Node tests for `knockAllowed` pass; existing netsync and netcodec tests stay green.

## Assumptions

- **A1** [high] Per sending slot and sound, the same 60 ms gate the sender uses; excess messages are dropped (neither played on the host nor relayed) and counted in NET.bad. [confirmed] Answer: "Per sending slot and sound, the same 60 ms gate the sender uses; excess messages are dropped (neither played on the host nor relayed) and counted in NET.bad" (as the issue states).
- **A2** [high] The gate is a pure function in `netsync.js` with a caller-owned state object, mirroring how `knockSentAt` is a plain object. Rejected: inline code in `index.html`, which the node test runner cannot import. `netsync.js:24-30` shows pure helpers already live beside `hearGain`.
- **A3** [high] The gate key is the host-stamped slot id (`NET.slots.get(peerId)`), never an id from the message. `index.html:6982` already stamps it that way.
- **A4** [high] The clock is `performance.now()`, as in `netSendKnock` (`index.html:7441`). Rejected: `Date.now()`, which can jump.
- **A5** [high] The gate runs after the existing `parseMessage` validation, so an invalid knock still counts in `NET.bad` once via `netMessage` (`index.html:6973`), a rate-limited one once via the new branch. No new message type, no wire change.

## Consequences

- An honest guest never sends two knocks of one sound within 60 ms (the sender gate enforces it), so it loses nothing. Network jitter can bunch two messages closer than 60 ms on arrival; the later one is dropped, an inaudible loss at this gap.
- `NET.bad` can now rise from a modified client's flood; it only counts, nothing disconnects.
