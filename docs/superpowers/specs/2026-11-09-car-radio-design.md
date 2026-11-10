# Car radio and menu music (#735, #549 merged) — design

Date: 2026-11-09 · Issue: #735 · Enriched with `/enrich --quick` (no interview; decisions are in the issue's Assumptions)

## Goal

While playing, music works like a **car radio**: on/off, previous/next track, volume and a station switch, all usable
without stopping and without opening the pause menu. Two stations:

1. **Rhyflitzer FM** (default): a playlist of the four tracks without Content ID, committed under `assets/music/`.
2. **SRF 3 live**: `https://stream.srg-ssr.ch/srgssr/srf3/mp3/128`, played unchanged, with a fallback to Rhyflitzer FM.

The start screen plays quiet **menu music** (Menu / Running Title). It can always be switched off and never loads
before the game has finished loading. All music is credited in About → Credits.

## UI decision (maintainer, 2026-11-09)

The HUD is already full, so the radio gets **no permanent widget**.

- **Desktop:** keys only. Any change (on/off, station, track, volume) shows a transient **radio display** for 3 s in the
  existing `#toast` slot (`index.html:367`), styled with a `radio` class as a small dark plate. Then it fades out
  through the existing toast timer (`fadeToast`, `index.html:5044`).
- **Touch (`pointer:coarse`):** one small **📻 button `#radiobtn`** beside `#pausebtn` (`index.html:451`, CSS
  `index.html:279`). It opens a compact panel `#radiopanel` with on/off, ◀ ▶, station and volume − +.

## Existing key bindings (surveyed 2026-11-09, every `*.js` + `index.html`)

The game lives at the repo root since #577. `prototype/index.html` is only a redirect (`prototype/index.html:1-15`).

| Key | Bound to | Where |
|---|---|---|
| W A S D, arrows | drive / walk / fly / train | `controls.js:7`, `train.js:198` |
| Space, Shift, Ctrl, N | drive/jump, nitro/sink, handbrake, nitro | `controls.js:17-22`, `controls.js:36-37` |
| Z, J, C, F1, `?` | get out/in, jump-to, camera, help | `controls.js:13-15`, `index.html:3865` |
| B, Tab | look back, full map | `controls.js:24-25` |
| Comma, Period | turn signals | `controls.js:26`, `index.html:3865` |
| L, H/Enter, O, I, F, U, V, G, Y, K, R, T, X | lights, horn, autopilot, navi, heli, pontoon, hide car, bounds, borders, trip, reset, style, photo | `controls.js:27-29`, `index.html:3865` |
| **M** | **global mute** (`SFX.toggle`) | `controls.js:29`, `index.html:3865` |
| Esc, P (Ctrl+P = command search) | pause | `pause.js:27`, `index.html:3865` |
| E, Q | context key (foot, lift), train switch left/right | `controls.js:33`, `train.js:198`, `foot.js:92` |
| Ctrl+D / F3, Ctrl+H | debug panel, hide HUD | `debug.js:87-89` |
| **Digit1, Digit2** | hazard lights, siren | `index.html:3865` |
| **Digit3, Digit4** | Ferris-wheel fireworks / show | `ferris.js:64`, `index.html:3865` |
| Digit0–9, Numpad0–9 | lift floors, **only while the lift pad is open** (consumed first) | `index.html:3859-3863` |
| Digit0–2, Numpad0–2 | freight-lift stops, **only while the freight pad is open** | `lift.js:86`, `index.html:4455` |
| `+` `=` `-` (by `e.key`) | minimap zoom | `index.html:3865` |
| Arrows, Home, End, Tab, Enter, Space | dialog navigation (pause, about, car select, start screen) | `pause.js:28-57`, `about.js:22-43`, `carselect.js:98-100`, `startscreen.js:45-48` |
| Digits | train blocks Digit1/2 only | `train.js:199` |
| Digits | foot blocks Digit1/2 only | `foot.js:90` |

Every letter A–Z is taken. **Digit5–Digit9 and Digit0 are free in every run context.** The lift pads use them only
while a pad is open, and the pad handler runs before the radio handler.

## Radio keys

The top-row digits **5 6 7 8 9 0** form one bank, like the preset buttons of a real car radio:

| Key | Action |
|---|---|
| **5** | radio on/off (on the start screen: menu music on/off) |
| **6** | station: Rhyflitzer FM ⇄ SRF 3 live (switching turns the radio on) |
| **7** | previous track (on SRF 3: shows the station only) |
| **8** | next track (on SRF 3: shows the station only) |
| **9** | volume − (one step of 10 %) |
| **0** | volume + |

- A radio key does nothing when Shift, Ctrl, Alt or Meta is held. On a Swiss keyboard Shift+0 types `=` (minimap
  zoom), and Shift is the held nitro key.
- A held key (`e.repeat`) is ignored, except 9 and 0, which keep stepping the volume. The dispatcher returns on
  `e.repeat` before the game keys (`index.html:3865`), so the radio handler is called just before that return and
  handles repeat itself.
- **M stays the global mute.** The radio goes through the SFX master gain, so M silences it as well.
- The help dialog (F1) gets rows for 5, 6, 7 · 8 and 9 · 0. `controls.js` gets matching entries (no touch flag) so
  `conflicts()` keeps guarding them.

## Architecture

### `radio.js` (new, pure, `node --test`)

This module holds no DOM and no audio. It contains:

- `TRACKS`: the four tracks (id, title, artist, src, `gainDb`). Cool Rider has a mean level of −10.1 dB against about
  −16 dB for the others (ffmpeg `volumedetect`, 2026-11-09), so it gets `gainDb: -6`.
- `MENU_TRACK`
- `STATIONS` (`fm`, `srf3`)
- `SRF3_URL`
- `RADIO_KEYS`
- `radioKeyAction(e)`
- `nextTrack` / `prevTrack` (wrap)
- `stepVolume` (0–10)
- `trackGain(vol, gainDb)` and `menuGain(vol)`
- stored-value parsing: `radioOnFrom`, `stationFrom`, `volumeFrom`, `menuMusicOnFrom`
- `srfVerdict(watch, now)`: SRF start and stall watchdog → `'ok' | 'wait' | 'fail'`
- `displayKey(state)`: which `strings.js` key and arguments the display shows

### `index.html`

**`SFX`** (`index.html:3900-3970`) gets two small additions:

- `graph()` returns `{ ac, master }` and creates the context on a user gesture, like `ctx()` does.
- `onHold(fn)` registers a listener that `hold()` calls with the new held/released state.

**`RADIO`** is a new IIFE next to `SFX`. It owns:

- two `<audio>` elements, created lazily with `preload="none"` and `crossOrigin="anonymous"`: `fm` (src swapped per
  track) and `srf` (src = `SRF3_URL`)
- `menu`: a third element for the menu track
- per-element `MediaElementSource → GainNode → SFX master`

It keeps `{ on, station, track, vol, menuOn }` in localStorage and exposes `state()` for `window.__mm.radio`.

Behaviour:

- **In a run** (`inRun()`, `index.html:5347`): when on, the current station plays. A track `ended` → `nextTrack`, so
  the playlist loops.
- **Start screen**: menu music. It starts on the first `pointerdown` or `keydown` after `endLoading()`
  (`index.html:855`, `index.html:5911`). Its audio file is requested only then. It plays quietly at 35 % of the radio
  volume and loops. It keeps playing through Choose car, About and Worlds (all opened from the start screen).
- **Start of a run** (`startRace`, `index.html:5050`): the menu music fades out over 0.5 s and the radio starts (if on).
  The radio display shows what plays.
- **Back to the main menu** (`toMainMenu`, `index.html:5354`): the radio stops and the menu music resumes (if on).
- **Pause / hidden tab** (`SFX.hold`, `index.html:3940`, `holdSound` `index.html:5348`): every element pauses. On
  release, Rhyflitzer FM resumes where it was. SRF 3 reloads its src, so it is live again and not time-shifted.
- **Hideout rooms, on foot, heli, train**: the radio keeps playing. It is one radio for the whole run.
- **SRF 3 failure**:
  - What counts: an `error` event (offline, blocked, failed CORS with `crossorigin`), no `playing` within 8 s, or
    `waiting`/`stalled` for longer than 10 s.
  - What happens: the radio switches to Rhyflitzer FM, stores `fm` and shows "SRF 3 is not reachable – back to
    Rhyflitzer FM". It never throws and never hangs. All `play()` promises are caught.
- **Display**: `radioShow(text)` writes into `#toast` with class `radio` for 3 s. `toast()`, `toastHtml()` and
  `toastBig()` drop that class.

### Touch

- `#radiobtn`: 48×48 at `right: 72px`, the same top as `#pausebtn`. It is hidden like `#pausebtn` on the start screen
  and in dialogs (`index.html:231-233`) and when the HUD is off (`index.html:14`). It shows only under `pointer:coarse`.
- `#radiopanel`: a small dark panel under the button, with the buttons ⏻, ◀, ▶, station, −, +. Each one runs the same
  `RADIO` command as the key. The panel closes on a second tap of 📻, on pause, and after 6 s without a tap.
- **Start screen**: a `#musicbtn` ("Music: on/off") in the secondary button row (`index.html:505-509`), for touch and
  mouse.

### Credits

About → Credits (`index.html:615-633`) gets a "Music" `<dt>` with four credit strings and an SRF 3 line. The Rob Bery
credit names "Rob Bery" and "Rob Bery Art" as the author asks. `CREDITS.md` gets the same lines. Each mp3 has
`assets/music/<slug>.LICENSE.md` beside it (already committed with this spec).

### Storage

Every access is in `try/catch` (pattern: `controls.js:87-88`, `index.html:3153`).

- `mm.radio`: `'1'`/`'0'`, default on
- `mm.radioStation`: `'fm'`/`'srf3'`, default `fm`
- `mm.radioVol`: `0`–`10`, default `6`
- `mm.menuMusic`: `'1'`/`'0'`, default on

## Files

| File | Change |
|---|---|
| `radio.js` | new, pure logic |
| `tests/radio.test.mjs` | new |
| `strings.js` | radio, menu-music, help and credit strings, en + de |
| `tests/strings.test.mjs` | credit assertions |
| `controls.js` | radio entries in car, foot, indoors, heli, train |
| `tests/controls.test.mjs` | the radio keys are bound, no conflicts |
| `index.html` | `SFX.graph/onHold`, `RADIO` IIFE, key dispatch, help rows, toast `radio` class, `#radiobtn`/`#radiopanel`, `#musicbtn`, credits, `__mm.radio` |
| `CREDITS.md` | music section |
| `tests/hermetic_api.py` | every browser context aborts `*.srg-ssr.ch`, so no test can reach the real stream |
| `tests/test_hermetic_api.py` | the SRF route test |
| `tests/test_radio.py` | new Playwright file: keys, display, SRF stub and fallback, lazy menu music, touch panel |
| `CHANGELOG.md` | player-facing entry |

## Testing

- `node --test tests/radio.test.mjs tests/strings.test.mjs tests/controls.test.mjs`, then the full
  `node --test tests/*.test.mjs`.
- `pytest tests/test_radio.py tests/test_hermetic_api.py` (Playwright, foreground). The SRF URL is fulfilled by
  `page.route` with a local mp3 (`assets/music/california-snares-and-synths.mp3`) and `Access-Control-Allow-Origin: *`.
  The fallback test lets the hermetic abort route answer.
- The ears stay the real gate: the maintainer listens by hand (levels, quiet menu music). `test-todo.md` is kept on
  `main` outside this PR.

## Out of scope

- The #546 settings dialog. `mm.radioVol` is the value it can bind to later.
- Recording (#749). `RADIO.state().station` tells it whether SRF 3 is on; switching the station during a recording is
  #749's job.
- Now-playing titles from the SRF 3 stream: the `<audio>` element has no access to ICY metadata.
