# #76 rail bridges / underpasses — status for resume (2026-10-06)

Plan: `docs/superpowers/plans/2026-10-03-rail-bridges-underpasses.md` (also inlined in issue #76).
PR: #117 (draft), branch `feat/rail-bridges-underpasses`.

## Where it stands

- **Task 1 (pipeline `railBridges`)** and **Task 2 (`world.js` helpers)**: done by the pipeline run, correct per the plan.
  Fixed: the `cutBounds` unit test compared `-55.00000000000001` exactly — now a 1e-9 tolerance. `node --test`: all pass.
- **Task 3 (game integration)**: the pipeline's `index.html` was written against a different helper API (automated
  review on #117: `block`, every call site mismatched). It was **reset to `main` and re-applied from the plan's
  Steps 3–10 verbatim** (import, `RAIL_DECKS`, `meshH`/`terrainH` patch lookup, `makeCut`/`buildCuts`, ground mesh
  patches with `groundCol`, rail deck drawing, rail lines for `railDist` + minimap, debug hooks `crossings`/`cutDepth`/`rayHits`).
  The hero grouping allowlist (Step 8a) was already on `main` (#78). `test_underpass.py` equals the plan's file.
- **Uncommitted before this handoff; committed with it as WIP.**

## The one open problem: clearance 15 cm short

`test_underpass.py` now finds both Laufenburgerstrasse crossings (depth 2.47 / 2.66 m, railGap 0.20–0.24 ✓) but
`clearance` is **4.30 m** instead of ≥ 4.45.

Measured (cut 1): uncut `meshH + 0.04` ≈ 15.60 along the road; cut floor (`terrainH`) ≈ 12.9–13.1 (= 15.6 − 2.47 ✓);
but the **drawn road** `roadSurfH` is **13.44–13.84**, i.e. 0.5–0.75 m above the floor, not 0.04. Deck surface 19.13.

Cause: `makeCut` sizes `roadMax` from the centre line (`meshH + 0.04`), but the road ribbon (`ribbonGeo`, onTerrain)
takes each **edge's own terrain** (`hl`/`hr`) plus a per-4 m-segment **bulge lift** (`up`). Tried: sampling `meshH`
at centre ± hw → overshoots (depth 4.1, clearance 5.8, and railGap 1.5 because the deeper cut lowers the deck ends'
ground). So the ribbon's lift is smaller than the full edge difference.

**Next:** read the actual ribbon heights at the crossing (`ROAD_SURF.get(c.road).hl/hr` vs `meshH`) to model exactly
what `ribbonGeo` adds, then size `roadMax` with that rule (e.g. edge terrain + the same bulge rule) — or, simpler,
compute `roadMax` from `(hl + hr) / 2 + up` by building the road's ribbon heights on the uncut mesh. Keep the
railGap < 0.3 (the deck ends must not lose their ground). Then: `test_underpass.py` green → Task 4 (regression
suite, changelog, TODO) → Task 5 (local world rebuild with `--dsm-heights`, verify the diff only adds `railBridges`
and moves those pieces out of `rail`) → update PR #117 body, merge.

## Session notes
- `GH_TOKEN` in the session env is invalid: run `gh`/`git push` with `unset GH_TOKEN` (stored gh login works).
- Browser tests: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest ../prototype/tests/test_underpass.py -q -s` (foreground, ~90 s).
- In flight elsewhere: #106 (Navi) dispatched to the pipeline; #107 waits on #106.

## Outcome (2026-10-07)

- Clearance: `makeCut` sizes the cut on the road's own ribbon (built on the uncut mesh), not `meshH` on the centre line —
  Laufenburgerstrasse's ~2.2 m cross slope put the drawn centre ~0.5 m higher.
- railGap: `UNDERPASS.bank` 2 → 1; at depth 3.1 a 1:2 bank reached the deck's east ends 10.85 m from the road.
- `test_underpass.py` green on main's world (injected Laufenburgerstrasse); golden 16 passed; targeted smoke regression green.
- World **not** rebuilt in #117: on the rebuilt world 9 of 16 crossings need 5–6 m cuts and fail railGap even with 1:1
  banks. Abutment walls + rebuild + changelog moved to #119.
