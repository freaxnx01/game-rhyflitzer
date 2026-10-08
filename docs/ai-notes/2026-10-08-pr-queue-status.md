# PR queue status — 2026-10-08

Session state for resume. Issues and PRs live in `freaxnx01/game-rhyflitzer` unless noted.

## Done today

- Merged: #121 (trough walls + world rebuilt with 18 railway bridges, closes #119/#76), #122 (true-to-size car, #69),
  #133 (dark opaque car windows shared with the helicopter, #123). All live on GitHub Pages.
- Feedback batch `docs/ai-notes/feedback/2026-10-08-tab-station-trees-wheels.md` → #129–#132, enriched (quick) and
  #129–#131 dispatched.
- 9 topic labels `area:{vehicles,world,region,modes,navigation,camera,audio,ui,debug}` on every open issue.
- agent-workflow#490 (milestone `auto-lane-v1`): pipeline review gives a false `block` on non-JSON output and on a
  one-line-JSON diff over the 320 KB cap. The 10-minute review timeout is tracked there as #446/#449/#372.

## Open — in this order

1. **PR #134 (#129, held Tab moves focus)**: pipeline review's `request_changes` fixed (`jumpKey` prevents Tab; the
   J-dialog test asserts focus stays on `#jumpq` and value `sisx`), rebased on main, `MERGEABLE CLEAN`, ready.
   → **The user merges.**
2. **PR #136 (#131, solid trees)**: review fixed (`treeCollider` sets `low: true` so trunks only count up to the
   crown top; new above-the-crown test; drive test proves arrival), rebased, `MERGEABLE CLEAN`, ready.
   → **The user merges.**
3. **#132 (front wheels turn when steering)**: enriched, NOT dispatched. Dispatch with `/gh:implement 132` only
   **after #136 is merged** (both edit the car and collision code in `prototype/index.html`).
4. **PR #135 (#130, stations beside the tracks)**: rebased onto main 9e13daf (`test-todo.md`: both sections kept),
   verified — node 135/135, `test_anchors.py` 11/11, `test_autopilot.py` 15/15, `test_smoke.py` 24/25; results
   posted, marked ready, `MERGEABLE CLEAN`. → **The user merges.**
5. **Housekeeping**: 5 leftover subagent worktrees under `.claude/worktrees/agent-*` (reviews/enrich, all pushed or
   read-only) can be removed with `git worktree remove` + `git branch -D worktree-agent-*`.
6. **Regression on main (discovery, not yet an issue)**: `test_smoke.py::test_car_slides_along_holzbruecke_rails`
   fails on main 9e13daf — `assert r["bridge"]`, car ends at x=-1130.4 z=-78.5 y=-1.2 (dropped off the deck).
   Likely from #121/#122/#133 (merged today). Ask the user whether to file it.
7. **Old feedback batch** `docs/ai-notes/feedback/2026-10-02-stuck-car.md` is still `awaiting-approval` — ask the user
   whether to resume it (`/processing-test-feedback` resumes it).

## Notes

- The pipeline's own AI review is unreliable (timeouts, non-JSON → block, diff-size cap). Expect to run `/gh:review`
  here for agent PRs; it worked once (#133) and gave valid `request_changes` twice (#134, #136).
- Browser tests: never the full ~2 h suite for a small change; run the files the change can reach.
- `gh`/`git push` work with the direnv `GH_TOKEN` PAT (expires 2027-01-03); never unset it.
