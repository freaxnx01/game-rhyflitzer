# Viewpoint hunt: make clear that X takes the photo (#660)

## Goal

In the viewpoint hunt (mode `view`, #508) the player must understand three things: at the viewpoint a photo with **X** is needed, the named thing is the **sight** to face, and driving off without a photo leaves the viewpoint open.

## Today

- `viewTarget` (`index.html:4458`) returns `view: 'aim'` while the player stands at an open viewpoint; the HUD line (`index.html:4985`, `$('cpname')`) then shows `viewAimTarget`: `Ziel: DSM-Kamin · X` / `Aim at: DSM-Kamin · X` (`strings.js:150`, `:660`). "Ziel" reads as the navigation target.
- Nothing announces arrival and nothing happens on leaving without a photo. `standingAt` (`viewpoints.js:44`) skips viewpoints already shot, so "standing at an open viewpoint" is exactly the pose range where X scores.
- The arrow (`#arrow`) already points at the subject while standing at the viewpoint (`R.target = subject`), so it is the direction hint.
- Toasts: `toast`/`toastHtml` (`index.html:4433`), one `#toast` element (`:31`), durations `TOAST_S` (`:4428`).

## Decisions

| Topic | Decision |
|---|---|
| HUD line | `viewAimTarget` becomes `Photo (X): <subject>` (en) / `Foto (X): <subject>` (de). Drops "Ziel"/"Aim at". |
| Arrival | On the transition "not at an open viewpoint" to "at open viewpoint i", one big toast, `TOAST_S.surprise` (10 s): en `You are here! Face <subject> (follow the arrow) and press X for the photo` / de `Du bist da! Schau zu <subject> (folge dem Pfeil) und drück X für das Foto`. Subject = `subjectN`. |
| Big toast | New `toastBig(text, secs)`: adds class `big` on `#toast` (font-size 34px, `max-width` unchanged). `toast`/`toastHtml` remove the class, so no other toast is affected. |
| Leaving | On the transition "at open viewpoint i" to "not at i" while `VIEW_RUN.shot[i]` is still false, one toast (`TOAST_S.event`, 5 s): en `No photo of <viewpoint> yet: go back and press X` / de `Noch kein Foto von <viewpoint>: zurück und X drücken`. Viewpoint = `n`. A photo taken at i (also a mis-aimed one that scored 0) does not count as shot until it scores, so a leave after a miss still reminds. |
| Flicker | A per-viewpoint cooldown of 8 s between two notices (any kind) at the same viewpoint, so GPS-style edge flicker at the radius cannot spam. |
| Direction hint | The existing `#arrow` plus "(follow the arrow)" in the toast. No new 3D marker, no new HUD element. |
| Where | State machine is pure in `viewpoints.js` (`viewNoticeStep`), unit-tested with `node --test`. `stepView` calls it, shows the toast. No touch of the keydown dispatcher, the key bar or `#tc` layout (PR#647 collides there). |
| Intro | `viewIntro`/`viewStart` stay as they are (they already say X); the in-situ prompts are the fix. |
| Not shown | When `R.state` is `finished`, or the game is paused (stepView does not run). Not in other modes. |

## Acceptance criteria

- At an open viewpoint the HUD line reads `Foto (X): <subject>` (de) / `Photo (X): <subject>` (en); the word "Ziel" does not appear in view mode.
- On arriving at an open viewpoint a big toast names the subject and says to press X, de and en.
- On leaving an open viewpoint without a scoring photo a toast names the viewpoint and says to go back and press X.
- No notice for viewpoints already shot; no notice spam at the radius edge (cooldown 8 s).
- `toast`/`toastHtml` toasts keep their normal size.
- `viewNoticeStep` is unit-tested; de and en strings both exist.

## Assumptions

- **A1** [high] Reuse `#arrow` as the direction hint. Rejected: a new 3D marker. `index.html:4985` already rotates it to the subject while standing at the viewpoint.
- **A2** [med] Notice wording as above (issue gives examples); the viewpoint name `n` is used on leaving instead of "der Plattform" because names are proper names and never inflected (`viewpoints.js:5`).
- **A3** [med] Cooldown 8 s, toast 10 s. Rejected: re-showing the arrival toast until a photo; the persistent HUD line covers "while no photo is taken".
- **A4** [high] Intro texts unchanged. Rejected: longer intro; the issue says it is overlooked anyway.

## Consequences

- `tests/` and the earlier spec `2026-10-31-viewpoint-hunt-design.md:67` still quote "Aim at: <subject> · X"; that spec is history and is not edited.
- One extra `#toast` style variant (`.big`).
