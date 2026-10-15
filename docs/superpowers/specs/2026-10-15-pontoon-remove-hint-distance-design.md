# Pontoon take-down hint and U only near the built bridge (#307)

## Cause (measured)

`pontoonPrompt(deck, atBank)` returns `'remove'` whenever a deck exists, whatever the car's position
(`prototype/pontoon.js:102`). `pressPontoon()` does the same for the key: with a deck it calls
`togglePontoon` without any distance check (`prototype/index.html:2303`). The HUD line is set from the
same function (`prototype/index.html:2866`, the `$('prompt')` block) and the debug hook `__mm.pontoon()`
mirrors it (`prototype/index.html:2305`).

Reproduced headless (Playwright, OSM world, terrain blocked): pontoon built from BANK (1404.4, -425.5),
deck 287.3 m long, `a` = (1403.2, -435.9). Car placed at the Hübel mouth (-703.3, 1419.1), 2806.9 m from
`a`: `__mm.pontoon().prompt === 'remove'`; pressing KeyU there sets `dir` from 1 to -1, i.e. the bridge
starts to be taken down from 2.8 km away. (The DOM `#prompt` text read back empty in that run because the
HUD refreshes it on a 250 ms timer and the swiftshader frame rate is too low; the pure function and the key
path are the cause either way.)

## Behaviour

- While a deck exists: the "U · Pontonbrücke abbauen" hint shows only when the car is within
  `PONTOON_CFG.removeReach` (30 m, same as `reach`) of the deck, measured to the segment a-b; on the deck
  counts as distance 0. Otherwise the HUD line is empty.
- U does the same: away from the deck it does nothing. With a deck, U never builds a second one
  (one at a time stays).
- Without a deck nothing changes (build hint only at the Rhine bank, #100).

## Acceptance criteria

- With a built deck and the car at the Hübel mouth, `__mm.pontoon().prompt` is `null` and U leaves `dir` at 1.
- Standing where the bridge was built, on the deck, or at the far end (<= 30 m from the segment), the hint
  reads "remove" and U takes the bridge down.
- `pontoonPrompt` unit tests cover: no deck at/away from bank, deck near, deck far.
- `node --test prototype/tests/pontoon.test.mjs` and the targeted Playwright file `test_pontoon.py` pass.
