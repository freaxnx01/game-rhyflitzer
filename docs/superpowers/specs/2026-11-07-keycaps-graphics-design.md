# Key caps as key graphics (#700) — design

## Problem

A tutorial tester read **"WASD"** as a word: is it four keys, or do I type the word? Two places show it:

- **Key bar** (`index.html:4053`): `<kbd>${x.cap}</kbd>`. Each entry's `cap` from `controls.js` (`drive`/`walk`: `cap: 'WASD'`, `controls.js:16,31`) becomes **one** framed cap, `[WASD]`.
- **Tutorial banner** `#tuthint` (`renderTutorialHint`, `index.html:4896`) is written with `textContent`: "Drive off with WASD: …". It is plain text, so no key there looks like a key, and that goes for `Z`, `J`, `X`, `Shift` and `Space` too.

## Decisions (maintainer, 2026-11-07)

- **Banner:** the movement keys as a **cross**, the way they sit on the keyboard (W on top, A S D below), then "or" and the arrow keys as the same cross (↑ on top, ← ↓ → below). Every other key (`Shift`, `Z`, `J`, `X`, `S` in the brake step) as one cap.
- **Key bar:** four small caps **in a row**, `[W][A][S][D]`, because the bar stays one line. No arrow keys in the bar.
- Touch hints (`[Gas]`, `☰ → Foto`) stay as they are. The F1 help (static `<kbd>`, no "WASD") is out of scope.

## Design

1. **New pure module `keycaps.js`** (no DOM, `node --test`). It turns a cap token into `<kbd>` HTML:
   - `capKeys(cap)`: `'WASD'` → `['W','A','S','D']`, `'Arrows'` → `['↑','←','↓','→']`, anything else → `[cap]`.
   - `capsRow(cap)`: `<span class="caps"><kbd>W</kbd><kbd>A</kbd>…</span>`.
   - `capsCross(cap)`: `<span class="caps cross">…</span>` for a four-key cluster. For a single key it is the same as `capsRow`.
   - Every label goes through `esc` (`escape.js`).
   - Two named functions, not a layout flag (the base no-flag-arguments rule).
2. **Data unchanged.** `controls.js` keeps `cap: 'WASD'`. `tutorial.js` `howTo()` keeps returning `{ via: 'key', cap }`. Only the rendering changes, so `controls.test.mjs` and `tutorial.test.mjs` stay as they are.
3. **Key bar:** `<kbd>${x.cap}</kbd>` → `capsRow(x.cap)`. The `#keybar kbd` style keeps applying (`index.html:264`). `.caps` adds a 2 px gap between the caps of one entry.
4. **Banner:** `renderTutorialHint` translates with a marker character in place of `how`. If the marker is in the text, it splits the text there, escapes both halves and puts the key graphic between them. If it isn't (`tutStepCheckpoints` ignores `how`), it writes the escaped text alone. The key graphic:
   - `cap === 'WASD'` → `capsCross('WASD') + ' ' + tr('tutOr') + ' ' + capsCross('Arrows')`.
   - another key → `capsRow(cap)`.
   - touch `button`/`menu` → the escaped text as before (`tutButton`/`tutMenu`).

   It is still written only on a change (aria-live must not re-announce every frame). The guard compares the generated HTML with `#tuthint.dataset.html`, and also rewrites when the banner was cleared (`textContent === ''`, which is what `startTutorialRun`/`finishTutorial` do).
5. **Strings:** new `tutOr` (`en: 'or'`, `de: 'oder'`). `tutKey` (`(cap) => cap`) has no caller left after this change and is removed from both blocks.
6. **CSS:**
   - `#tuthint kbd` gets the key-bar cap look: border `2px solid var(--steel)`, colour `var(--sun)`, `font:inherit`, weight 800, `padding:0 5px`, min-width so W and I are the same width, centred.
   - `.caps{display:inline-flex;gap:2px}`.
   - `.caps.cross{display:inline-grid;grid-template-columns:repeat(3,auto);vertical-align:middle}` and `.caps.cross kbd:first-child{grid-column:2}`.

## Acceptance criteria

- [ ] `keycaps.js` exists, is pure, and `tests/keycaps.test.mjs` covers row, cross, single key and escaping
- [ ] Key bar: the drive/walk entry shows four separate `<kbd>` (W, A, S, D), all other entries one each. The bar's text is unchanged (`test_keybar.py` keeps passing as is)
- [ ] Tutorial banner (desktop): the drive, climb and stair-down hints show the WASD cross, "or"/"oder", and the arrow cross (8 `<kbd>` in `#tuthint`). Nitro, jump, get-out, photo and get-in show one `<kbd>`
- [ ] Tutorial banner (phone): no `<kbd>`, text as before
- [ ] `tutOr` exists in `en` and `de`; `tutKey` is gone from both
- [ ] The banner is not rewritten on frames where the hint did not change
- [ ] Targeted tests only: `node --test tests/keycaps.test.mjs tests/strings.test.mjs tests/controls.test.mjs tests/tutorial.test.mjs`, `pytest tests/test_tutorial.py tests/test_keybar.py`

## Out of scope

- The F1 help, the pause menu, toasts, and the changelog's own `<kbd>`.
- Touch-control rendering.
