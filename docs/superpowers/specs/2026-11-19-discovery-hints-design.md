# Discovery hints: show new players what the game can do, one hint at a time, design

**Status:** brainstormed with the maintainer on 2026-11-19, approved in chat. Issue #1090; touch controls for heli and loco split out to #1091.

## Why

The NFZ newspaper article will bring players who have never seen Rhyflitzer. The tutorial teaches only the basics: drive, brake, checkpoints, nitro, jump, get out, climb the Plattform, take a photo and get back in. Everything else stays invisible to them:

- the helicopter
- the steam loco
- the Postauto timetable
- the depot
- the pontoon bridge
- the Crash-Platz
- the game modes
- the hideout

**Success:** in the first minutes a new player notices how much there is and feels like exploring.

**Anti-goal:** a wall of text, or a long mandatory tutorial before the first drive. A player who feels lectured clicks away.

## Goals

- **Hints in the running game**, at the moment a feature fits (place, time or event), not up front.
- A hint **stays long enough to read**, and it is **tappable**. A tap does what the key does, so nobody has to know the key the first time. This also has to work on a phone.
- **Each hint once.** It never repeats after it was acted on or dismissed.
- Players can **switch hints off**.

## Non-goals

- **Touch controls for flying the helicopter and driving the loco.** Today on a phone the heli takes off through the ☰ menu but cannot be steered, and the loco has no steam or brake. That is #1091. Until it ships, the heli and loco hints are **not shown on touch devices**.
- A video tutorial.
- Changing the existing tutorial.
- A help overlay for touch. Today F1 and Ctrl+P have no touch route. That is a separate topic, noted here only.

## Facts on main (recon 2026-11-19)

- **Tutorial**
  - `tutorial.js` holds the tutorial steps.
  - It only exists for Hochrhein.
  - It is stored as done in `mm.tutorialDone`.
  - It hides `#keybar` while it runs.

- **Key bar** (`controls.js` `barEntries`, `stepKeybar`)
  - It shows the keys for the moment and fades to a ghost after 30 s (`hudfade.js`).
  - It is **hidden on touch** (`@media (pointer:coarse)`).
  - Setting: `mm.keybar`.

- **Toasts**
  - There is one `#toast` element.
  - Durations come from `TOAST_S` (`info` 4 s, `event` 5 s, `surprise` 10 s), and each new toast overwrites the last.
  - The radio display shares the element. `gameToastShown()` tells a game toast from the radio's.

- **Place prompts** (`#prompt`, `stepEnter`)
  - They exist for doors, the depot, Postauto stops, the Plattform hop and the pontoon (Rhine bank).
  - On touch the yellow context button `#tE` carries the same action.
  - **There is no prompt at the loco.** Today you must know to walk up and press Z.

- **Touch**
  - Touch is detected only by `matchMedia('(pointer:coarse)')`, evaluated once at load.
  - Keys dispatch through `pressKey`, so a tap can trigger any key's action the same way the touch buttons do.

- **Storage**
  - There is no generic "seen" store.
  - The existing keys use the `mm.` prefix.

- **Settings dialog** (`#settings`)
  - Sections: Audio, Display (Display holds only the key bar).
  - It opens from the start screen and from the pause menu.

## Design

### The hint card

- **One new element**, separate from `#toast`, so hints and event toasts don't overwrite each other.
  - It holds an icon, one short sentence, and the key as a `<kbd>`.
  - On touch the key is replaced by "Tippen" / "Tap".
- **Tap or click on the card runs the action** through `pressKey`, the same path the touch buttons use.
  - A hint without an action (a place hint like the Crash-Platz, or the hideout wink) has no tap action. Tapping it just closes it.
- **×** closes the card, which counts as seen.
- A small link **"keine Hinweise mehr" / "no more hints"** switches hints off. It has the same effect as the setting.
- **It stays** until the player acts on it (presses the key or taps), dismisses it, or about **20 s** have passed.
  - If the time runs out, the hint does **not** count as seen. It may come back later, at most twice.
- **At most one card at a time.**

### When hints show

**Pace:** at most **one hint every 2–3 minutes**. Place hints may break that pause, because they only come when the player is actually there.

**Modes:**

| Mode | Hints |
|---|---|
| Cruise | all hints |
| Viewpoints, Surprise hunt | place hints only (no time hints: flying etc. would affect the run) |
| Time trial, Blitz, Delivery, Multiplayer | none |
| Tutorial | none (it has its own) |

- Players who skip the tutorial get hints too. They need them most.
- No hints while the pause menu, car select, the jump dialog, the map, or any other overlay is open.

**Three kinds of trigger:**

- **Place:** the player is near a spot (on foot or in the car, whichever the feature needs).
- **Time:** after some minutes of free driving in Cruise, in a sensible order (helicopter first).
- **Event:** right after something happened for the first time, such as getting out of the car for the first time.

### The hints

Starting list. The exact wording is the builder's, in `strings.js`, in en and de.

**Controls (time or event)**

- **Helicopter:** F. Time, early. Not on touch (see non-goals).
- **Jump to a place:** J.
- **Autopilot / Navi:** O / I.
- **Radio:** 5–0. On touch, the 📻 button.
- **Camera:** C.
- **Nitro:** N. Desktop only, because it has no touch route.
- **Full map:** Tab. Desktop only.
- **Photo:** X.
- **On foot:** after the first get-out, "Space jumps, F hovers".

**Places (near the spot)**

- **Steam loco:** near the loco on foot, "Z: aboard". Not on touch. It also fills the missing prompt gap.
- **Postauto stop:** "E: timetable", the first time near a stop.
- **Depot:** "every vehicle has its slot here", near the DSM car park.
- **Plattform Sisslerfeld:** the first time near it.
- **Rhine bank:** "U: pontoon bridge".
- **Holzbrücke.**
- **Crash-Platz** (Eiken): "here you may knock everything over".
- **Straussenfarm Sisseln.**
- **Bodenackerstrasse 6c:** "you can walk in here".

**Game modes**

- After a few minutes of Cruise: "There is also Blitz, Delivery, Viewpoints …". The tap goes to the start screen, or opens the pause menu if that is simpler. That is the builder's call.

**The hideout: a quiet wink**

- The hideout (Hübel) and its rooms get **no** normal hints. Finding them yourself is the point.
- Once, in Cruise, after about **one hour of total play time**, as long as the hideout is not found yet (`mm.hideout` unset): **"Im Hübel soll es etwas geben …" / "They say there's something in the Hübel …"**. It has no key and no tap action.
- After the hideout is found, hints for its features may show inside it: the Ferris wheel with 3/4 for the fireworks, and the freight lift pad.

### Settings

- **Settings › Display › Hints on/off.** Default is **on**. Stored in localStorage, with the same pattern as `mm.keybar`. Unlike the key bar row, this row stays visible on touch.
- **Settings › "Show hints again":** a button that clears the seen store. Example: a child starts fresh on the same device.
- The card's "no more hints" link switches the same setting.

### Storage

- **A seen set** in localStorage, under one key, for example `mm.hintsSeen`, holding hint ids.
- **A play-time counter** for the hideout wink. Cruise time is enough, and `mm.odo` may help.
- With storage blocked, treat everything as seen. Same rule as the tutorial: never nag.

### Calls made after the builder check (maintainer may override)

- **Touch, per hint:** on a touch device a hint is shown only if its action has a touch route today (a touch button or a ☰ menu entry, per the `touch` flags in `controls.js`), and its tap runs that same action. Hints whose action has no touch route (helicopter flight, loco, nitro, full map, F hover) are skipped on touch; the on-foot hint names only what works there. The builder checks each hint against `controls.js` and writes the result as a table in the plan.
- **Viewpoints and Surprise hunt:** only place hints that are statements (Crash-Platz, Holzbrücke, Straussenfarm, depot, Plattform, Bodenackerstrasse 6c) show there. Hints whose action leaves or taints the run (loco boarding, pontoon) are Cruise-only. Time trial has no hints for the same reason (`R.pontoon`, `R.flown` etc. mark a run unclean).
- **Regions:** control and mode hints show in every world; place hints belong to the region their spot is in (Hochrhein today) and are skipped elsewhere. Spot positions come from the same anchors/constants the features already use.
- **Places that already have a `#prompt`** (depot, Postauto stop, Plattform hop, pontoon): the card explains *what* is there in one sentence; the existing prompt keeps showing the key. The card's tap runs the same action. No suppression logic.
- **Seen store shape:** one key, `mm.hints`, a map `id → number of times shown`, plus a `seen` mark. Acted on, tapped or ×: seen. Timed out: count +1; after three showings it counts as seen. A statement hint (no action) counts as seen when tapped, closed or timed out once.
- **Play time:** a new cumulative counter across sessions (`mm.playTime`, seconds of Cruise), written at the same cadence as `mm.odo`. The hideout wink comes once it passes one hour.
- **Game-modes hint tap:** opens the pause menu (does not end the Cruise run); the pause menu's "Menu" leads on to the modes.

## Left to the builder

- Where the card sits on screen. It must not cover the minimap, the touch stick or the touch buttons. My guess is top centre on desktop, where the key bar is, and above the touch buttons on a phone.
- Its look, as long as it fits the existing HUD style.
- The exact radius for each place hint, and the order and timing of the time hints within the 2–3-minute pace.
- Whether the hint logic lives in a new module (`hints.js`, pure and testable in node, like `tutorial.js`) with thin glue in `index.html`. Recommended.
- The tests: node tests for the pure picking logic (pace, modes, seen, touch filter), and one targeted Playwright file for the card (shows, tap runs the action, × marks it seen, the setting switches it off).
