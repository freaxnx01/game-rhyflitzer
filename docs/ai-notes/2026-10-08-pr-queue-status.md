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

1–3. Done 2026-10-08 afternoon: PRs #134, #136, #135 merged (each rebased, `test-todo.md`/CHANGELOG kept both
   sides, affected tests re-run). #132 dispatched (`ai-implement` + `ai-review-human-merge`, code contract posted).
4. Holzbrücke regression filed as **#137** (bisected to #122, the true-to-size car). Needs enrichment.
5. **Housekeeping**: 5 leftover subagent worktrees under `.claude/worktrees/agent-*` (reviews/enrich, all pushed or
   read-only) can be removed with `git worktree remove` + `git branch -D worktree-agent-*`.
6. ~~Regression on main~~ → #137.: `test_smoke.py::test_car_slides_along_holzbruecke_rails`
   fails on main 9e13daf — `assert r["bridge"]`, car ends at x=-1130.4 z=-78.5 y=-1.2 (dropped off the deck).
   Likely from #121/#122/#133 (merged today). Ask the user whether to file it.
7. **Old feedback batch** `docs/ai-notes/feedback/2026-10-02-stuck-car.md` is still `awaiting-approval` — ask the user
   whether to resume it (`/processing-test-feedback` resumes it).

## Notes

- The pipeline's own AI review is unreliable (timeouts, non-JSON → block, diff-size cap). Expect to run `/gh:review`
  here for agent PRs; it worked once (#133) and gave valid `request_changes` twice (#134, #136).
- Browser tests: never the full ~2 h suite for a small change; run the files the change can reach.
- `gh`/`git push` work with the direnv `GH_TOKEN` PAT (expires 2027-01-03); never unset it.
