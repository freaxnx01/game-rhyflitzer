# An invite link clicked while the game is open joins in the open tab (#1111) — design

## Intent

A friend sends an invite link (`#join=<code>`, #980). If the game is already open in a tab and the player clicks the link, the browser opens a **new tab** and the whole game loads again. A link *pasted* into the open tab already works (`hashchange` → `openJoinLink`, `index.html:7509-7517`). Goal: the new tab hands the code to the open tab, and the open tab shows the guest screen with the code filled in.

## Assumptions

- **A1** [confirmed] What the new tab does: "Übergeben + Hinweis". Maintainer answer: "the new tab hands the join code to the already open tab via BroadcastChannel and shows a notice 'Im anderen Tab beigetreten' (de) / English equivalent. No window.close() (a link-opened tab usually may not close itself). If no other tab answers, the new tab joins itself as today."
- **A2** [high] The transport is `BroadcastChannel` (same origin, same browser profile, no server), in line with the browser-game stack (no signaling server). Rejected: `localStorage` `storage` events (fire only on change, leave the code on disk) and `SharedWorker` (no benefit).
- **A3** [high] "The open tab accepts" means exactly the condition `openJoinLink` already uses: `linked && !REGION.generated && !NET.role` (`index.html:7514`). A tab that is hosting, already a guest, or on a generated region does **not** answer, so the new tab joins itself as today. Rejected: interrupting a running session.
- **A4** [high] Three messages, so two or more open tabs cannot both act: the new tab sends `offer`, each accepting tab answers `ready` with its own random tab id, the new tab sends `go` naming the first `ready` it saw, only that tab opens the guest screen. Rejected: a bare "taken" answer (every open tab would open the guest screen).
- **A5** [med] The new tab waits **500 ms** for a `ready`. If none comes it joins itself. `BroadcastChannel` delivery to a background tab is not timer-bound, so 500 ms should be enough; a miss only costs the old behaviour (a second tab joins). Alternative: 1000 ms (slower fall-back for a lone tab).
- **A6** [med] The handoff runs at the existing `openJoinLink()` call, after the game script has loaded in the new tab (`index.html:7516`), so the new tab still loads the game once before it hands over. Rejected for now: an early inline script in `<head>` that hands over and calls `window.stop()`; it would save the load but cannot be checked without a trial run, and module scripts may already be executing. Park as a follow-up if the load time bothers testers.
- **A7** [med] The notice in the new tab is the game's existing `toast()` with a long duration (no new DOM or CSS), and the new tab does not open a guest screen. The tab stays open and idle; the player closes it. Alternative: a full-page "continued in the other tab" overlay (needs new markup and styling).
- **A8** [high] The sender removes the `#join=` fragment at once, as today (`index.html:7513`), also on handoff, so a reload never re-offers the code.
- **A9** [high] The channel carries only the raw code string. The receiving tab runs the same path as a pasted link (`openMp(); netGuestRole(); $('mpin').value = code; $('mpmake').focus()`), so `decodeCode`, the region check (`netAskRegion`) and expiry stay the guest screen's job; nothing is trusted from the channel. The receiver validates the message shape (types, string ids, code a string of 1..4000 chars) and ignores anything else.
- **A10** [low] The open tab cannot focus itself (browsers forbid it), so after a handoff the player has to switch to it. The open tab additionally shows a toast "Einladung erhalten" / "Invitation received" so the arrival is visible when the player switches. Alternative: flash `document.title`; not done.

## Goals

1. New module `joinhandoff.js` (pure logic, `BroadcastChannel` injected so it runs under `node --test`): `offerJoin` for the new tab, `listenForJoin` for the open tab.
2. `index.html`: at load, `openJoinLink` first hands the code over; only when nobody takes it does the tab join itself. The open tab listens from boot.
3. Visible text in `strings.js`, de + en: `mpJoinedElsewhere` (en "Joined in your other tab", de "Im anderen Tab beigetreten"), `mpJoinReceived` (en "Invitation received", de "Einladung erhalten").
4. Same-tab paste (`hashchange`) works unchanged; the handoff runs only on the load call, not on `hashchange`.

## Non-goals

No `window.close()` (A1). No early exit before the game loads (A6). No change to the code format, `netcodec.js`, or the guest flow.

## Consequences

- The new tab still loads the whole game before it hands over; the player sees a loading tab for a few seconds, then the notice (A6).
- After a handoff the player has two tabs until one is closed.
- Two idle game tabs already open is possible: only one reacts (A4).
- A `BroadcastChannel` instance in the offering tab also receives from other instances in the same page, so the tab must ignore its own offer (handled in the plan).

## File overlap with the parallel enrich runs (#1110, #1119, #1115, #1112)

- `index.html`: this issue edits only the `openJoinLink` block (~7509-7517) plus the import line. #1110 (mode switch in the lobby) works in the same multiplayer lobby area (`openMp` and lobby handlers, ~6868-7500); a textual merge is likely fine, but land one first and rebase the other.
- `strings.js`: both add keys in the `mp*` block (en ~823, de ~1692). Append the new keys right after `mpMaking` to keep conflicts trivial; expect a trivial rebase conflict.
- `CHANGELOG.md`: every issue adds an `[Unreleased]` line; trivial rebase.
- #1119, #1115, #1112: no known overlap (not multiplayer join). If any touches `strings.js`, the same rebase note applies.
- No dependency on another issue's plan.

## Testing

- `tests/joinhandoff.test.mjs` (node): in-memory bus covering no answer, one answer, two answers (one wins), a refusing tab, malformed messages, own offer ignored.
- `tests/test_join_handoff.py` (Playwright): one browser **context**, two pages; `BroadcastChannel` does not cross contexts, so the existing `pair` fixture (separate contexts) does not fit.
- Manual: open the game, click an invite link from another app.
