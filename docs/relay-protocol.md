# Relay protocol v1 — room codes for WebRTC handshakes

The wire contract between a browser game's `relayclient.js` and the small signaling
relay on VPS-DE (#1198). The relay lives in its **own repo**; this file is what it
implements against. The browser side is `relayclient.js` in this repo, copyable into
any `game-*` repo like `i18n.js`.

The relay only **forwards opaque strings** between the host of a room and its guests.
It never reads them, never stores them and never logs them. Game traffic does not pass
through it: once the WebRTC data channel is open, the peers talk directly.

## Transport

- One WebSocket per page: `wss://relay.freaxnx01.ch/` (the game keeps the URL in one
  constant).
- Every frame is one UTF-8 JSON object, text frame, at most **20,000 characters**.
  Binary frames, bigger frames and invalid JSON close the socket with code `1008`.
- Every frame carries `t` (its type). Unknown fields are ignored; unknown types get
  `error` `bad`.
- A socket is either one host or one guest, set by its first frame (`create` or
  `join`). Any other first frame gets `error` `bad` and the socket is closed.

## Room codes

- Form `PPP-NNNN`: a 3-letter upper-case prefix the game chooses (`RHY` for
  Rhyflitzer), a dash, 4 digits. Regex `^[A-Z]{3}-[0-9]{4}$`.
- Rooms are **namespaced per game**: the key is `<game>/<code>`, e.g.
  `rhyflitzer/RHY-4827`. The same code in two games is two rooms.
- The relay picks the digits at random among the codes free in that namespace.
- `game` matches `^[a-z0-9-]{1,32}$`.

## Client → relay

| Frame | Who | Meaning |
|---|---|---|
| `{"t":"create","v":1,"game":"rhyflitzer","prefix":"RHY","max":3}` | host | open a room for at most `max` guests (1..8, the relay caps at 8) |
| `{"t":"join","v":1,"game":"rhyflitzer","room":"RHY-4827"}` | guest | enter that room |
| `{"t":"signal","to":2,"data":"<string>"}` | both | forward `data` (string, 1..16,000 chars) to peer `to` |

A host addresses a guest by the guest's peer id; a guest always addresses the host as
`0`. A `signal` to a peer that is not in the room is dropped silently.

## Relay → client

| Frame | To | Meaning |
|---|---|---|
| `{"t":"created","room":"RHY-4827","ttl":3600}` | host | the room exists; `ttl` = seconds until it expires |
| `{"t":"joined","peer":2}` | guest | in the room; `peer` is this guest's id (1, 2, …, never reused within a room) |
| `{"t":"guest","peer":2}` | host | a guest joined |
| `{"t":"left","peer":2}` | host | that guest's socket closed |
| `{"t":"signal","from":0,"data":"<string>"}` | both | a forwarded `signal`; `from` = the sender's peer id (host = 0), set by the relay, never by the sender |
| `{"t":"closed"}` | guests | the host left; the relay then closes the socket |
| `{"t":"expired"}` | everyone | the room's time is up; the relay then closes the sockets |
| `{"t":"error","code":"<code>"}` | sender | see below |

Error codes: `bad` (malformed frame or wrong `v`), `no-room` (no such code in that
game), `full` (the room already has `max` guests), `rate` (rate limit hit), `taken`
(no free code left in that game's namespace). After `no-room`, `full`, `rate` and
`taken` the relay closes the socket.

## Lifetimes and limits

- A room lives while its host socket is open, at most **60 minutes** (`ttl`).
- The relay sends a WebSocket **ping every 30 s** (browsers answer it on their own), so
  proxies do not drop an idle host socket while the host waits in the lobby.
- Joining needs no host answer: the relay admits up to `max` guests and announces each.
- Rate limits per client IP (relay side, values are the relay's to tune): room creates,
  joins and frames per minute. Exceeding one gets `error` `rate`.
- The relay keeps no state beyond open rooms and logs no frame contents, no room codes
  joined to IPs.

## What the game puts in `data`

Opaque to the relay. Rhyflitzer sends exactly the strings of its manual code exchange
(`netcodec.js` `encodeCode`): the host's `R<v>H.…` offer to each guest, the guest's
`R<v>G.…` answer back, or the literal `full` when the host has no slot left. Each side
validates what arrives with `decodeCode` as if it had been pasted — the relay is
untrusted.

## Example

```text
host  → {"t":"create","v":1,"game":"rhyflitzer","prefix":"RHY","max":3}
host  ← {"t":"created","room":"RHY-4827","ttl":3600}
guest → {"t":"join","v":1,"game":"rhyflitzer","room":"RHY-4827"}
guest ← {"t":"joined","peer":1}
host  ← {"t":"guest","peer":1}
host  → {"t":"signal","to":1,"data":"R2H.…"}
guest ← {"t":"signal","from":0,"data":"R2H.…"}
guest → {"t":"signal","to":0,"data":"R2G.…"}
host  ← {"t":"signal","from":1,"data":"R2G.…"}
(WebRTC connects; the guest closes its socket)
host  ← {"t":"left","peer":1}
```
