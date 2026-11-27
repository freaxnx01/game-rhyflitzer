---
description: Visual patrol along a named route — screenshots, video, contact sheets, one vision review as a triage table
argument-hint: <route-id> [--fable]
---

Drive the patrol for `$ARGUMENTS` (#1248). Routes: `scripts/patrol_routes.json`.

1. Make your own output directory with `mktemp -d` and use only that one.
2. Run in the foreground (never in the background), with the GPU browser if reachable:
   `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 scripts/patrol.py --route <route-id> --out <dir>`
3. Dispatch exactly one review subagent with the Agent tool: `model: "sonnet"` by default, `model: "fable"` only when
   `--fable` was given, never Opus. Its prompt: "Read <dir>/review.md and follow it." plus the directory path.
4. When it returns, print `<dir>/findings.md` and the directory, then tell the user to run
   `/processing-test-feedback` on those findings. This command files nothing: no issues, no TODO.md, no code.

If you run into blockers, find a solution and update this command for the future.
