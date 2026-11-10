# PostAuto timetable (#801) — wireframe

Approved by the maintainer on 2026-11-10, exactly as below. Stop names and times are illustrative; the real ones come
from `data/timetable_hochrhein.json`.

```
STOP (E at the board)
┌ Sisseln, Unterdorf ───────── 14:07 ┐
│ Departures                          │
│ 143 → Stein-Säckingen  14:12   in 5'│
│ 143 → Laufenburg       14:19  in 12'│
│ 143 → Stein-Säckingen  14:42  in 35'│
│ 133 → Frick            16:41        │
│                                     │
│ [Line 133 ▸]  [Line 143 ▸]  [✕ Esc] │
└─────────────────────────────────────┘

LINE (from the stop or pause → Timetable)
┌ Line 143   [→ Laufenburg|→ Stein-S.] 14:07 ┐
│                  ◀  14:12 14:42 15:12 15:42 ▶│
│ Stein-S., Bhf       14:12 14:42 15:12 15:42  │
│ Stein, Novartis   🚌14:15 14:45 15:15 15:45  │
│ Sisseln, DSM        14:18 14:48 15:18 15:48  │
│ Sisseln, Unterdorf  14:21 14:51 15:21 15:51  │
│ …                                           │
│ Sisseln, Breitenacher 14:24 …   (→ Kaisten)  │
│ [Line 133]                        [✕ Esc]   │
└─────────────────────────────────────────────┘
 first column = next run (highlighted)
 🚌 = this run is underway, last stop passed
```
