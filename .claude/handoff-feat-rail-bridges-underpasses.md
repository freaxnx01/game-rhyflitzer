## Resume: #76 rail bridges — Task 3 re-applied from the plan, clearance 15 cm short

Work in the worktree on branch `feat/rail-bridges-underpasses` (PR #117, draft). Read the status note
`docs/ai-notes/2026-10-06-rail-underpass-status.md` first, then the plan
`docs/superpowers/plans/2026-10-03-rail-bridges-underpasses.md` (Tasks 3–5).

**Next step:** fix `makeCut`'s `roadMax` in `prototype/index.html` so it matches the drawn road ribbon (edge heights +
bulge lift, see the note), get `prototype/tests/test_underpass.py` green (clearance ≥ 4.45, railGap < 0.3), then Task 4
(regression suite, changelog, TODO) and Task 5 (local world rebuild), update PR #117, merge. Use
`superpowers:subagent-driven-development` for any implementation. Run `gh`/`git push` with `unset GH_TOKEN`.
