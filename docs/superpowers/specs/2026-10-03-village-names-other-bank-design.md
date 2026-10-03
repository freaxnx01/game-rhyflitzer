# Village names: not across the Rhine, not inside a village — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #73 · follows #16 (`docs/superpowers/specs/2026-10-02-village-names-design.md`)

## Goal

Playtest 2026-10-03, entry 05: driving through Sisseln, the big name **MURG** (Germany, across the Rhine) hangs over the houses on the horizon (`docs/ai-notes/feedback/assets/2026-10-03-playtest/entry-05-murg-on-horizon.png`). The #16 names are chosen by distance only.

Success (the issue's draft AC, made concrete):

- Inside Sisseln no village name hangs over the houses, MURG included.
- From the Swiss bank you do not see German village names, and from the German bank you do not see Swiss ones. On the river and its bridges you see both.
- Approaching a village from afar in open country still shows its name, as in #16.
- Names still draw over everything and ignore fog, as the user confirmed for #16.

## Starting point (verified 2026-10-03 on `main` @ `a1f63d6`)

- **Village names.** `VILLAGES`, `VILLAGE_FADE`, `villageFade`, `villageHeight` and `villageLabels` live in `prototype/world.js:168-198`. `villageLabels(villages, x, z)` returns every village with opacity > 0 by distance alone. `prototype/index.html:793-801` turns that list into sprites every frame (`updateVillageNames(P.x, P.z)` in `hud()`, `:1099`). The hooks `__mm.villages()` / `__mm.villageSprites()` are at `:939-940`.
- **Why MURG shows.** Murg's centre (4361.6, −689.8) is 2.7 km from Sisseln's (1677.6, −329.8), inside the full-opacity band (≤ 2600 m) plus ramp, so it shows at about 0.87 opacity. Nothing in #16 knows about the Rhine.
- **The national border is already in the world file.** `data/world_hochrhein.json` → `boundaries` (#48) holds 28 Gemeinde border lines as `{ id, names: [a, b], pts }`. `layoutFromWorld` passes them on as `L.boundaries` (`prototype/world.js:69`). The OSM relations behind them (read from `pipeline/cache/osm/hochrhein.osm.pbf`) show which Gemeinden are German: **Bad Säckingen** (r2787775, `de:amtlicher_gemeindeschluessel=08337096`) and **Murg** (r2787776, `08337076`). Every other name is Swiss, including **Wallbach** (r1684455, `swisstopo:BFS_NUMMER=4261`, Wallbach AG). German Wallbach is an admin_level 9 Ortschaft of Bad Säckingen and is not in `boundaries`.
- **The border joins into one line.** The 9 lines between a German and a Swiss Gemeinde join end to end into one polyline of 302 points. It runs from (−4293.0, −2349.8) on the north edge to (4750.3, −215.9) on the east edge, so it splits the world into two parts. A dry run on the real world file puts the eight `VILLAGES` on the right sides: BAD SÄCKINGEN, MURG and WALLBACH on one side, the other five on the other.
- **Distance fade exists already.** `villageFade` ramps in over 200 m outside `r` and out between 2600 and 3400 m (`prototype/world.js:183-188`). The issue's "fade instead of a hard cut" is already true for distance.
- **Test hooks.** `__mm.place(x, z)` (`:927`), `__mm.labelTick()` (`:937`). Playwright tests are in `prototype/tests/test_village_names.py`. `test_far_villages_and_own_village_hidden` waits for **WALLBACH** to show at Mumpf, 2.4 km across the Rhine. That is exactly the behaviour this issue removes.

## Decisions

| Topic | Decision |
|---|---|
| Other bank | A village on the other side of the national border is hidden. The side test counts crossings of the segment car→village centre with the border polyline: an even count means the same bank. |
| Border data | Built in the browser from `L.boundaries`: keep every line whose two `names` have exactly one German Gemeinde in `BORDER_DE = ['Bad Säckingen', 'Murg']`, and join them end to end (1 m tolerance, either direction) into one polyline. No pipeline change and no world rebuild. If the lines do not join into one, or there are none, the result is `null` and the bank rule is off, so names behave as in #16. |
| On the river and bridges | Names from the other bank fade back in near the border: multiplier `max(0, 1 − dBorder / 150)`, where `dBorder` is the car's distance to the border polyline (`VILLAGE_BANK_FADE = 150`). The border runs in the Rhine, so on a bridge you see both banks, and stepping off a bridge does not pop names. No bridge test is needed. |
| Inside a village | While the car is inside any village's radius `r`, every name is hidden, not only that village's own. It fades back over the same 200 m (`VILLAGE_FADE.in`) as the car leaves: quiet factor `min over villages of clamp((d − r) / 200, 0, 1)`. |
| Combining | Final opacity = `min(villageFade, quiet, other bank ? bankFade : 1)`. Size, height, look, draw order, fog and depth settings are unchanged from #16. |
| Occlusion | None. Names keep drawing over everything (`depthTest: false`, `fog: false`), as the user confirmed for #16. The evidence does not point at hills: MURG shows over near houses along the open Rhine valley, which depth testing would only hide while a house happens to be in the way. |
| Where the code goes | New pure helpers in `prototype/world.js`, next to the #16 ones: `BORDER_DE`, `VILLAGE_BANK_FADE`, `nationalBorder(boundaries, de)`, `sameBank(border, ax, az, bx, bz)`, `bankFade(border, x, z)`, `villageQuiet(villages, x, z)` and `villageNames(villages, x, z, border)`. `villageNames` wraps `villageLabels` and applies the two new rules. `villageLabels`, `villageFade` and `VILLAGE_FADE` stay unchanged, so their tests stay unchanged. |
| Browser wiring | `prototype/index.html` builds the border once (`VILLAGE_SIGNS.border = L ? nationalBorder(L.boundaries) : null`) and calls `villageNames` instead of `villageLabels` in `updateVillageNames`. New hook `__mm.villageBorder()` returns the border's point count (0 when there is none). |
| Toggle / key | None, as in #16. |
| Docs | Amend the unreleased #16 line in `CHANGELOG.md` (the names have not shipped in a release yet, so there is no bug for players to read about as "fixed"). Update the #16 block in `test-todo.md`. |

## Assumptions (headless — no human was asked)

- **A1** [med] Names from the other bank are hidden. The national border is the side test. Rejected: hiding only names behind terrain (occlusion), because the user confirmed the over-everything overlay for #16 (spec A6) and the screenshot shows MURG in open sight along the valley. Also rejected: a distance limit for the other bank, which would still show MURG from Sisseln's eastern edge (2.2 km away).
- **A2** [med] The border is built from the existing `boundaries` (#48) with a two-name German list. Rejected: a hand-traced Rhine centreline, which duplicates data the world already has. Also rejected: a `cc` field per village plus a separate "which country is the car in" test. Line crossing needs neither, because it compares the car's side with each village's side directly. Rejected too: a pipeline export of the border, which needs a local world rebuild that a CI implementer cannot do.
- **A3** [med] On the river and its bridges both banks show, with the other bank fading in within 150 m of the border. This answers the issue's "or on a bridge?" without a bridge test, and it means crossing the Rhine never pops names on or off. Rejected: a hard switch at the border line.
- **A4** [med] Inside any village, all names are hidden, not only the own one. This is the issue's draft AC ("inside Sisseln no other village name hangs over the houses"). Without it, Sisseln would still show SISSLERFELD, STEIN and MÜNCHWILEN over its houses to the west. Rejected: keeping same-bank names visible inside villages.
- **A5** [med] `test_far_villages_and_own_village_hidden` in `prototype/tests/test_village_names.py` gets a new wait condition. Today it waits for WALLBACH to show at Mumpf, which is the bug being fixed. Its assertions (MUMPF and SISSELN not shown) stay, and it gains one: WALLBACH not shown. This is a deliberate spec change, not a test bent to go green.
- **A6** [high] The distance fade stays as it is. The issue's "fade by distance instead of a hard cut" is already implemented (`prototype/world.js:183-188`).
- **A7** [high] `villageLabels` / `VILLAGE_FADE` stay untouched, and the new rules live in a wrapper (`villageNames`). Their #16 unit tests (`prototype/tests/world.test.mjs:193-230`) stay valid unchanged.
- **A8** [high] The CHANGELOG change amends the unreleased #16 line (`CHANGELOG.md:12`) instead of adding a "Fixed" entry. The last release is 0.2.0 (`CHANGELOG.md:61`), and the names are still unreleased.

## Consequences

- **BAD SÄCKINGEN no longer shows from the Swiss bank**, including from Stein, its twin town across the Holzbrücke. You see it on the German bank or within 150 m of the Rhine. Likewise, WALLBACH no longer shows from Mumpf. The #16 playtest line "drive west towards Stein and Bad Säckingen" changes accordingly.
- Names now show only in open country between villages. Where villages sit close together (Sisseln–Sisslerfeld, about 250 m between the two radii), names barely show between them.
- On the river (for example the Murg/Sisseln border point (2407, −671)), SISSELN, SISSLERFELD and MURG all show.
- Cost per frame: 8 × 301 segment-crossing tests and one nearest-point search over 301 segments. That is negligible next to the rest of `hud()`.
- When a region extension (#19, #44, #47) adds German Gemeinden (for example Laufenburg (Baden) or Schwörstadt), `BORDER_DE` needs their names. If it does not get them, the border lines do not join, `nationalBorder` returns `null`, and the bank rule silently switches off. `__mm.villageBorder()` and the Playwright test catch that.
- The side test may miscount if the car→village segment passes exactly through a border vertex. With float coordinates this is vanishingly rare and lasts for one frame at most.

## Testing

- **Unit (node:test)** in `prototype/tests/world.test.mjs`, appended:
  - `nationalBorder` joins pieces in any order and direction, skips German–German and Swiss–Swiss lines, and returns `null` for a gap or no pieces.
  - `sameBank` uses even/odd crossing, and `null` means the same bank.
  - `bankFade` is 1 on the border, 0.5 at 75 m, 0 from 150 m, and 1 without a border.
  - `villageQuiet` is 0 inside, ramps over 200 m, and is 1 in the open.
  - `villageNames`: nothing inside a village; the other bank hidden in the open but half-faded at 75 m from the border; everything back without a border; own and neighbour names both at 0.5 just outside a village.
- **Browser (Playwright)** in `prototype/tests/test_village_names.py`, real world, foreground only:
  - The border is assembled (`villageBorder() > 100`).
  - At (3300, 100) on the Swiss bank, SISSELN shows and MURG does not (MURG is 1.3 km away there).
  - At (3000, −1200) on the German bank, MURG shows and SISSELN does not (SISSELN is 1.6 km away).
  - On the border at (2407, −671), both SISSELN and MURG show.
  - The issue's repro: back in Sisseln's centre, no name and no visible sprite.
  - The Mumpf test is updated per A5.
- **Manual playtest** in `test-todo.md`: the screenshot spot in Sisseln (no MURG), the Rhine bank between Sisseln and Murg, where both banks fade in (on the Holzbrücke nothing shows, because it lies inside Bad Säckingen's radius), and driving from Stein towards Bad Säckingen.
