# Multiplayer connect: guest deadline, 10-minute codes, join link (#980)

## Goal

Two devices on the same Wi-Fi connect without a race against the clock. Today the guest gives up 20 s after it made its
answer code, while the player is still carrying that code to the host. The flow should also be shorter: the host sends one
link instead of a code, like Tschau Sepp.

## Today

- `guestAnswer()` (`netlink.js:102-114`) calls `armConnectDeadline(HOST_ID, entry)` right after the answer SDP exists. The
  deadline is `CONNECT_MS = 20000` (`netlink.js:13`); it reports `'timeout'` and closes the peer (`netlink.js:49-55`).
  `netPeerState` turns `'timeout'` into `mpIceFail`, the NAT/Wi-Fi message (`index.html:6286`), which is wrong here.
- `hostAccept()` (`netlink.js:92-99`) clears the timers and arms the same 20 s deadline. That is right: the host's clock
  starts when it has the answer.
- The host's slot is reclaimed after `CODE_TTL` seconds (`netlink.js:87`); `CODE_TTL = 300` (`netcodec.js:6`), pinned by
  `tests/netcodec.test.mjs:28` (expiry edges at `:29`). Text says "five minutes": `strings.js:745` and `:1507`, comments at
  `netcodec.js:6`, `index.html:845`, `:6140`, `:6200`.
- The join screen already survives a region switch: `netAskRegion` (`index.html:6228`) shows `#mpregion`; its click handler
  parks the pasted code in `sessionStorage[MP_JOIN_KEY]` and reloads (`:6551`); the load block at `:6560-6564` reopens the
  guest screen with the code filled in. This path is complete, not truncated.
- Tschau Sepp: `joinLinkFor`, `readJoinLink`, `copyJoinLink` (`game-tschau-sepp/index.html:1846-1870`): link
  `<origin><path>#join=<encoded code>`, fragment removed with `history.replaceState`, connect only after the player's click.

## Decisions

| Topic | Decision |
|---|---|
| Guest deadline | The 20 s guest deadline is gone. The guest keeps its connection open while its answer code is in transit. |
| Guest give-up | A guest timer of `CODE_TTL` seconds after the answer reports `'timeout'` and closes the peer, but only while `connectionState === 'new'` (the host never took the answer). Once ICE has started it does nothing. |
| Guest failure | `connectionState === 'failed'` before any lobby arrived shows `mpIceFail` and keeps the dialog open (today it leaves with "Lost the connection to the host"). A guest timeout shows a new `mpAnswerUnused` text. |
| Host deadline | Unchanged: 20 s from `hostAccept`. |
| Code lifetime | `CODE_TTL = 600`. Countdown, expiry check and slot reclaim follow from the constant; "five minutes" texts become "ten minutes". `CODE_SKEW` unchanged. |
| Join link | Host side gets a second button `#mpcopylink` ("Copy invite link") next to Copy; it copies `origin + pathname + '#join=' + encodeURIComponent(code)` (no query, the code carries the region). The guest's answer code gets no link button. |
| Reading the link | Pure `joinLinkFor` / `readJoinHash` in `netcodec.js`. At load, a `#join=` fragment is read, removed with `history.replaceState(null, '', pathname + search)`, and the guest screen opens with the code filled in and focus on "Create answer code". Nothing connects before that click. |
| Region | The link flow does not duplicate region handling: the click on "Create answer code" runs `netGuestAnswer`, which calls `netAskRegion` on a mismatch, then the existing park-and-reload path. Two clicks in the rare cross-region case. |
| Generated worlds | `REGION.generated` hides the Multiplayer button; a join link there only clears the fragment. |

## Out of scope

- No ICE restart, no TURN, no change to the code format or `CODE_VERSION`.
- No QR code, no host-side countdown change beyond the constant.

## Risk

The fix assumes the guest's ICE agent does not reach `'failed'` while the host has not yet pasted the answer. Tschau Sepp
relies on the same assumption, but this repo has no evidence. The acceptance run on two real devices decides; if the guest
fails early, the follow-up is a different handshake, not a longer timer.
