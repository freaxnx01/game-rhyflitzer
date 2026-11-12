# Feedback 2026-11-12: Tutorial-HUD und Doppelbelegungen

status: done

| # | Note | Att. | Topic | Kind | Disposition | Rationale | Status |
|---|---|---|---|---|---|---|---|
| 01 | Empty small yellow frame above the tutorial hint is shown | entry-01-empty-frame-start.webp, entry-01-empty-frame-stop.webp | tutorial / HUD (#dist) | Improvement (bug) | Immediate | It is `#dist` (index.html:23,457) with no text when the step has no target; `#dist:empty{display:none}` | done (PR#911) |
| 02 | Key bar and tutorial hint at the same time is too much | entry-01-empty-frame-start.webp | tutorial / key bar (#773 hudfade) | Improvement | Issue | Key bar only ghosts after 30 s (hudfade.js:42); hide it during the tutorial, the hint already names the keys | done (#912) |
| 03 | Nitro has two keys: N and Shift | | controls (controls.js) | Improvement | Issue | Car: Shift+N (controls.js:22), foot/heli: N only, Shift = down/sink; key bar shows Shift | done (#913) |
| 04 | Plattform deck: E is both "hinunter" and "Website öffnen"; integrate the Verein panel | entry-04-plattform-e.webp | plattform / controls (#887) | Improvement (bug) | Issue | contextKeyAction: hop wins over website (controls.js:92-99), so E on the deck always goes down; website only by click | done (#914) |

## Raw notes

```text
Tutorial

* siehe grüne Pfeile: kleiner rahmen wenn leer nicht anzeigen [#01] und tastenhilfe und gleichzeitig tutorial hilfe ist zu viel [#02]
* Tutorial

Tasten mit Doppelbelegungen Nitro: N, Shift [#03]

* Auf Plattform:
Doppelbelegung Taste E und die Anzeige Verein Plattform Sisslerfeld mit Lick soll irgendwie itegriertet sein (2026-11-12_11h30_27.png) [#04]
```
