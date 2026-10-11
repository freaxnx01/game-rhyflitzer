# PR queue, pipeline and open decisions — status 2026-10-11 09:15 CEST

Session state for resume. Repo `freaxnx01/game-rhyflitzer`. Times CEST. Supersedes
`2026-10-10-pr-queue-status.md` (its standing instructions still apply, plus the ones below).

## Standing rules (memories hold the details)

- **Don't continue automatically** after a usage limit or on your own initiative — ask first.
- **Token rules** (memory `token-rules-implementation`): no Fable for big implementations (GLM
  implements, Fable only a short visual pass); local agents run node tests + ONE targeted
  Playwright file; a PR with pipeline verdict `approve` is merged without a local re-test.
- Local subagents default to **Sonnet**; Opus only for unknown causes / architecture. Max 3–4 at once.
- Every local agent: foreground tests under `systemd-run --user --scope -q -p MemoryMax=2G -p
  MemorySwapMax=0`, output to files, never broad `pkill`, first frame can take 30 s+ (#238).
- Before proposing a free key: grep ALL `prototype/*.js` (pause.js!) — memory `check-key-bindings-all-files`.
- The game stays **non-commercial** (CC BY-NC-SA Mazda model) — memory `game-stays-non-commercial`.
- Pipeline (`.github/workflows/agent.yml`): `agent: opencode`, `default-model: z-ai/glm-5.2`,
  `review-model: claude-sonnet-5`, `self-fix: true`, `OPENROUTER_API_KEY` forwarded (#185, #186, #195).
  GLM verified working (`chosen: opencode`). Design issues: labels `agent:claude` + `model:fable`.
  OpenRouter key (Passbolt „OpenRouter API Key 'OpenCode'") had $9.89 of $10 left on 10-10.
- Dispatch = post the TDD contract (scratchpad copy lost on /clear: use the "Code variant" of
  `~/.claude/commands/gh/implementation-contract.md`), then labels `ai-implement` and
  `ai-review-human-merge` (separate calls). Plans need `### Task N:` headings.

## Running at save time

| What | Where | Expected |
|---|---|---|
| #47 region south: fix the 8 m Fricktalstrasse drape step (0.24 m vs 0.20 m bound, keep strict), then Tasks 9–10 (build, sizes, load/frame, screenshots), merge PR #243, test-todo block to main | local Opus agent | PR #243 merged or a stop report |
| #242 cave system (#201): GLB committed by me (`1ecb71f`); agent fixes `Math.min(...)` spread, restores the shrunk hilltop test, makes GLB tests pass, one screenshot, merge | local Sonnet agent | PR #242 merged |
| #240 change vehicle (#189): pause-close while swapping, `innerHTML`→`textContent`, merge | local Sonnet agent | PR #240 merged |
| Enrich #215, #214, #216, #217 (Rhine/underwater) | local Sonnet agent | plans on the issues, no dispatch |
| Re-review of #244 (#225), #245 (#222), #246 (#210) — first review failed on the Claude limit | pipeline jobs re-run | verdicts on the PRs |

Check each on GitHub first (`/whats-live`, PR comments).

## Next, in order

1. Results of the above. For #244–246: `approve` → merge (token rule 3); else a local Sonnet fix.
2. Rhine batch plans: show [needs maintainer] items, then dispatch the GLM-ready ones.
3. After #47 merged: #205 (food truck to its real spot, now inside the map) then #229 (canal
   ribbons off roads) — both **local** world rebuilds, one after another; decisions are recorded on
   the issues.
4. #201 polish: a short **Fable** visual pass on the cave/tower look (after #242 merged).
5. Needs enrichment, maintainer to pick: #248 dev teleport list (with #215), #249 F1 filter (with
   #190), #236 Mazda model, #196/#197 Umami, #198 cruising, #199 vehicles, #200 aircraft, #202
   walk/hover, #238 first-frame perf, many playtest issues #206–#234.
6. Editor phases: #167 (unblocked by #182) → #168 (ionos1 — ask before touching it) → #169 → #170.
7. #164 part 2 (DeLorean body loft); #19/#44 region east/west after #47.

## Today's console shortcuts for the maintainer

`(() => { const [x, z] = __mm.underwater().wreck; __mm.place(x + 8, z); })()` (boat; `wreckCar`
for the rusty car), `__mm.place(...__mm.hideout().centre)` (cave). One line at a time.

## Leftovers

- `~/LocalSend/eiffel_tower.desktop.glb` (optimised tower), `~/LocalSend/2020_mazda_3_hatchback.glb`.
- Ehrendingen region button covered by `#game-nav` (fails on main) — not filed yet.
- agent-workflow#505 filed (enrich on GLM idea).
