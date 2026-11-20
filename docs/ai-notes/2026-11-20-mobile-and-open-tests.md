# Status 2026-11-20: mobile fixes live, waiting on user tests

## Standing rules
- Merge or dispatch only with the user's go (AskUserQuestion). Answers are in German with real umlauts and the capitalized "Du", leading with **`TL;DR:`**.
- GitHub uses only the direnv PAT. Run `eval "$(direnv export bash)"` in the main repo dir, which also sets `PW_CDP_ENDPOINT` for the GPU browser.
- Playwright tests: targeted runs only, in the foreground. Local SwiftShader is too slow for the lobby tests, so CI decides.
- Dispatch routing: size:S/M goes to `model:glm`, size:L to `agent:claude` + `model:opus`. Local subagents use Sonnet.

## Done 2026-11-18/19 (all merged and live on rhyflitzer.ch)

| PR | Change |
|---|---|
| PR#1066 | #323: free CPU geometry (fixes the iPhone loading loop) |
| PR#1072 | #1065: GPU memory |
| PR#1070 | #1069: FPS and memory in the debug panel |
| PR#1075 | #1071: phone menu opens scrolled to the end, so the first tap works |
| PR#1079 | #1076: installable PWA (fullscreen, reload buttons) |
| PR#1081 | #1080: iPhone "Zum Home-Bildschirm" hint |
| PR#1087 | Multiplayer name field: `#mp .btn{width:100%}` squeezed the field to 22 px beside the dice; fixed and verified live |

- freaxnx01.github.io: `docs/mobile-readiness.md` and the skill `.claude/skills/mobile-readiness`.
- Android install works after removing the old shortcut and clearing site data (see memory).

## Open
1. The user tests the iPhone hint (#1080) on their colleague's iPhone.
2. The user runs the multiplayer test (PC + Chromebook race, ranking, rematch). After the report and the user's go, close #836, #837 and #838.
3. game-barrel-shooter#50 (iPhone hint for Barrel Blast) still needs enrichment, best done in a barrel-shooter session.
4. #971 and #951 are not enriched. Don't start them unless the user asks.
5. Untracked files in this worktree (`b.mjs`, `q.mjs`, `*.txt`) predate the session and are not ours. Leave them alone.
