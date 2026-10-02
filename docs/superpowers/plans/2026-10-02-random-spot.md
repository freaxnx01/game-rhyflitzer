# Random spot in the J menu (#21) — Implementation Plan

**Goal:** The J jump menu gets a last entry "0 · Random spot". Picking it (key `0`/`Numpad0` or a click) puts the car on a random drivable road point anywhere in the map.

**Architecture:** One new function `randomSpot()` next to `jumpTo()` in `prototype/index.html`. It picks a road segment weighted by length from the same set `jumpTo` uses (no bridges, no `motorway`/`motorway_link`), a uniform point on it and a heading along the segment in a random direction, then goes through the same tail as `jumpTo`: `P.safe = [...]`, `resetCar()`, `R.jumped = true` during a race, close the menu, toast.

**Tech:** vanilla JS in `prototype/index.html`; Playwright smoke tests in `prototype/tests/test_smoke.py`.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Match the surrounding style: `prototype/index.html` is dense one-line functions; keep `randomSpot` in that idiom and share the placement tail with `jumpTo` instead of duplicating it.
- No new files besides this plan; no new dependencies.
- Run tests with the main checkout's venv under a memory cap:
  `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 ../../pipeline/.venv/bin/python -m pytest -q prototype/tests/test_smoke.py`
  Run in the foreground, never in the background.
- Commits reference #21, Conventional Commits, scope `prototype`.

## Task 1 — "0 · Random spot" in the J menu

**Files:** `prototype/index.html` (jump menu markup line ~117, keydown handler ~779, `jumpTo` ~810, menu list ~876–877), `prototype/tests/test_smoke.py`, `CHANGELOG.md`.

1. **Failing test** — add `test_jump_menu_random_spot(server)` to `test_smoke.py` (skip if `WORLD` missing, same as `test_nitro_and_jump_menu`). Start the race, then three times: press `KeyJ`, press `Digit0`, read `window.__mm.car()`, `window.__mm.roadDist()`, whether `#jump` is hidden. Also assert the last `#jump li` text contains "Random spot" and `window.__mm.raceFlags().jumped` is true afterwards. Assert: every placement has `roadDist < 0` (on the driving surface), menu closed, and the three positions are not all within 50 m of each other (randomness; the network is kilometres wide). Run it — expect FAIL.
2. **Implement:**
   - Markup hint text: `1–9, 0 or click · J / Esc closes`.
   - Extract the shared tail of `jumpTo` into a small helper (e.g. `placeOnRoad(x, z, th, name)`), used by both `jumpTo` and `randomSpot`.
   - `randomSpot()`: collect eligible segments with their lengths, draw `Math.random() * total`, walk to the segment, `t = Math.random()`, heading `atan2(dz, dx) + (Math.random() < 0.5 ? 0 : Math.PI)`, call the helper with name `Random spot`.
   - Keydown: in the open menu `Digit0`/`Numpad0` → `randomSpot()` (extend the existing `^(Digit|Numpad)[1-9]$` branch, don't add a parallel one).
   - Menu list: append `<li value="0">Random spot</li>` after `PLACES` and wire its click to `randomSpot`.
3. Run the new test — expect PASS. Then run the **whole** `prototype/tests/test_smoke.py` plus `pipeline` tests — all green (the existing `test_nitro_and_jump_menu` must still pass unchanged).
4. **Help text:** if the F1 help lists J as "jump to a place", leave it; no change needed.
5. **CHANGELOG** under `[Unreleased]` → `### Added`, player voice, e.g. "The **J** menu has a new entry **0 · Random spot**: it drops the car on a random road somewhere on the map (during a race that counts as a jump)."
6. Commit: `feat(prototype): random spot in the J jump menu (#21)`.
