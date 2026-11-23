# Hear the other player's horn and knocked-over props (#1112)

Does not touch `sound.js` (see Design 6), so no "Lands after #1130" ordering is needed; see Overlaps for the other collisions.

## Problem

In multiplayer the other player's horn and the props they knock over are silent. Poses carry lamps, visibility and nitro only
(`FLAG`, `netsync.js:19`; byte 32 bits 6-7 reserved, `netcodec.js:48`, refused on read `:76`). Knock sounds are played only on the
local device: `KNOCK = createKnock({... play: (sound, level) => SFX.knock(sound, level) ...})` (`index.html:2529`), the horn only
from the local key (`SFX.horn()`, `index.html:4742`, `:4819`).

## Design

1. **Horn = pose bit.** `FLAG.horn = 64` (bit 6 of byte 32). `encodePose` masks `flags & 0x7f`, `parsePose` refuses only bit 7
   (`flags & 0x80`). The sender keeps `HORN.until = performance.now() + VEH.sound.horn.dur * 1000` when it honks and `poseFlags()`
   (`index.html:7249`) ORs `FLAG.horn` while `now < HORN.until`. The bit is a level, not an event, so a lost unreliable pose still
   leaves the following ones carrying it.
2. **Remote horn.** In `stepNetCars` (`index.html:7385`), after the flames block: `horning = !!(pose.flags & FLAG.horn)`; on a rising
   edge (`horning && !entry.horning`) call the remote-horn player; store `entry.horning`. The preset is
   `VEHICLES[entry.car].sound.horn` when present, else the own `VEH.sound.horn`. It plays once for its full `dur` (what the sender
   hears), so a held key that re-fires locally is one remote honk.
3. **Knock = reliable event.** New JSON message `{ type: 'knock', s: <sound>, l: <level 0..1> }`, plus `id` (0..3) when relayed.
   `netcodec.js` gets a `knock` validator: `s` must be one of the sounds `soundPlan` knows (`knock.js:206`), `l` finite in 0..1,
   `id` absent or an integer 0..3. `knock.js` gains one optional dep `knocked(sound, level)`, called once per prop in `knock()`
   (`knock.js:355-365`, next to the first `play`), not for the secondary scrape/clink sounds. `index.html` passes
   `knocked: netSendKnock`. `netSendKnock` does nothing outside a session, drops a repeat of the same sound within 60 ms (a pile of
   bins is one message), and sends to the host (guest) or to every peer with `id: NET.you` (host).
4. **Relay.** `netHostMessage` handles `knock` from a guest: stamps `id` from `NET.slots` (never trusts one in the message, like
   `netPose`, `index.html:7283`), plays it locally and forwards to every other slot. `netGuestMessage` accepts `knock` only with an
   `id` that is another player of the lobby.
5. **Falloff.** Pure `hearGain(dist)` in `netsync.js`: 1 within `HEAR_NEAR = 12` m, 0 beyond `HEAR_FAR = 160` m, quadratic ease in
   between, 0 for a non-finite distance. Distance is from the player's car (`P.x, P.z`; on foot that is the walker) to the remote
   car's sampled position (`entry.mesh.position`). Both sounds play at the remote car's position, not the prop's: the message
   carries no coordinates, so there is nothing about the world to validate. A gain below 0.02 plays nothing.
6. **Playback, without touching `sound.js`.** Knock: `SFX.knock(s, l * g)` (`index.html:4809`; `soundPlan` clamps the level to 0..1
   and `SFX.knock` gates 40 ms per sound). Horn: new `SFX.hornAt(horn, g)` in the `SFX` object in `index.html`:
   `playHorn(a, a.master, { ...horn, gain: horn.gain * g }, a.currentTime)` with the same mute/hold guard as `horn()` (`:4819`).
   The falloff lives in `netsync.js` and the tone reuses `playHorn`, so `sound.js` stays unchanged.
7. **Test hook.** `window.__mm.netHeard()` returns `{ horn: n, knock: n, last: { kind, id, g } }`, counted where a remote sound is
   actually played (after the gain gate).

## Acceptance criteria

- While the other player honks within range, this device plays the horn once per honk; beyond 160 m nothing; the volume falls with
  distance.
- When the other player knocks over a hydrant, bin, bench, glass container etc. in range, this device plays that knock sound once
  per prop, quieter with distance, with the same `l` scaling as a local knock.
- Honks and knocks are heard through the host relay between two guests.
- The own horn and own knocks sound exactly as before; mute and menu holds silence remote sounds too.
- A pose with bit 7 set, a `knock` with an unknown sound, a bad level or a forged `id` is refused and counted in `NET.bad`.
- Page console stays empty.

## Out of scope

Nitro and crash sounds of the other car (decided, A1). Stereo panning. Remote engine sound. Direction markers on the map.

## Assumptions

- **A1** [confirmed] Which remote sounds: "Hupe + Umfahren": the horn (a bit in the pose record; byte 32 bits 6-7 are reserved, see
  FLAG in netsync.js) and knocked-over objects (an event), both played with distance falloff at the remote car's position. Not
  nitro, not crash.
- **A2** [high] Horn uses bit 6 of byte 32 (mask `0x7f`, refuse `0x80`) and leaves the record at 36 bytes. Rejected: a new record
  kind. `netcodec.js:48` and `:76` are the only places that enforce the reserved bits; `tests/netcodec.test.mjs:93` pins bit 6 as
  refused today and must flip to bit 7.
- **A3** [high] Knock rides the reliable channel, host-relayed with the id stamped by the host. Rejected: a pose-record field (no
  room: bytes 33-35 are the hit relay, `netcodec.js:50-54`) and a peer mesh (the topology is a star, relay at `index.html:7288-7291`).
- **A4** [med] Falloff constants: 12 m full, 160 m silent, quadratic ease. Rejected: inverse-square (needs a gain floor, loud at 1 m)
  and a Web Audio `PannerNode` (the game has no listener setup; `SFX` plays everything through `a.master`).
- **A5** [med] Sound is placed at the remote car, distance measured from the own car. Rejected: the prop's position (needs x/z in the
  message plus bounds validation) and the camera position (a far chase camera would mute a car right next to us).
- **A6** [med] One message per knocked prop, with a 60 ms same-sound gate on the sender. Rejected: one message per frame of contacts
  (spams the channel).
- **A7** [med] The remote horn fires on the rising edge of the pose bit and plays the full preset duration, using the sender's vehicle
  horn when known. Rejected: gating a held tone by the bit (the horn is a fixed-length one-shot locally, `playHorn`).
- **A8** [med] The knock hook is a new optional dep `knocked` in `createKnock`, so only primary knocks are sent. Rejected: filtering
  by sound name inside the existing `play` callback (secondary scrape/clink sounds share names with primary ones).
- **A9** [confirmed] Bump `CODE_VERSION` from 1 to 2 (`netcodec.js:5`). Maintainer's answer (2026-11-23): "CODE_VERSION
  erhöhen": an older build and a newer one then refuse each other's codes with the existing clear `version` error instead
  of a honking car freezing silently for the older peer. Cost accepted: codes in flight at the deploy become invalid.
  Rejected: no bump.

## Consequences

- A pile of bins knocked at speed is a burst of reliable messages, bounded by the 60 ms gate per sound.
- Remote knocks are not tied to remote world state: this device never sees the prop fall (each device simulates its own props), it
  only hears it. That matches the issue ("hear it").
- A holding honk key re-fires locally on key repeat; the remote device hears one honk per pose-bit rising edge.

## Overlaps

- `index.html`: #1130 edits `SFX.update` and the engine voices in the same `SFX` object (`:4781+`); this adds `hornAt` beside `horn`
  (`:4819`), a different region, trivial rebase. #1110, #1111 and #1119 likely touch `netMessage`/`netHostMessage`/`netGuestMessage`
  and the lobby area; the `knock` branch there is a textual neighbour. #1115 touches vehicle gating, not these functions.
- `netcodec.js`: `encodePose` was just changed by PR#1147 (angle wrap). This change touches only the `flags` line and `parsePose`'s
  reserved check; rebase on `main` first. `VALIDATORS` may also gain entries from #1110/#1111/#1119.
- `netsync.js`: additions only (`FLAG.horn`, `hearGain`). `sound.js`: untouched, no #1130 dependency. `knock.js`: one new dep
  callback.
