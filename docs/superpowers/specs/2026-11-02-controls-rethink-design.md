# Controls rethink for desktop and phones (#535)

Status: approved in an interactive brainstorming session with the maintainer, 2026-11-02.
Comes before the tutorial #534, which will teach these controls.

## Goal

Readers of the Neue Fricktaler Zeitung article, most without gaming experience, can start the game and get around
without reading a manual, on a computer and on a phone. Experienced players (the maintainer, Kicsi) keep almost all
their keys.

Success:

- A first-time desktop player sees, at all times, how to drive and the four core actions, and what the context key
  does right now.
- A phone player can drive, walk, get out/in and jump to a place, and switch the camera in the car, with on-screen controls only.
- Gas, nitro and look-back can be held at the same time on an ordinary keyboard.
- No key does two different things in the same situation.

## Decisions (maintainer, 2026-11-02)

1. **Simple core plus the rest.** A small visible core for newcomers; every other action keeps its key and stays
   reachable through F1 and the command search (Ctrl+P), but is not advertised on screen. No full re-mapping.
2. **Core actions** (besides driving): **Z** get out / in, **J** jump to a place, **F1** all keys, and **C** camera in the car only.
   The camera is not available on foot: `foot.js` keeps blocking C there (the view is first person already).
   The photo key X is not in the core; modes that need it (viewpoint hunt #508) show it themselves.
3. **Nitro on Shift (hold)** in the car. N keeps working as a second key. On foot and in the helicopter Shift keeps
   its meaning (down); there N stays nitro.
4. **Desktop: a small key bar** at the bottom edge, context-aware, can be hidden.
5. **Phone: virtual joystick plus context buttons** (details below).
6. **Phone scope of this issue: car and on foot.** Helicopter, steam loco, lift and pontoon bridge are reached through
   the ☰ menu on the phone; dedicated touch controls for them are a follow-up issue.
7. **E is the one context key** ("action here"): enter a door, leave a building, use the lift. B is only look-back.
   The turn signals move from Q · E to **Comma · Period**. In the steam loco Q · E stay the switches (no signals
   there).
8. **Camera (C) is not available on foot** (maintainer, 2026-11-02). `foot.js` keeps blocking KeyC on foot as today.
   The on-foot key bar has no camera entry and the phone camera button is shown only in the car. In the car nothing changes.

## Desktop

### Bindings that change

| Action | Before | After |
|---|---|---|
| Nitro (car, hold) | N | **Shift** (left or right) or N |
| Turn signal left · right | Q · E | **Comma · Period** |
| Enter a glowing door (on foot) | E | E (unchanged, now the context key) |
| Leave a building | B | **E** (B no longer leaves) |
| Look back (hold) | B | B (unchanged, only meaning) |

Everything else keeps its key: W/↑/Space gas, S/↓ brake, A/D/←/→ steer, Ctrl handbrake, Tab map, L lights,
1 hazard, H/Enter horn, C camera, V hide car, G/Y borders, J jump, O autopilot, I navigation, F helicopter, Z on foot,
U pontoon, K trip, R back on the road, T style, X photo, M mute, Esc/P pause, Ctrl+D debug, Ctrl+P command search,
F1/? help. Train keys (`train.js` TRAIN_KEYS) and lift keys are unchanged.

Comma, Period and Shift are free in the car today (checked: no `Comma`/`Period` handler anywhere; Shift is read only
by `foot.js` and `heli.js`).

### The key bar

- A slim bar centred at the bottom edge, above the `#game-nav` footer, visible while driving or walking (overlay
  hidden). Each entry is a key cap plus one word, localised (de/en):
  - Car: `WASD fahren · Shift Nitro · Z aussteigen · J springen · C Kamera · F1 alle Tasten`
  - On foot: `WASD gehen · Space springen · Z einsteigen · J springen · F1` (no camera entry)
  - When the context key has an action, an extra highlighted entry first: `E eintreten`, `E hinaus`, `E Lift`.
- Hidden on phones (the touch controls replace it), in the start screen and in dialogs.
- A toggle in the pause menu, "Tastenleiste ein/aus", stored in localStorage (wrapped in try/catch, default on).
- It never takes focus and does not block clicks on the world (pointer-events: none).

## Phone (car and on foot)

Shown instead of today's `#touch` buttons (‹ › ▲ ▼ H) on touch-first devices (the existing `@media (pointer:coarse)` rule that shows `#touch`).

- **Left: a virtual joystick.** Car: x steers (analog, same range as A/D). On foot: walk direction (forward/back and
  sidestep), the view turns with a one-finger drag on the world as today.
- **Right: Gas and Brake** buttons (car). On foot the Gas button becomes **Jump**.
- **Above them, three round buttons:** Get out/in (Z), Jump to a place (J, opens the existing jump dialog),
  Camera (C), the camera button only in the car (hidden on foot).
- **Context button:** appears only when the context key has an action (enter, leave, lift), labelled with that action.
- **☰ menu button** (top corner): a list of every other action, built from the same entries as the command search,
  each a tap target ≥ 44 px.
- Handbrake: a small H button next to the brake in the car (kept from today).
- All buttons ≥ 44 px, respect `env(safe-area-inset-*)`, multi-touch (steer and gas at the same time).

## Architecture

### `controls.js` (new, pure)

One table that is the single source of truth for which input triggers which action in which context. No DOM, no
three.js, so `node --test` imports it.

- Contexts: `car`, `foot`, `indoors`, `heli`, `train`, `lift`.
- Each entry: `{ action, keys: ['KeyZ'], hold: bool, core: bool, touch: 'button'|'menu'|null, label: stringKey }`.
- Exports:
  - `actionFor(context, code)` → action name or null (used by the keydown dispatcher).
  - `barEntries(context, contextAction)` → the key bar entries, core ones first.
  - `menuEntries(context)` → the phone ☰ list.
  - `conflicts()` → list of (context, key) pairs mapped twice; must be empty.
- The help panel (F1) and the command search keep their markup in `index.html`; their rows for changed keys are
  updated to the new bindings. Generating them from the table is out of scope.

### Wiring

- The keydown dispatcher in `index.html` (`addEventListener('keydown', …)`, today the long `if (e.code === …)` chain)
  asks `actionFor` for the signal keys, nitro and the context key; the remaining branches stay as they are in this
  issue. Car nitro reads `keys.ShiftLeft || keys.ShiftRight || keys.KeyN`.
- `foot.js footKeyAction`: `KeyB` no longer returns `leave`; `KeyE` returns `enter` outside and `leave` indoors.
- A small `contextAction()` in `index.html` reports the current context key action (from `enterPrompt`, `INT.indoors`,
  the lift state) for the key bar and the phone context button.
- Touch: a new `touch.js` turns joystick and buttons into the same `keys[...]` writes / action calls as the keyboard,
  so the simulation code does not know the difference.

## Phases

Too large for one pipeline run; two phases, each shippable alone:

1. **Desktop:** `controls.js` with tests, Shift nitro, Comma/Period signals, E as context key (B leave removed),
   key bar with pause-menu toggle, help rows and strings updated, CHANGELOG.
2. **Phone:** joystick, Gas/Brake/Jump, three core buttons, context button, ☰ menu, replacing `#touch`.

## Testing

- `tests/controls.test.mjs`: `conflicts()` is empty; every core action has a key in `car` and `foot`; Shift and N both
  map to nitro in `car`; Comma/Period map to the signals; E maps to enter/leave; B maps only to look-back.
- Playwright (phase 1): hold Space + Shift + B together → `P.gas`, `P.nitro` and the look-back camera are all on;
  the key bar shows the car entries, switches to the foot entries after Z, shows `E eintreten` at a glowing door;
  the pause-menu toggle hides it and survives a reload.
- Playwright (phase 2, phone viewport with touch): joystick steers, gas drives, Z button gets out, the context button
  appears at a door, ☰ lists the rest, no horizontal scroll.
- Existing tests that press Q/E for signals or B to leave a building are updated to the new keys (the behaviour they
  check stays the same).

## Out of scope

- Generating the help panel from `controls.js`.
- Touch controls for helicopter, steam loco, lift and pontoon (follow-up issue).
- Rebinding by the player (settings dialog #546).
- The tutorial itself (#534) and the "best played with a keyboard" hint (#547).
