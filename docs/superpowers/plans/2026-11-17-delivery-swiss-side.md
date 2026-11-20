# Delivery on the Swiss side (#1035) Implementation Plan

**Goal:** A delivery shift always starts at a Swiss pizzeria. Its orders go mostly to Swiss addresses, with at most one
detour to Germany. Each order names its street and town, and public buildings come up often: schools, kindergartens,
stations, the indoor pool, the Werkhof and gyms.

**Architecture:** A pipeline backfill adds `use` to the public buildings in `data/world_hochrhein.json`. The pure rules
in `delivery.js` learn about places, the bank of the Rhine and public kinds, plus a weighted pick. The glue in
`index.html` feeds them the region's villages, the national border (`sameBank`) and the station and pool landmarks.

**Tech Stack:** vanilla JS ES modules, node:test, Python pipeline (pytest, shapely), Playwright (Python).

**Spec:** issue #1035 and the decisions below, which the maintainer approved in chat on 2026-11-17.

## Decisions (maintainer)

- The depot is always on the Swiss side. Pizza Fridolin (Bad Säckingen) is never chosen in this region.
- At most **1** German order per shift, drawn rarely (weight 0.1 against a Swiss address's 1).
- The label is `"<street> <no>, <place>"`, or `"<street>, <place>"` for a public building without a number. The place
  is the nearest village on the same bank of the Rhine. Sisslerfeld is not a place (it is a map label, not a Gemeinde).
- About 2 orders in 5 go to a public building when one is in the route band (`publicShare` 0.4).
- Public kinds: `school`, `kindergarten`, `station`, `gym`, `pool`, `werkhof`. Private pools, tennis and fitness halls do
  not count.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- `delivery.js` stays pure: no DOM, no three.js, no Math.random.
- The world file is patched, not rebuilt. Every other byte stays as it is; the script is idempotent.
- Memory cap for pipeline runs and Playwright: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- Playwright: only `tests/test_delivery.py`, in the foreground. Node: `node --test tests/*.test.mjs`.
- Strings in `strings.js` in both `en` and `de`.

## Review Focus

- Regions without a national border or without German Gemeinden (Ehrendingen, editor worlds): no place is foreign,
  every depot is allowed, labels still carry the place. Covered by Task 2 tests (`border` null, `gemeindenDe` []).
- A region with no villages: the label has no place and no ", ". Covered by a Task 2 test.
- Houses on the Swiss bank close to the Bad Säckingen centre (the Holzbrücke at about (-1200, 100)) must be "Stein",
  not "Bad Säckingen". Covered by a Task 2 test with a fake `sameBank`.
- If every depot is foreign, fall back to all depots rather than having no shift.
- A language switch in the middle of a shift: the kind word comes from `tr()` at render time, not stored in the label.

---

### Task 1: `use` on public buildings (pipeline backfill)

**Files:** Create `pipeline/backfill_building_uses.py` and `pipeline/tests/test_backfill_uses.py`. Modify
`data/world_hochrhein.json`.

**Interfaces:** `classify(tags: dict) -> str | None` and `backfill(world, data) -> dict` (counts per kind).

Model it on `pipeline/backfill_building_streets.py` (docstring, CLI `--pbf --world`) and its test
(`tiny_osm`, `world_dict`).

- [ ] **Step 1: Tests.**
  - `classify`:
    - `{'building':'school'}` and `{'amenity':'school'}` give `'school'`.
    - `{'building':'kindergarten'}` and `{'amenity':'kindergarten'}` give `'kindergarten'`.
    - `{'building':'train_station'}` and `{'railway':'station'}` give `'station'`.
    - `{'leisure':'sports_hall'}` and `{'building':'sports_hall'}` give `'gym'`.
    - `{'name':'Turnhalle'}` and `{'name':'Mehrzweckhalle'}` give `'gym'`.
    - `{'name':'Hallenbad Sissila'}` gives `'pool'`.
    - `{'name':'Werkhof'}` and `{'name':'Bauamt Stein'}` give `'werkhof'`.
  - `classify` returns `None` for:
    - `{'leisure':'swimming_pool'}`
    - `{'leisure':'sports_centre','name':'Tennishalle'}`
    - `{'name':'Hallenbad-Parkplatz'}`
    - `{'name':'Bahnhofplatz'}`
    - `{'name':'Ebner Gartenbau - Werkhof','building':'retail'}`
  - `backfill` on a tiny OSM file:
    - A world building whose own way is tagged gets `use`.
    - A building inside an `amenity=school` site area gets `use: 'school'`.
    - A building holding a node tagged `amenity=kindergarten` gets `use: 'kindergarten'`.
    - A plain building gets no `use`.
    - A second run changes nothing.
- [ ] **Step 2:** `cd pipeline && .venv/bin/python -m pytest tests/test_backfill_uses.py -q` → FAIL.
- [ ] **Step 3: Implement.** The kind comes from, in this order:
  1. the building's own area tags, by `Area.id == building id`;
  2. else the smallest classified area whose geometry contains the centre `rect[0], rect[1]`;
  3. else a classified `named_nodes` or `prop_nodes` entry inside `shapely.Polygon(ring)`.

  Name regexes:
  - `werkhof|bauamt|bauhof` gives werkhof
  - `hallenbad` gives pool
  - `turnhalle|mehrzweckhalle|sporthalle` gives gym
  - `bahnhof(?!s?platz)` gives station

  A name containing `parkplatz`, or `building` in (`retail`, `commercial`), never matches by name.
- [ ] **Step 4:** tests PASS. Then run it, capped:
  `.venv/bin/python backfill_building_uses.py --pbf cache/osm/hochrhein.osm.pbf --world ../data/world_hochrhein.json`.
  The probe on 2026-11-17 counted about 40 buildings: school 27, gym 5, werkhof 3, kindergarten 3, station 2. Check
  that `git diff --stat data/` shows only that file. Spot-check that the Werkhof Sisseln is there (near 1382, -374).
- [ ] **Step 5:** Commit `feat(pipeline): mark public buildings with use for the delivery (#1035)` and push.

### Task 2: pure rules in `delivery.js`

**Files:** Modify `delivery.js` and `tests/delivery.test.mjs`.

**Interfaces (produced):**
- `DELIV` gains `abroadWeight: 0.1, maxAbroad: 1, publicShare: 0.4`.
- `nearestPlace(villages, x, z, sameBank = () => true, gemeindenDe = []) -> { place, abroad } | null`:
  - Candidates are the villages without `flur`, with `sameBank(x, z, v.x, v.z)`; take the nearest.
  - `place = placeName(v.t)`, imported from `route.js`.
  - `abroad = gemeindenDe.includes(place)`.
  - When no candidate is on the same bank, use the nearest of all villages; with no villages, return `null`.
- `addressLabel({ street, no, place }) -> string`: one of `"Schulstrasse 12, Stein"`, `"Schulstrasse, Stein"` or
  `"Schulstrasse 12"`.
- `buildAddresses(buildings, nearestNamedRoad, placeOf = () => null)`:
  - A building qualifies with a plain number **or** with a `use`; a `use` building may have no number.
  - Each address gains `no` (the number or `''`), `place`, `abroad` (default false), `kind` (`b.use ?? null`), and
    `label = addressLabel(...)`.
  - Keep `id, street, x, z`.
- `resolveDepots` adds `abroad` (from the chosen address) to every depot.
- `homeDepots(depots)` returns the depots that are not abroad, or all of them when that leaves none.
- `newShift` adds `abroad: 0`. `beginOrder` copies `place, abroad, kind` into `st.order` and increments `st.abroad`
  when `addr.abroad`.
- `pickOrder({ addresses, rng, routeLen, recent, abroadLeft = Infinity })`:
  - First, when `rng() < DELIV.publicShare`, try only addresses with a `kind`.
  - Then try all addresses.
  - Inside each try: skip abroad addresses when `abroadLeft <= 0`. Otherwise accept an abroad address only when
    `rng() < DELIV.abroadWeight`.
  - Keep the two route bands as they are.

- [ ] **Step 1: Tests** (names as `subject_state_expected`):
  - `nearestPlace` on the Swiss bank near Bad Säckingen gives Stein. Use villages BS (0,0) and Stein (0,500), the point
    (0,200), and a `sameBank` that says the point is on Stein's bank: the result is `{place:'Stein', abroad:false}`.
  - `nearestPlace` skips a `flur` village.
  - `nearestPlace` marks a German place: `gemeindenDe ['Bad Säckingen']` gives `abroad: true`.
  - `nearestPlace` with no villages gives `null`.
  - `addressLabel` covers its three forms.
  - `buildAddresses`:
    - It takes a `use` building without a number, with label `"Schulstrasse, Stein"` and `kind: 'school'`.
    - A building without a number and without `use` is still dropped.
    - The existing tests keep passing; when `placeOf` is absent, labels have no place.
  - `homeDepots` drops the abroad depot, and keeps all when every depot is abroad.
  - `pickOrder`:
    - Over 200 seeds (`mulberry32(s)`), with 50 Swiss and 50 abroad addresses all in band, at most 15 % of picks are
      abroad.
    - With `abroadLeft: 0`, it never picks abroad.
    - Over 200 seeds, with 5 public and 95 plain addresses, at least 30 % of picks are public.
  - `beginOrder` counts abroad orders, and the order carries `place` and `kind`.
- [ ] **Step 2:** `node --test tests/delivery.test.mjs` → FAIL.
- [ ] **Step 3:** Implement the interfaces above.
- [ ] **Step 4:** `node --test tests/*.test.mjs` → all PASS.
- [ ] **Step 5:** Commit `feat(delivery): Swiss depots, places in the label, rare German orders, public targets (#1035)`
  and push.

### Task 3: glue, strings, browser test

**Files:**
- Modify `index.html`: `deliveryPool` around `index.html:6010`, `nextOrder`, `startDelivery`, `deliveryHud`,
  `afterOrder`, and the import of `delivery.js`.
- Modify `world.js:778` (SISSLERFELD gets `flur: true`), `strings.js`, `tests/test_delivery.py` and `CHANGELOG.md`.

- [ ] **Step 1: Playwright test.** Add `test_shift_starts_in_switzerland_and_names_street_and_place` to
  `tests/test_delivery.py`, using its own helpers. For seeds `SEED`, `SEED+1` and `SEED+2`:
  - `delivery(page)["depot"]` is in `{"Pizza Rheinblick", "Pizza Sissla"}`.
  - Deliver all 5 orders with `deliver_current`. Every `order` has `place` and `", "` in `label`.
  - At most one order per shift has `abroad`.
  - No page errors.

  Also change `ADDRESS` to `^\S.*, \S.*$`. Run the file (foreground, capped) → FAIL.
- [ ] **Step 2: Glue.**
  - `placeOf = (x, z) => nearestPlace(REGION.villages, x, z, (ax, az, bx, bz) => sameBank(VILLAGE_SIGNS.border, ax, az, bx, bz), REGION.gemeindenDe)`.
    Import `sameBank` from `world.js` if `index.html` does not have it yet.
  - The landmarks of kind `station` and `hallenbad` become extra buildings for `buildAddresses`:
    `{ id: 'lm:' + key, addr: a.addr ?? null, use: kind === 'station' ? 'station' : 'pool', rect: [a.x, a.z] }`.
  - `DEL.depots = homeDepots(resolveDepots(...))`.
  - `pickOrder(..., abroadLeft: DELIV.maxAbroad - DEL.st.abroad)`.
  - `orderText(o) = o.kind ? tr('delivKind')[o.kind] + ' · ' + o.label : o.label`. Use it in the HUD line, the order
    toast, the Navi name and the handover toast. Results keep `label` plus `kind`.
- [ ] **Step 3: Strings.** `delivKind` in `en` and `de`:
  - school: `School` / `Schule`
  - kindergarten: `Kindergarten` / `Kindergarten`
  - station: `Station` / `Bahnhof`
  - gym: `Gym` / `Turnhalle`
  - pool: `Indoor pool` / `Hallenbad`
  - werkhof: `Council depot` / `Werkhof`
- [ ] **Step 4:** `tests/test_delivery.py` → PASS and `node --test tests/*.test.mjs` → PASS.
- [ ] **Step 5: CHANGELOG** under `[Unreleased]`, with the time from `TZ=Europe/Zurich date '+%F %H:%M'`:
  ``- `YYYY-MM-DD HH:MM` The **delivery** shift starts at a Swiss pizzeria and delivers mostly on the Swiss side, with the odd trip to Bad Säckingen. Every order names **street and town**, and schools, stations, the indoor pool, the Werkhof and gyms are frequent customers.``
- [ ] **Step 6:** Commit `feat(delivery): shift starts in Switzerland, orders name street and town (#1035)` and push.
