# PR queue and region editor — status 2026-10-10 10:40 CEST

Session state for resume. Repo `freaxnx01/game-rhyflitzer`. Times CEST.

## Standing user instructions (this session)

- **Review and merge open PRs in subagents.** Each agent: rebase onto main, fix review findings
  test-first, run the tests the change can reach (foreground, `systemd-run --user --scope -q -p
  MemoryMax=2G -p MemorySwapMax=0`, pytest via `pipeline/.venv/bin/python`), then `gh pr merge
  --squash`. Never `--admin`. Not green after 3 attempts → stop and report.
- At most 3–4 local subagents at once. Model per task: Sonnet simple, Opus architectural / unknown
  cause, **Fable for UI/graphics/design**. Enrich prompts: no dry runs, `### Task N` headings
  (pipeline sizes its turn budget from them), no `//` comment mid one-line statement in
  `prototype/index.html`.
- Frame-bound browser tests time out on this loaded box: fix with a test hook that reaches the end
  state in fewer frames (`blitzSetLeft`, `huntSetEndIn`), never by loosening assertions.
  `--disable-accelerated-2d-canvas` speeds up 2D-canvas pixel reads.
- Never a broad `pkill` (one agent killed another agent's browser).
- Repo setting `delete_branch_on_merge` is now **on**.
- Skill `/whats-live` (local, `~/.claude/skills/whats-live/`) reports live/running/topic status in
  local time.

## Running when this was saved (results land on GitHub)

| What | Where | Expected outcome |
|---|---|---|
| #180 food truck (#103): review, rebase, merge | local subagent | PR #180 merged or a comment why not |
| #156 side roads (#120): option (a) shared-trough exclusion in `test_no_open_cut_faces` + 5 spots, merge | local subagent | PR #156 merged or a comment |
| Editor API contract reconciliation #167/#168/#169 (+ `exists`/`id` in `/api/preview`, admin over SSH only in #168/#170) | local subagent | docs commit `docs(spec,plan): align editor API contract …` on main |
| #164 realistic cars (procedural, compact first) | pipeline (since 09:36) | a PR |

Check each on GitHub first (`/whats-live`, PR comments, `git log origin/main`).

## Next, in order

1. **PR #182** (#176, XSS escaping; security prerequisite for #167): pipeline review timed out →
   manual review + merge in a subagent.
2. **PR #181** (#166, editor phase 1, `build_world`): pipeline review `request_changes` → fix + merge.
3. Then **dispatch #179** (automatic race; plan inlined, depends on #166 merged).
4. **#164's PR**: review + merge when it lands.
5. Editor phases, after their prerequisites: **#167** (needs #176) → **#168** (needs #166; then the
   operator checklist on ionos1: secrets B2 admin token + B4 ALTCHA key in Passbolt + Docker
   secrets, `.env`, compose entry in `mydocker-compose`, Cloudflare A record
   `rhyflitzer-api.freaxnx01.ch` → 82.165.65.143 unproxied; ask the user before any of it) →
   **#169** → **#170**.

## Region editor (spec `docs/superpowers/specs/2026-10-09-region-editor-design.md`)

Decisions: public + anonymous; Switzerland only (v1); one rectangle 1×1–4×4 km snapped to 250 m;
everything on **ionos1** (VPS DE); share link kept 30 days after last play, zip download/upload,
curated gallery; store cap 10 GB (least-recently-played evicted first, gallery exempt); auto race +
J list; **ALTCHA** proof-of-work on new builds only (cache hits exempt); hostname
`rhyflitzer-api.freaxnx01.ch` confirmed; **admin endpoints over SSH only** (not routed by Traefik,
token as second layer).

| Phase | Issue | State |
|---|---|---|
| 1 pipeline library | #166 → PR #181 | request_changes |
| 1b race | #179 | plan ready, after #166 |
| XSS prerequisite | #176 → PR #182 | review timed out |
| 2 game `?world=`, zip | #167 | enriched |
| 3 API on ionos1 | #168 | enriched (ALTCHA, `/api/preview`) |
| 4 editor page | #169 | enriched (Leaflet + swisstopo WMTS) |
| 5 gallery | #170 | enriched (reuse #168's admin routes; note on the issue) |

Plans: `docs/superpowers/plans/2026-10-09-region-editor-phase1.md`, `…-phase1-race.md`,
`2026-10-10-region-editor-phase2.md`, `…-service.md`, `…-page.md`, `…-phase5.md`. Issue bodies of
#168/#169 shorten some test listings to names (65,536-char limit); the plan files are complete.

## Open bugs / follow-ups filed this session

#147 Kapfstrasse step · #174 Maps link button not clickable (test fails on main) · #178 key toast
overlaps debug panel on phones (test fails on main) · #143-style frame-bound tests.

## Leftover branches (kept on purpose)

`assets/45-row-house-screenshots`, `feature/8-osm-props`: unique commits, issues #45/#8 closed;
probably obsolete, ask before deleting.
