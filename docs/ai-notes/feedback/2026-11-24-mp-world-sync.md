# Feedback 2026-11-24: multiplayer world sync

status: done

| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link | Status |
|---|---|---|---|---|---|---|---|
| 01 | A pontoon bridge laid by one player is not visible to the other players | | area:multiplayer (+ area:world) | New feature | Issue (#1190) | No net message carries pontoon state (`netcodec.js` has no pontoon; `PONTOON` in `index.html:1443` is local only). Not covered by any open issue. | done |
| 02 | Objects knocked over by P1 should fall over for P2 too | | area:multiplayer | New feature | Issue (#1191) | #1112 synced only the knock sound, at the remote car's position (spec A1/A5); the prop's state stays local. No open issue. | done |

## Raw notes

- [#01] Pontonbrücke ist für andere Spieler nicht sichtbar
- [#02] Wenn P1 was umfährt soll es für P2 sichtbar sein
