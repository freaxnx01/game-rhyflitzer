## Resume: PR queue after the 2026-10-08 feedback batch (#134, #135, #136, then #132)

Read `docs/ai-notes/2026-10-08-pr-queue-status.md` first — it lists what was merged today and the open items in order.

**Next step:** check whether the user has merged PR #134 (Tab) and PR #136 (trees); once #136 is merged, dispatch #132
(front wheels) with `/gh:implement 132`. Then finish PR #135 (stations): rebase onto main keeping both `test-todo.md`
sections, run `test_smoke.py` and `test_autopilot.py` in the foreground (memory-capped, split with `-k`), post the
results, mark it ready. Use `superpowers:subagent-driven-development` for any implementation. Never merge without the
user's go.
