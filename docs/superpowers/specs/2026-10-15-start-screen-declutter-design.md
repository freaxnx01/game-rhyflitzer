# Start screen declutter (#224)

Issue: #224 `feat(ui): the start screen is too crowded`. Size: small, one markup block plus three orphaned strings.

## Problem

The start panel (`prototype/index.html:262-319`, `#overlay > .panel`) stacks the title, the intro text (`#ovtext`),
a 12-row key grid (`.keys`, lines 273-286), the Blitz text (`#blitzhint`), five buttons, the Region row, the
optional Worlds row (#170), the terrain/world-file controls and the blurb. It scrolls on a normal laptop screen.
The key grid is the single largest block (12 rows at 17 px with 6 px gaps, about 330 px).

## Design

Delete the `<div class="keys">...</div>` block from the start panel (lines 273-286). Nothing else moves.

- The same keys stay reachable: F1 or `?` opens `#help` (`prototype/index.html:2158`, `openHelp()` at 2695), which
  holds every row the start screen showed and more (`index.html:192-219`). `keyAccel`, `keySteer`, `keyHandbrake`,
  `keyStyle`, `keyReset`, `keyLights`, `keyHazard`, `keyCamera`, `keyPause` are shared with `#help` and stay in
  `strings.js`.
- Three string keys were used only by the start-screen block and become orphans: `keyHornMute`, `keyNitroJump`,
  `keyAllKeys` (grep of `prototype/*.js`, `prototype/index.html`, `prototype/tests/` shows no other use; `pause.js`
  has none). Remove them from both `en` and `de` in `prototype/strings.js` (lines 63-65 and 341-343), so the
  "same keys in both languages" test in `strings.test.mjs` keeps holding. No dead code.
- The `.keys` CSS (`index.html:87-88`) is still used by `#help` (`#help .keys`, line 30): keep it.
- Space for the credits button (#267): no markup now (no dead code). The slot is the footer line of the panel, the
  `#blurb` paragraph (line 317), which is the last element and the quietest. When #267 lands it wraps `#blurb` and
  its button in one flex row (`display:flex;justify-content:space-between;align-items:center`). Removing the key
  grid already frees the vertical room; the button is one small line, not a new row of the panel.
- Not touched: `#ovtext`, `#blitzhint`, the button row, Region/Worlds rows, terrain controls, blurb. The issue lists
  them as part of the crowding, but the maintainer's decision names only the keys; further trimming is a separate
  layout call.

## Relation to other issues

- #170 (world gallery, closed): added `#worldsrow` (line 301), hidden until the gallery has entries. It makes the panel
  taller only when worlds exist; this change makes room for it and does not touch it. `test_gallery.py` is affected
  only if it measures panel height (it does not; checked by grep).
- #267 (credits screen, open): needs the slot above. No dependency in either direction: this issue ships without it.
- #268 (guided tutorial, open): will teach the driving basics. Until it lands, a first-time player sees no key hints
  on the start screen (see Consequences). No dependency.

## Assumptions

- **A1** [confirmed] Remove the keyboard instructions from the start screen. Maintainer note 2026-10-11 and chat 2026-10-15:
  "Remove the keyboard instructions from the start screen. F1 already shows them, and a guided tutorial is coming (#268)."
- **A2** [confirmed] A credits screen will be reachable from the menu instead (#267). Maintainer: "Plan the space for its
  button, but do not build the credits screen in this issue."
- **A3** [high] The F1 pointer row (`keyAllKeys`) goes with the block, because it is one of the "keyboard instructions".
  Rejected: keep a one-line "F1 all keys" hint. `index.html:2158` shows F1 and `?` work while the overlay is up, and the
  tutorial (#268) is the planned replacement.
- **A4** [med] The credits button slot is the footer line beside `#blurb`, with no placeholder markup now. Rejected: an
  empty reserved row (dead markup that would still take space), or placing it in the button row (`index.html:288-294`,
  already five buttons, wraps on phones). The #267 issue can still choose another place.
- **A5** [high] No other start-screen element is removed or moved. Rejected: also trimming `#blitzhint`, the terrain row or
  the blurb; the confirmed answers cover the keys only.
- **A6** [high] Orphaned strings `keyHornMute`, `keyNitroJump`, `keyAllKeys` are deleted from `strings.js`.
  Rejected: leaving them. `grep -rn` over `prototype/` finds no other reader, and they are not in any translation workflow
  outside the file.
- **A7** [high] The pause menu (`#pause`) shares nothing with the removed block, so it is unaffected (`index.html:122`).

## Consequences

- A new player no longer sees controls before the first race. F1 and `?` still open the full list; touch devices have the
  on-screen buttons (`index.html:255-260`). This is the maintainer's accepted trade-off until #268.
- The start panel gets about 330 px shorter, so the Worlds row (#170), when shown, is less likely to push it into a scroll.
- Stale doc: `docs/superpowers/specs/2026-10-02-i18n-de-en-design.md:106-108` mentions the three removed keys. It is a
  dated historical spec; left as is.

## Verification

- Unit: `node --test prototype/tests/strings.test.mjs` (de/en parity).
- Playwright, targeted: `prototype/tests/test_help_filter.py` with a new test that the start panel holds no `.keys` grid
  and that F1 on the start screen still opens `#help` with its rows. Plus `test_i18n.py` (strings.js mapping in
  `prototype/tests/test-map.json`). CI selection: `index.html` is a game file, so rule d adds the three smoke checks;
  `strings.js` is mapped to `test_i18n.py`; the edited `test_help_filter.py` is picked by rule a. No `test-map.json` edit is needed.
