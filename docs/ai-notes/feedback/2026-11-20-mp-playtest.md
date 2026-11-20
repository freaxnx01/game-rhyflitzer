# Multiplayer playtest with a colleague (2026-11-20)

status: done

| # | Note (short EN) | Att. | Topic | Kind | Disposition | Rationale / link | Status |
|---|---|---|---|---|---|---|---|
| 01 | Wheels don't turn when reversing (also SP?) | | area:multiplayer | Improvement (bug) | Issue | SP: `stepWheelSpin` is signed, reverse should roll back (not checked in browser). Remote cars never roll their wheels (`drawWheels` runs for the own car only → #1108 | done |
| 02 | MP, Hübel, both in the lift: sync suddenly lost | | area:multiplayer | Improvement (bug) | Issue | cause unknown, needs a repro (lift/levels vs pose stream → #1109 | done |
| 03 | Switch game mode in MP without re-joining | | area:multiplayer | New feature | Issue | `toMainMenu` calls `netLeave()`; the session only knows cruise/rac → #1110 | done |
| 04 | Game already open in a tab + invite link clicked = full reload | | area:multiplayer | Improvement | Issue | `hashchange` covers a link pasted into the same tab; a clicked link opens a new tab and loads everything agai → #1111 | done |
| 05 | Hear the other player's hydrant hits and horn nearby | | area:multiplayer | New feature | Issue | pose flags carry lamps and nitro only, no sound event → #1112 | done |
| 06 | All players visible on the map (Tab and minimap) | | area:multiplayer | New feature | Issue | `drawMap` never reads `NETCARS → #1113 | done |
| 07 | No engine sound in MP | | area:multiplayer | Improvement (bug) | Issue | `netStartSession` never calls `SFX.start()` (every mode button does → #1114 | done |
| 08 | MP race: does the helicopter make sense? | | area:multiplayer | Improvement | Issue | nothing blocks the heli in an MP race; decide: forbid or allo → #1115 | done |
| 09 | Other player's nitro flames not visible | | area:multiplayer | Improvement (bug) | Issue | `FLAG.nitro` is sent, but `cloneStageVehicle` drops the flames on remote clone → #1116 | done |
| 10 | New race: not always the same checkpoints and finish | | area:modes | New feature | Issue | no matching issue; race uses the fixed CPS/FINIS → #1117 | done |
| 11 | Limited nitro, refilled by knocking over objects | | area:vehicles | New feature | No action (comment on #657) | #657 limited nitro tank (refills slowly); add "refill by knocking over objects" ther → commented on #657 | done |
| 12 | Music switched off can't be switched back on | | area:audio | Improvement (bug) | Issue | settings/menu toggles both call `RADIO.cmd('power')`; path to the bug unknown, needs repr → #1118 | done |
| 13 | MP: see opponents' checkpoints done and metres to their next one | | area:multiplayer | New feature | Issue | HUD `renderNetPos` shows own position and time gap onl → #1119 | done |
| 14 | MP: after the finish, checkpoints and the nav arrow still show | | area:multiplayer | Improvement (bug) | Issue | not reproduced; finish should clear CP markers and the arro → #1120 | done |

## Raw notes

Ich habe mit Kollege MP getestet. Hier unser Feedback:
- Rückwärts fahren Räder bewegen sich nicht (auch Single Player?) [#01]
- MP J Hübel, beide in Lift, plötzlich synchronisierung verloren [#02]
- Wenn in MP, dann Möglichkeit ohne Neuanmeldung Spielmodus zu wechseln [#03]
- Wenn Game in Tab schon geöffnet und Freund klickt auf Einladungslink, dann lädt das komplette Spiel neu [#04]
- Wenn P1 Hydrant umfährt soll P2 wenn in Nähe auch Geräusch hören, Hupen soll auch gegenseitig hörbar sein [#05]
- Tab/Map sollen alle Spieler ersichtlich sein [#06]
- In MP kein Motorengeräusch [#07]
- MP Race macht Helikopter Sinn? [#08]
- MP bei anderem Spieler Nitroflammen nicht sichtbar [#09]
- Bei neuem RENNEN sollen nicht immer die gleichen Checkpoints und Endziel sein [#10]
- Nitro soll begrenzt sein und aufladen möglich durch Objekte umfahren [#11]
- Wenn Musik abgestellt kann sie nicht mehr eingestellt werden [#12]
- MP: Vom Gegner sehen wie viele Checkpoints schon abgefahren und in Meter wie weit vom nächsten Checkpoint [#13]
- MP: Wenn Ziel erreicht, keine Checkpoints bzw. keinen Navigationspfeil für Checkpoints [#14]
