# Surprise text longer (#218) — design

When a present is collected, `collectPresent` shows `presentToast` (count + surprise line) with `TOAST_S.event` (5 s). Kids need longer.

## Behaviour

- New `TOAST_S.surprise = 10` (s). `collectPresent` uses it for the present toast. `huntStart` and `endHunt` toasts keep `TOAST_S.event`.
- The next present's toast replaces the current one (single `#toast`), so nothing stacks.
- Key-press and other event toasts are unchanged (4 s / 5 s, #75).

## Assumptions

- **A1** [high] Only the present toast gets longer. Rejected: raising `TOAST_S.event` globally; checkpoint/water toasts would linger. `index.html` `const TOAST_S` is the one table.
- **A2** [med] 10 s. Rejected: 8 s; kids reading slowly, and the toast is small at the top.
- **A3** [high] Not dismissible. The next present replaces it; no input needed.

## Needs maintainer

- **[needs maintainer]** Duration. Default: 10 s.
- **[needs maintainer]** Also lengthen the hunt start text ("Find the 5 presents")? Default: no, it is not the surprise text.

## Consequences

- A turbo (6 s) surprise toast now outlasts the turbo; moon (10 s) matches it.
