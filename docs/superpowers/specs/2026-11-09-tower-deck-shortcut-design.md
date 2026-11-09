# Tower shortcut: jump to the viewing deck and back down (#701)

## Problem

A tester found walking the Plattform Sisslerfeld stair hard, in the tutorial (step `climb`, then the way back down in
`getIn`) and in free play. Wanted: one action at the door that puts the walker on the deck, and one on the deck that
puts them back at the door. The stair itself stays walkable.

## Decision

The existing **E** context key gets two new actions, `up` and `down`, for the Plattform. No new key.

- `up`: on foot at ground level within 2.5 m of the Plattform door (`plattformEntrance`, the spot where the E prompt
  already shows) -> the walker stands on the deck beside the stair opening.
- `down`: on foot on the deck within 3.2 m of the stair gap (`austritt` mid-angle, radius `core.r`) -> the walker
  stands outside the door.
- Priority in `contextKeyAction`: lift > leave > **hop (up/down)** > enter. At the door `up` therefore wins over the
  generic `enter`, whose only effect there is the toast `plattformOpen`. That toast stays as the fallback while hovering
  (`FOOT.hover`), where no hop is offered.
- Touch: the existing context button `#tE` already follows `contextAction()`; it shows the labels `barHopUp` / `barHopDown`.
  No new control. The key bar shows the highlighted E entry with the same labels.
- Prompt: `stepEnter` writes `hopUpPrompt` / `hopDownPrompt` instead of `enterPrompt` while a hop is offered.
- Tutorial: `climb` is still done by `onDeck`, so the shortcut completes it. The hints name it:
  `tutStepClimb` (+ new `tutStepClimbTouch`) and `tutStepDown` / `tutStepDownTouch`.
- The decision logic is pure and lives in `plattform.js` (`plattformHop`, `plattformHopLanding`) so `node --test` covers it.

## Landing spots

- Up: `frame.polar(gap, core.r + 0.9)` with `gap = (austritt.from + austritt.to) / 2` (175 deg), `y = base + deck.y`,
  heading `facing + gap` (looking out over the deck, away from the stair). That point is on the deck slab beside the round
  opening and is not behind the rail (the rail only covers 230..460 deg, `railFrom` / `railTo`).
- Down: `frame.polar(0, entranceR + 0.4)`, `y = base`, heading `facing` (away from the door).
- Both reset velocity (`P.vx = P.vz = P.vy = FOOT.vy = 0`) and the eye ease (`FOOT.eye = null`) like `__mm.place`.

## Assumptions

- **A1** [high] Uses the existing context key E, no new binding. Rejected: a new key (the issue prefers E).
  `controls.js:35` (`entry('context', ['KeyE'])` in WALK), `foot.js:93` (E -> `runContextKey`), `index.html:4261-4263`
  (`contextAction` / `runContextKey`).
- **A2** [high] At the door the hop wins over the generic enter. Rejected: showing both. The enter handler only toasts
  "The stair is open" (`index.html:3974`), and both use the same 2.5 m range (`enterables.js:9`). The toast stays as the
  hover fallback.
- **A3** [med] `down` is offered within 3.2 m of the stair gap on the deck (the issue says "near the stair"). Rejected:
  anywhere on the deck (the deck is a 9.84 m triangle, `plattform.js` `PLATTFORM.deck.side`).
- **A4** [med] `up` is also offered on the lowest steps (feet less than 1 m above the base), not on higher steps.
  Rejected: every height. From mid-stair the player simply walks.
- **A5** [high] The deck landing satisfies the tutorial/viewpoint check. `viewpoints.js:12` (`r: 6, aboveGround: 5`)
  and `index.html:5116` (`standsAt(TUT_VP, pose)`): 2.46 m from the centre and 5.735 m above the base. A node test asserts it
  against `plattform` constants; the pipeline must not change `r` or `aboveGround`.
- **A6** [med] Tutorial hints mention the key as plain text "E" (and "the button at the door" on touch), not as a #700
  keycap. Rejected: a second keycap marker in `tutorialHintHtml` (`index.html:5148` splits on one marker only).
- **A7** [low] The hop is instant: no fade, no sound, no toast. Rejected: a short whoosh or screen fade. Nothing in the
  repo gives a pattern for a walker teleport sound; easy to add later.
- **A8** [high] Hovering (`FOOT.hover`) offers no hop, so the hover flight is unaffected.
- **A9** [high] The tutorial only exists on Hochrhein where the Plattform is built (`index.html:5025`); `PLAT` is null
  elsewhere and the hop is never offered.

## Key bindings checked

Grepped all root `*.js` and `index.html` (including `pause.js`, `train.js`, `foot.js`, `controls.js`, `enterables.js`):
**E** is already the foot/indoors/lift context key (`controls.js:35,48`, `foot.js:93`, `enterables.js:73`) and in the
train context `switchRight` (`controls.js:46`, `train.js:198`), which is a different context and unaffected. `pause.js`
has no E binding (only `Escape`, `KeyP`, `KeyX`). Nothing new is bound. Digits 5, 6, 7, 8, 9, 0 belong to #735 (car
radio) and are not touched.

## Consequences

- The on-foot key bar shows an E entry (highlighted) at the door and at the stair gap on the deck: "up to the deck" /
  "down". On the phone the `#tE` button shows there.
- `test_e_at_the_door_says_the_stair_is_open` no longer describes the behaviour at the door and is rewritten.
- The help overlay gets one more E row.
- #735 edits `index.html`, `controls.js`, `strings.js`, `pause.js` in parallel; every edit here is a small insert anchored on
  code text.

## Out of scope

Other towers, the Ferris wheel ride (`pressRide`, #516), the lift, an animation or sound for the hop.
