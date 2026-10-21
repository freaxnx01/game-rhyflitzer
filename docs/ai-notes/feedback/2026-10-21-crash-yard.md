# Test feedback: Crash-Platz (2026-10-21)

status: approved

Build: main after PR#423 (Crash-Platz, #415) and PR#424.

| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link | Status |
|---|---|---|---|---|---|---|---|
| 1 | The Crash-Platz should be concrete, like a big car park without markings | | area:world | Improvement | Issue | today the yard is the bare Sisslerfeld meadow (`crashyard.js`, no ground surface) | done: #426 |
| 2 | Clothes stay in the air unnaturally long | | area:world | Improvement (bug) | Issue | `stepCloth`: launch 6–12 m/s up, fall capped at 1.4 m/s, so up to about 8 s in the air | done: #427 |
| 3 | What are the big green boxes? | | area:world | — | No action (answer) | they are the glass containers (`glass_container`, 1.5 m, green `#2f6d4a`); no open issue | done (answered); follow-ups #429 (model), #430 (sound) |
| 4 | A knocked-over box can be driven through | | area:world | Improvement (bug) | Issue | `knock.js` only tests the car against standing props (`touches`); lying ones have no collider | done: #428 |

## Raw notes

> test feedback Crash Platz

- [#01] Platz soll beton sein (so wie grosser Parkplatz aber ohne Einzeichnungen)
- [#02] Kleider fliegen unnatürlich lange in der Luft
- [#03] Was sind die grossen grünen Boxen?
- [#04] Wenn eine Box schon umgefahren kann man mit dem Auto durchfahren
