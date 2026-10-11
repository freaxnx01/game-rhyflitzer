# "Diesen Lauf abbrechen?" dialog fits its title (#223)

## Problem
`.panel h1` is `clamp(40px,8vw,72px)` Bungee. The abandon panel is capped at 420 px (`#pause .panel,#abandon .panel{max-width:420px}`), content width 354 px. At 72 px the word "ABBRECHEN?" is ~500 px wide, so on desktop the title wraps to three lines and the last word runs out of the panel on the right (screenshot in the issue, 1280+ px viewport). The phone test (360 px) passes because 8vw clamps to 40 px there. Reproduced by arithmetic plus the issue screenshot; a headless Playwright repro was too slow under swiftshader and is not needed to pin the cause.

The two buttons "Abbrechen" / "Verwerfen" are ambiguous under that title (does "Abbrechen" abort the run or cancel the dialog?).

## Design
1. CSS: `#abandon h1{font-size:clamp(26px,9vw,44px);overflow-wrap:anywhere}` (title only, "Pause" stays big). 44 px fits "ABBRECHEN?" in 354 px; 9vw keeps 360 px phones inside 262 px.
2. Wording: buttons say what they do. DE `abandonCancel` "Weiterspielen", `abandonOk` "Lauf verwerfen", `abandonHint` "Esc: weiterspielen". EN "Keep driving" / "Abandon run" / "Esc: keep driving". Title unchanged. Focus stays on the safe (first) button; Esc = first button as today.

## Assumptions
- **A1** [high] Fix is CSS scoped to `#abandon h1`, not a shorter title. Rejected: shortening the title; the long word is the problem only at 72 px (`.panel h1` rule in `prototype/index.html`).
- **A2** [med] Rename the buttons (issue asks for it implicitly). Rejected: leave wording. Listed as [needs maintainer] with this default.

## [needs maintainer]
- Button wording: default "Weiterspielen" / "Lauf verwerfen" (EN "Keep driving" / "Abandon run").
