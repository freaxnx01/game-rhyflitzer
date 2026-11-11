# Radio Argovia as a third live station (#845)

## Goal

The car radio (#735) has Rhyflitzer FM and SRF 3 live. Add **Radio Argovia** as a third station. Key 6 cycles fm -> srf3 -> argovia -> fm.

## Stream (probed 2026-11-10, see the issue)

`https://stream.streambase.ch/argovia/mp3-192/direct/` answers 302 to `chmedia.streamabc.net`, then 200 `audio/mpeg`, with `Access-Control-Allow-Origin: *` on both hops. The `<audio>` element feeds the WebAudio master, so CORS is required, and it is present. All hops are https (no mixed content).

## Design

- **One `LIVE` table in `radio.js`** instead of a second hard-coded `srf3` branch: `LIVE = { srf3: {url, nameKey, failKey}, argovia: {url, nameKey, failKey} }`. A station is live exactly when it is a key of `LIVE`. `STATIONS = ['fm', 'srf3', 'argovia']`.
- `nextStation(s)` (pure) replaces the inline `fm <-> srf3` toggle in `RADIO.cmd`.
- `displayFor` returns `LIVE[station].nameKey` for a live station. New string `radioStationArgovia` = "Radio Argovia" (de and en).
- The one live `<audio>` voice (`els.srf`) serves both live stations. `watch` records its `station`; when the station changes live -> live the stream is reloaded (stop, new src, new watchdog). The watchdog (`SRF_TIMEOUT`, `srfVerdict`) is unchanged and shared.
- Failure: `fail()` toasts `LIVE[station].failKey` (new `radioArgoviaFail`: "Radio Argovia is not reachable - back to Rhyflitzer FM"), stores `fm`, as for SRF 3.
- Pause/hold: `stopSrf()` already drops the stream; on release `apply()` reloads the live station. No change.
- `stationFrom` accepts `argovia` through `STATIONS`; no code change beyond the list.
- Strings: `keyRadioStation` names all three stations; new `creditArgovia` line in the credits next to `creditSrf3`.
- Tests stay hermetic: `tests/hermetic_api.py` also aborts the Argovia hosts, and a browser test stubs the stream with a local mp3.

## Assumptions

- **A1** [high] Generalised with one `LIVE` table and one shared live voice, not a second branch. Rejected: a second `argovia` voice/watch. `index.html:4143-4162` has one `srf` voice, one `watch`, one `playSrf`/`stopSrf`; a second copy would duplicate all of it.
- **A2** [med] Use the redirecting `/direct/` URL the issue probed, not `/mp3-192/`. Rejected: `/mp3-192/` (never probed for CORS or redirect behaviour; no dry runs). The browser follows the redirect and both hops carry CORS.
- **A3** [med] The internal names stay `srf` (`els.srf`, `playing.srf`, `src.srf` in `window.__mm.radio()`, `srfVerdict`, `SRF_TIMEOUT`). Rejected: renaming to `live`. It would touch `tests/test_radio.py` lines that #856 also edits, for no behaviour gain; a comment says the voice serves every live station.
- **A4** [med] The display text is exactly "Radio Argovia" in both languages (the issue's wording), without SRF's "live" suffix.
- **A5** [med] Also add a credit line `creditArgovia` (stream of Radio Argovia, played unchanged) beside `creditSrf3`, update `keyRadioStation`, and extend the hermetic abort list. None is named in the AC, but the SRF 3 precedent (`strings.js:430`, `tests/hermetic_api.py:12`) calls for each.

## Consequences

- Key 6 is now a three-step cycle: from SRF 3 a player lands on Argovia, not FM.
- A stored `argovia` on a machine where the stream is blocked falls back to FM with the toast on the first run, and the store is rewritten to `fm`.
- The game only relays the public stream unchanged (as for SRF 3); nothing is saved or re-hosted.
