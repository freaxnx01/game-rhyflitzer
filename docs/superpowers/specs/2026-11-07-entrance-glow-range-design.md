# Entrance glow visible earlier (#702) — design

## Problem

A tutorial tester saw the entrance glow (the Plattform door) too late.

- `enterables.js:8` sets `GLOW_RANGE = 15`, and `glowStrength(d)` (`enterables.js:83–86`) smoothsteps from 0 at 15 m to 1 at `PROMPT_RANGE` 2.5 m. At 10 m it is still faint.
- The tutorial's jump step counts a jump within `TUT.jumpNearM = 60` m of the Plattform (`tutorial.js:5`, `index.html:4906`). The next step is `getOut`, so the player often stands 20 to 60 m from the door, where nothing glows.

## Decision (maintainer)

- **`GLOW_RANGE = 60`** for every enterable. That matches the tutorial's jump radius.
- Only two entrances can glow today: Plattform Sisslerfeld and Bodenackerstrasse 6c. The hideouts are `ready: false` and secret. The only other user of `GLOW_RANGE` is the search radius of `nearestEntrance` (`index.html:4082`), and the E prompt still opens only within `PROMPT_RANGE` (`enterPrompt`), so the larger radius changes nothing else.
- **Early curve:** `glowStrength(d) = smoothstep(sqrt(t))` with `t = clamp((GLOW_RANGE − d) / (GLOW_RANGE − PROMPT_RANGE), 0, 1)`. This keeps 0 at the edge, 1 at 2.5 m, and strictly falls with distance in between. The glow rises early:

  | Distance | Strength |
  |---|---|
  | 55 m | ≈ 0.21 |
  | 50 m | ≈ 0.38 |
  | 40 m | ≈ 0.63 |
  | 30 m | ≈ 0.81 |
  | 20 m | ≈ 0.93 |
  | 10 m | ≈ 0.99 |

- The optional tutorial arrow from the issue **already exists**: during `climb`, `R.target` points at the Plattform viewpoint (`index.html:4920`). Nothing to add.

## Testing

- **`tests/enterables.test.mjs`**:
  - Update the existing `glowStrength` test to 60 m (0 at ≥ 60, 1 at ≤ 2.5, strictly monotone).
  - New test: `GLOW_RANGE >= TUT.jumpNearM`, with `glowStrength(50) > 0.3` and `glowStrength(30) > 0.75`.
- **`tests/test_on_foot.py::test_a_ready_entrance_glows_on_foot_only`**:
  - The old `far` probe at 20 m now glows. Assert it as `early` (opacity > 0.5).
  - A new `far` probe at 65 m must be `[]`.

Run only these two files.
