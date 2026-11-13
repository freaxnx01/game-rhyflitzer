# Menu music while the world loads (#841) — design

## Problem

The menu music (#735) is armed by the first `pointerdown` / `keydown`, but those listeners are registered at `index.html:6417-6418`, after every top-level `await loadStage(...)` (first at `index.html:932`, last `6351`). Worse, `RADIO` itself (`index.html:4056`) and the SFX graph (`index.html:4000`, `ctx()` creates the AudioContext lazily) do not exist until loading has passed line 2871. So code inside RADIO cannot start music during loading; a click during loading is simply lost.

## Design

A tiny early starter, `createEarlyMenu()` in `radio.js` (pure, DOM-free: the audio factory and event target are injected, so `node --test` covers it). `index.html` creates it once, **before** `await loadStage('map')` (line 932):

- Menu music off in `localStorage` (`RADIO_STORE.menu`): does nothing, no element, no listeners.
- On: makes one `Audio` (`preload='none'`, `loop`, `src = MENU_TRACK.src`, `volume = menuGain(stored volume)`), calls `play()` right away (swallowing a rejection: autoplay policy), and retries `play()` on every gesture (`pointerdown`, `pointerup`, `keydown`, `touchend`; touch counts as activation on the up event). It remembers that a gesture happened.
- When RADIO exists, `voice('menu')` **adopts** that element (`take()`) instead of `new Audio()`, routes it through the master gain (`createMediaElementSource` works on a playing element) and resets `el.volume = 1` (the gain node now sets the level).
- At `endLoading()` (line ~6416): if a gesture happened during loading, `RADIO.armMenu()` adopts at once (a gesture means the AudioContext may resume). Without a gesture, nothing changes: the element may already play directly (browser allowed autoplay) or stays silent; the existing once-listeners arm on the first input, as today.
- `apply()`: when a run is on or the menu music is off, an element not yet adopted is paused and dropped (`dropEarly()`), so Enter-to-start cannot leave an orphan playing.

World switching (picker, `index.html:5502`, `5820`) is `location.search = ...`, a full page load. So "later load" is the same path: the page starts, the early starter tries `play()`. Whether the browser allows it right after a click in the previous document is browser business; if refused, silent until the first gesture.

## Assumptions

- **A1** [high] No change to the player-facing toggle: key 5 / music button stay as in #735. Rejected: honouring key 5 during loading. `RADIO` and its `keydown` handler (`index.html:3960`) do not exist yet; a gesture during loading only starts the music.
- **A2** [high] Early starter lives in `radio.js` (pure, injectable), not inline in `index.html`. Rejected: moving the whole RADIO/SFX block before the awaits; it depends on `R`, `tr`, `radioShow`, `renderMusicBtn` (lines 4056-4135, 5259, 5442) and is a large risky move.
- **A3** [med] The early element plays straight to the speakers until adopted (no master gain, so `M` mute does not reach it). Window is loading time only; any key press (incl. `M`) is a gesture, and adoption happens at `endLoading()`. Rejected: creating an AudioContext early (`SFX` is built after line 2871; a context created without gesture is suspended and would silence the element).
- **A4** [med] No "click for music" hint on the loading screen. Rejected: a hint line in `#loadbox` (`index.html:550`) needs de/en strings and shows even when the music is off or autoplay works. Easy follow-up if wanted.
- **A5** [med] `play()` at page start fetches the 5.4 MB mp3 (`assets/music/menu-running-title.mp3`) in parallel to the map/terrain fetch. Streamed, never awaited; `preload='none'` keeps it unfetched until `play()` succeeds. Rejected: delaying the start until the terrain is in; it would defeat the goal. Autoplay-blocked browsers fetch nothing before the first gesture.
- **A6** [med] A tab hidden during loading does not pause the early element (SFX `hold` only pauses RADIO's elements). Browsers keep media audible in background tabs; accepted for the loading window.
- **A7** [med] Adopted element keeps no `crossOrigin` (set after `src` would be unreliable); the asset is same-origin, so the media-element source is not tainted.

## Consequences

- Page load now issues a request for the menu mp3 when the music is on (the Playwright test `test_menu_music_loads_only_after_the_first_input` asserted the opposite and is rewritten).
- With autoplay blocked, behaviour before the first gesture equals today's.
- The first ~0.1 s after adoption ramps the gain from 0 (`level()` time constant), a barely audible dip.

## Acceptance criteria

- [ ] A click / key / touch during loading starts the menu music (music on).
- [ ] At load start `play()` is tried without gesture; a refusal is silent (no console error, no `pageerror`) and the first gesture starts it.
- [ ] A world switched via picker plays the menu music during that load when autoplay allows it.
- [ ] Music off (key 5 / button, `mm.menuMusic = 0`): no audio element, no request for the mp3 during loading.
- [ ] Loading is not awaited on the track; no extra `await` in the load path.
- [ ] After loading: volume, key 5 toggle, mute `M`, pause and run start behave as in #735 (element adopted into the master graph; starting a run stops the menu music).
- [ ] `CHANGELOG.md` entry under [Unreleased].
