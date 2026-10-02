# Feedback triage — car toggle, Hallenbad label, debug mode

status: done

| # | Note | Att. | Topic | Kind | Disposition | Rationale / link | Status |
|---|---|---|---|---|---|---|---|
| 01 | V should also hide the car's shadow | | HUD/controls (#20, closed) | Improvement (bug) | Issue #37 | `V` sets `car.visible`, but the fake blob shadow (`blob`, own scene object) only checks water/air/eye-camera, not `HUD.carHidden`. One-line fix. | done |
| 02 | "Hallenbad Sissila" label on all 4 sides | | Sisseln landmarks (hallenbad anchor) | Improvement | Issue #38 | `hallenbad()` adds one label plane on one side only. | done |
| 03 | Debug mode: building heights in metres | | — (new) | New feature | Issue #39 | No debug mode exists (`debug` appears 0 times). Helps verify #17 / #34. | done |
| 04 | Debug mode: show coordinates as a reference point | | — (new) | New feature | Issue #39 | Same debug-mode issue; "more to come" stays open in the body. | done |

## Raw notes

- [#01] V = Hide Car AND shadow of car
- [#02] 'Hallenbad Sissila' should be labeled on all 4 sides
- [#03 #04] Introduce Debug Mode:
  - [#03] heights of buildings in meter
  - [#04] show coordinates to give you a reference point when debugging
  - [#03 #04] ... more to come
