# Hide the key bar during the tutorial (#912)

## Problem

In the tutorial the key bar (`#keybar`, top centre) and the tutorial hint (`#tuthint`) are on screen together and name partly the same keys. The bar only ghosts after 30 s (`hudfade.js:4`, `FADE_S.keybar`, #773). The hint already names the keys of the current step.

## Design

While `R.mode === 'tutorial'` the key bar is hidden (`hidden` attribute, so `display:none` via `index.html:316`). In every other mode, and once the tutorial is left, it behaves as today. F1 (the full key list) is untouched.

The user's Settings switch is not touched: `KEYBAR.on` and `localStorage mm.keybar` keep the user's choice. The tutorial only adds a second condition to the visibility.

Change is local to `stepKeybar()` in `index.html` (~line 4934):

- `sig` gains the mode: `${KEYBAR.on}|${R.mode === 'tutorial'}|${ctx}|${act}|${lang}`.
- `$('keybar').hidden = !KEYBAR.on || R.mode === 'tutorial'`.
- `window.__mm.keybar()` keeps returning `on` (the setting) and `shown` (real visibility), so tests can tell the two apart.

`stepKeybar()` already runs every frame (`index.html:7345`), so entering the tutorial (`startRace` sets `R.mode`, `index.html:5741`) and leaving it (the next `startRace`) flip the bar on the next frame. `keybarPhase`/`createKeybar` in `hudfade.js` stay unchanged: a hidden element has no ghost state to show, and `startRace` already resets `KEYBAR_FADE` (`index.html:5741`), so the next mode starts awake.

No change in `controls.js`, `tutorial.js` or `hudfade.js`.

## Assumptions

- **A1** [confirmed] Hide the key bar in the tutorial. Answer: "Hide it in the tutorial": the tutorial hint already names the keys of the current step; after the tutorial (and in all other modes) the key bar works as today. F1 still lists all keys.
- **A2** [high] The gate is `R.mode === 'tutorial'` read inside `stepKeybar()`, not a CSS class. Rejected: `body.tutorial` CSS (`index.html:5744` already toggles it) because `.hidden`/`sig` logic and the `__mm.keybar().shown` hook would then disagree with what is visible. Evidence: `index.html:4934-4939`, `index.html:4942`.
- **A3** [high] The Settings switch and `mm.keybar` in localStorage are not written by the tutorial. Evidence: only `toggleKeybar` writes them (`index.html:4941`).
- **A4** [high] No change to the 30 s ghost logic. Evidence: `hudfade.js:39-42`; `startRace` resets `KEYBAR_FADE.sig` (`index.html:5741`).
- **A5** [high] The bar also stays hidden during the tutorial result screen (`R.mode` is still `tutorial` until the next `startRace`); it is hidden there anyway behind the overlay (`index.html:274`).
- **A6** [high] Touch devices need nothing: the bar is already `display:none` on `pointer:coarse` (`index.html:319`).

## Consequences

- The tutorial's top-centre area loses the bar; the hint is the only key guide there. The `#tc` stack (`index.html:315`) simply has one row less.
- A player who switched the bar off and later plays the tutorial sees no difference; one who has it on sees it come back right after the tutorial.
