# #844: the underpass south of Stein, a wall corner blocks the west edge of the road (design, needs a decision)

Status: **reproduced and measured, fix direction open**. A human has to pick the fix (see "Open decision"), so this
spec has no implementation plan yet.

## What the tester reported

The car drives south from game `x -881.7 z 1143.9` (bearing 188°) at ~50 km/h. The tester says the road ends at
the railway embankment, a dark box sits in the embankment, and the car is thrown from bearing 188° to 100°. After
the impact the car is at `x -883.1 z 1159.5`.

## Reproduction (headless, 2026-11-11, main `8836d8f`, world built 2026-11-10T10:50)

Tooling: the GPU browser (`PW_CDP_ENDPOINT`), the `window.__mm` debug hook, and a world file cut down to a 1.2 km
radius around `(-884, 1190)` (roads, buildings, props, fields, forests, parking, streams; rail, railBridges,
junctions, grades, water untouched). With the full 7.5 MB world the GPU browser closed the page during loading on
3 of 3 tries, `tests/test_underpass.py` included (`TargetClosedError`). `makeCut` only looks at roads within 250 m
(`index.html:1402`), so the cut-down world builds the same cuts.

### The underpass itself is fine

- OSM: road **w107160628** (unnamed, residential, 5.5 m, `layer 0`, no bridge) runs from the junction
  `(-879.7, 1149.8)` to `(-887.9, 1222.8)`. Six rail bridge pieces cross it (`railBridges[4..9]`, all `layer 1`) at
  z 1200.3 to 1213.3. So the crossing is in OSM as railway bridges over a road.
- `CUTS` has all six crossings (`__mm.crossings()`): depth 4.57 to 5.19 m, clearance 4.94 to 5.38 m, `railGap`
  < 1e-6, `capped` null, `unsettled` **false**. The console shows no `the cut floor did not settle` warning
  (`index.html:1405`).
- Along the road, the cut starts at z ≈ 1179 (`cutDepth` 0.14 m) and is 5.0 to 5.5 m deep under the decks
  (z 1199 to 1215). `__mm.ground` under the decks is the road (17.84), and the deck stone is at 24.45.
- A car on the lane passes through. In a real-time drive with <kbd>W</kbd> held from the tester's spot, the car
  is at `z 1199.3 y 17.84` after 4.2 s and comes out at `z 1223 y 19.2`.

### What stops the car: a wall corner at the west road edge, z 1177.5 to 1178.5

`__mm.sim` from `z 1143.9`, starting at 13.9 m/s (50 km/h), sweeping the start x and the bearing (a "hit" means the
speed drops by more than 2.5 m/s within 0.25 s):

| start x (road centre -879.1) | bearing | gas | hit at (x, z) | speed |
|---|---|---|---|---|
| -881.7 (tester) | 188° | coast | -885.99, 1175.69 | 5.5 → 0.8 |
| -881.7 (tester) | 188° | held | -885.64, 1176.04 | 24.5 → 3.2 |
| -882.7 | 186.4° to 190° | both | -885.6 to -888.5, 1175.1 to 1176.0 | stopped; wrecked (dmg 1) in 2 of 6 |
| -880.4 | 188° / 190° | held | -885.7, 1184.6 / -885.4, 1176.5 | 25.6 → 6.0 / 24.4 → 5.6 |
| -879.1 / -877.8 (lane centre and east) | any | coast | no hit | |

Every hit is on the **west** edge, 2.8 to 5.9 m west of the centre line, 23 to 25 m north of the first deck. The
obstacle is the wall piece `__mm.walls()`:

```text
{ road: 101 (runs along w107160628), x: -887.64, z: 1177.95, rot: 1.68, len: 1.0, side: 1 (west),
  floor: 18.83, top: 20.62, under: false }   inner face cutDepth 0.22 / 0.52 / 0.64 m
```

- Its face is `hw + margin` = 3.75 m from the centre line. A car (half-width ~1 m) hits it as soon as its centre is
  ~0.1 m past the lane's edge. On the tester's line (2.6 m west of the centre at bearing 188°, 1.6° west of the
  road's 186.4°) that happens after ~32 m.
- It stands **alone, 8 m before the west run** (the next west piece is at z 1185.99). It is the north end of the
  main road's west run, cut short by the gap for the service road **w1216639317** (`(-883.3, 1181.8)` → west).
  `wallSpans` trims the run at that road's corridor, so 1 m is left (`index.html:2522-2531`, `world.js:373`).
- The main road itself is **not** lowered there. At z 1177.95, x -882.7, `meshH` and `terrainH` are both 18.73.
  West of x -884 the ground is lowered 0.1 to 0.5 m. That is the service road's arm (crossing z 1200.3, anchor
  `(-883.3, 1181.8)`, f0 18.78, grade 0.12, reach 53 m, stop `ground`) reaching around the corner. So the piece
  passes `troughPiece`'s test (`index.html:2541`, `ground - floor` = 0.79, `lowered` = 0.64) and gets the 1 m
  parapet: it is 1.8 m tall (`index.html:2546`).
- Seen from the tester's spot, this corner and the service road's north wall (w1216639317 `side 1`, z 1177.7,
  x -887.9 to -936.8, 1.5 to 1.8 m tall) form a band of stone across the view. The main road seems to end there,
  and the walled portal behind it is the "dark box".
- The service road's arm is a 0.3 to 1.4 m deep walled trench for its whole 53 m (walls on both sides at
  z 1177.7 and 1185.6). The arm climbs at `sideGrade` 0.12, about as steep as the terrain, so its floor only meets
  the ground at the end.

### Not reproduced

- The tester's impact point `z 1159.5` is 16 m north of every measured hit (z 1175 to 1178.6). There is no
  collider and no terrain step between z 1144 and 1175 on any line I tried. The terrain rises evenly from 16.4 to
  18.9 (`gradeAt`), and `nearestSolid` finds only the hydrant at `(-890.1, 1169.4)`. Postauto buses (line 134 runs
  south through this underpass) are solid (`index.html:5223`, `POSTAUTO.colliders`), but the sims do not run them.
  The bearing change 188° → 100° (thrown east) does fit a hit on the west side.

## Open decision (why this needs a human)

There are three ways to fix it. Each one changes a rule from #119/#120 that other cuts depend on:

- **A (recommended, but [low])**: `troughPiece` drops a piece on the cut road when that road's own carriageway is not
  lowered there (`cutDepth(rx, rz) <= 0.1`), so the bank only exists because a side road's arm reaches around
  the corner. The corner becomes a 0.2 to 0.64 m grass slope, and the service road's own walls still close its
  corridor. This breaks `test_no_open_cut_faces` (`tests/test_underpass.py:223`, every point lowered > 0.3 m
  outside a corridor must lie in a wall). It needs a carve-out there, like the existing `sharedTrough` one.
- **B**: low walls (retained height < ~0.8 m) get no parapet and stop being solid. The cars drive over them. This
  changes how every cut entry looks and works.
- **C**: shorten or flatten the service-road arm (w1216639317 runs in a 53 m walled trench). This is a deeper
  change to `armReach`/`cutNetwork` (`world.js`) for every side road whose terrain climbs at about `sideGrade`.

Also open: whether the 16 m gap between the tester's impact and the measured one points to a second cause (for
example a Postauto bus in the cut). If it does, the human should get another tester run or video frame at
z 1150 to 1165.

## Acceptance criteria (for whichever option is chosen)

- [ ] From `(-881.7, 1143.9)`, bearing 188°, 50 km/h with gas held, `__mm.sim` reaches z > 1215 without a speed drop
      > 2.5 m/s per 0.25 s and without a wreck.
- [ ] The same from the lane's west edge (start x -882.7) at bearings 186.4° and 188°.
- [ ] The six crossings at z 1200 to 1213 keep depth ≥ 4.5 m, clearance ≥ 4.45 m, `unsettled` false.
- [ ] `tests/test_underpass.py` stays green, or is changed only as the chosen option says.
