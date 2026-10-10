## Resume: PR queue + region editor (2026-10-10 morning)

Read `docs/ai-notes/2026-10-10-pr-queue-status.md` first: standing instructions (review and merge open PRs in subagents, model choice, test rules), what was running at save time, and the editor status.

**Next step:** check on GitHub (run `/whats-live` and `/whats-live editor`) what the running agents finished (#180, #156, the editor contract docs commit, #164's PR). Then, in subagents: manual review + merge PR #182 (#176 XSS), fix + merge PR #181 (#166 editor phase 1), then dispatch #179 (race). Use `superpowers:subagent-driven-development` for any implementation. Ask the user before touching ionos1 (operator checklist in #168).
