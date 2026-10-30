# Ferris wheel in star room 6 (hideout object list, #420) Implementation Plan

**Goal:** star room 6 of the hideout holds a classic big Ferris wheel, life size (rim radius 50 m, hub 59 m
over the floor, 112 m overall, 32 gondolas), built from three.js primitives, turning slowly with the gondolas
hanging upright; the four A-frame feet are solid, the car drives round it on the 95 m gravel loop and under the
rim, the helicopter flies round and over; nothing is downloaded; the spoke stays unsigned.

**Spec:** `docs/superpowers/specs/2026-10-27-hideout-ferris-wheel-design.md` (numbers, placement, assumptions).

**Architecture:** one new pure module `prototype/ferris.js` (descriptor `FERRIS`, `gondolaAngles`,
`wheelAngle`, `legSegments`, `ferrisPlacement`; `node --test`), one new mesh module `prototype/ferrismesh.js`
(three.js, like `artemismesh.js`, not unit-tested), `rooms.js` wires the placement into `roomLayout` exactly as
the Artemis stack is wired (`rooms.js:99-101`), `index.html` builds the meshes in `roomMeshes` (`:2827`) and
steps the turn in the frame loop (`:4392`).

**Deadline:** merged **not before Wednesday 2026-11-04** (the object must not go live before the demo), live
Thursday 2026-11-05 15:15. One pipeline run, no follow-ups planned. If a task runs long, cut the look (fewer
spokes), never the colliders or the tests. The agent opens the PR and stops; it never merges.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependencies, no framework, `const`/`let` only. No model
  file, no `CREDITS.md`, README, licence or `strings.js` change (nothing third-party is used).
- TDD for the pure modules: write the failing test, run it red, implement, run green. Never edit a test to make
  it pass — the test rewrites in Task 3 *are* the specified change and come before the code.
- Node tests: `node --test prototype/tests/<file>.test.mjs` per task; at the end of each pure task
  `node --test prototype/tests/*.test.mjs`.
- Browser tests: run **only** `pytest prototype/tests/test_hideout.py -k ferris` (one test), in the
  **foreground**, never `run_in_background`, generous `timeout`. Never the full Playwright suite (~2 h).
  Commit and push the branch **before** starting the Playwright run.
- Rendering is a graphics concern: **Task 4 is the graphics task** (meshes, colours); every number comes from
  `ferris.js`, the mesh file is a torus, cylinders and boxes.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added` (Task 6). Never run
  `git cliff -o`.
- Commit per task, Conventional Commits, scope `hideout`, push after every task; open a draft PR after the first
  task. Branch `feature/<issue>-ferris-wheel`; the last commit `Closes #<issue>`.

Files: new `prototype/ferris.js`, `prototype/ferrismesh.js`, `prototype/tests/ferris.test.mjs`; changed
`prototype/rooms.js`, `prototype/index.html`, `prototype/tests/rooms.test.mjs`, `prototype/tests/test_hideout.py`,
`CHANGELOG.md`.

---

### Task 1: the descriptor and the wheel's numbers (`ferris.js`: `FERRIS`, `gondolaAngles`, `wheelAngle`, `legSegments`)

**Files:** `prototype/tests/ferris.test.mjs` (new), `prototype/ferris.js` (new).

**Interfaces:**

```js
// prototype/ferris.js -- the Ferris wheel of star room 6 as numbers (pure, no three.js, no DOM)
export const FERRIS = {
  key: 'ferris', h: 112,                                    // floor to the top of the highest gondola roof
  rim: 50, hub: { y: 59, r: 4, len: 20 },                   // rim radius (a 100 m wheel); hub centre height; drum radius; axle length along f
  spin: 0.01,                                               // rad/s -- one turn in ~10 min
  gondola: { n: 32, w: 4, d: 3.2, h: 2, drop: 2 },      // hang point on the rim; box centre `drop` m outside it; bottom stays > 5 m over the floor
  frame: { a: 8, b: 30, foot: { hw: 5, h: 0.6 }, r: 0.9 },  // A-frames at f = +-a; feet at b = +-b; leg radius
  collider: { hw: 5, over: 2 },                             // foot squares, solid to the hub + over
  colours: { rim: 0xf2f2ee, steel: 0x3a3d42, foot: 0x8a8d92, gondolas: [0xc9503f, 0x3f7fc9, 0xe0b13a, 0x4aa36b, 0xd9d9d9, 0x8a5fb3] },
};
export const gondolaAngles = (cfg = FERRIS) => Array.from({ length: cfg.gondola.n }, (_, i) => i / cfg.gondola.n * 2 * Math.PI);
export const wheelAngle = (t, cfg = FERRIS) => (t * cfg.spin) % (2 * Math.PI);
export function legSegments(cfg = FERRIS);   // 4 x { a: [f, y, v], b: [f, y, v], r } from a foot (y 0) up to the axle end (y = hub.y)
```

- [ ] **Step 1: write the failing tests.** Create `prototype/tests/ferris.test.mjs`:

```js
// The Ferris wheel of star room 6 -- pure. node --test prototype/tests/ferris.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERRIS, gondolaAngles, wheelAngle, legSegments } from '../ferris.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('FERRIS_IsLifeSize_AHundredMetreWheelOnA59mHub_NoGondolaNearTheFloor', () => {
  assert.equal(FERRIS.key, 'ferris'); near(FERRIS.rim * 2, 100, 1e-9, 'diameter'); near(FERRIS.hub.y, 59, 1e-9);
  const G = FERRIS.gondola, lowest = FERRIS.hub.y - FERRIS.rim - G.drop - G.h / 2;
  assert.ok(lowest >= 5, `the lowest gondola bottom is ${lowest} m over the floor`);
  near(FERRIS.hub.y + FERRIS.rim + G.drop + G.h / 2, FERRIS.h, 1e-9, 'the highest roof is h');
  assert.ok(FERRIS.h < 420, 'inside the helicopter ceiling');
});

test('gondolaAngles_32EvenlySpacedFromZero', () => {
  const a = gondolaAngles(FERRIS); assert.equal(a.length, 32); assert.equal(a[0], 0);
  for (let i = 1; i < a.length; i++) near(a[i] - a[i - 1], 2 * Math.PI / 32, 1e-12, 'step');
});

test('wheelAngle_StartsAtZeroGrowsLinearlyAndWrapsAtATurn', () => {
  assert.equal(wheelAngle(0), 0); near(wheelAngle(10), 0.1, 1e-12, '10 s');
  near(wheelAngle(2 * Math.PI / FERRIS.spin + 5), 5 * FERRIS.spin, 1e-9, 'wraps'); assert.ok(wheelAngle(1e6) < 2 * Math.PI);
});

test('legSegments_FourLegsFromTheFeetUpToTheAxleEnds_TwoFramesEitherSideOfTheWheel', () => {
  const legs = legSegments(FERRIS), F = FERRIS.frame; assert.equal(legs.length, 4);
  for (const l of legs) { assert.equal(l.a[1], 0); near(l.b[1], FERRIS.hub.y, 1e-9); near(l.b[2], 0, 1e-9, 'meet on the axle line'); near(Math.abs(l.a[0]), F.a, 1e-9); near(Math.abs(l.a[2]), F.b, 1e-9); assert.equal(l.r, F.r); }
  assert.deepEqual(new Set(legs.map(l => Math.sign(l.a[0]) + ',' + Math.sign(l.a[2]))).size, 4);
});
```

- [ ] **Step 2: run red.** `node --test prototype/tests/ferris.test.mjs` fails (module missing).
- [ ] **Step 3: implement `prototype/ferris.js`** with the descriptor above; `legSegments` returns, for
  `sa, sb ∈ {−1, +1}`, `{ a: [sa·frame.a, 0, sb·frame.b], b: [sa·frame.a, hub.y, 0], r: frame.r }`.
- [ ] **Step 4: run green.** `node --test prototype/tests/ferris.test.mjs` (4 pass), then
  `node --test prototype/tests/*.test.mjs`.
- [ ] **Step 5: commit** `feat(hideout): the Ferris wheel as numbers (ferris.js)`, push.

**verify:** `node --test prototype/tests/ferris.test.mjs` → 4 pass.

---

### Task 2: placement in the room (`ferrisPlacement`)

**Files:** `prototype/tests/ferris.test.mjs`, `prototype/ferris.js`.

**Interface:**

```js
// where the wheel stands in a room ({ centre, frame: { f, v }, portal: { c }, y } as artemisPlacement takes it):
// on the room centre, the axle along the room's f (the portal sees the wheel face-on); four `low` foot colliders
export function ferrisPlacement(room, cfg = FERRIS);
// -> { wheel: { x, z, th }, colliders: [4] }   collider: { x, z, hw, hd, c, s, h, low: true, ferris: 'foot' }
```

`th = atan2(f[1], f[0])`; collider `c, s = f[0], f[1]`; foot centres at `centre + f·(±frame.a) + v·(±frame.b)`;
`hw = hd = collider.hw`; `h = room.y + hub.y + collider.over`.

- [ ] **Step 1: write the failing tests** (append to `ferris.test.mjs`):

```js
import { ferrisPlacement } from '../ferris.js';
import { roomLayout, ROOM_Y } from '../rooms.js';

const R6 = roomLayout(6), P = ferrisPlacement({ centre: R6.centre, frame: R6.frame, portal: R6.portal, y: ROOM_Y }, FERRIS);
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };

test('ferrisPlacement_WheelOnTheRoomCentre_AxleAlongTheRoomFrame', () => {
  assert.deepEqual([P.wheel.x, P.wheel.z], R6.centre); near(P.wheel.th, Math.atan2(R6.frame.f[1], R6.frame.f[0]), 1e-9, 'turned to the room frame');
});

test('ferrisPlacement_FourLowFootCollidersAtTheFrameCorners_SolidToTheHub', () => {
  assert.equal(P.colliders.length, 4);
  for (const c of P.colliders) { assert.equal(c.low, true); assert.equal(c.ferris, 'foot'); near(c.hw, FERRIS.collider.hw, 1e-9); near(c.h, ROOM_Y + FERRIS.hub.y + FERRIS.collider.over, 1e-9); }
  const spots = P.colliders.map(c => toLocal(R6, c.x, c.z).map(Math.round).join(','));
  assert.deepEqual(spots.sort(), ['-8,-30', '-8,30', '8,-30', '8,30']);
});
```

- [ ] **Step 2: run red** (`ferrisPlacement` missing; `roomLayout(6)` is still the empty room, that is fine
  here — the placement takes the frame only).
- [ ] **Step 3: implement `ferrisPlacement`** in `ferris.js` (no import from `rooms.js` — it would be circular;
  the room's frame comes in as an argument, as for `artemisPlacement`).
- [ ] **Step 4: run green.** `node --test prototype/tests/ferris.test.mjs` → 6 pass. (The `rooms.js` import in
  the test file is only for the frame; it needs no change in Task 2.)
- [ ] **Step 5: commit** `feat(hideout): place the Ferris wheel and its feet in a room`, push.

**verify:** 6 pass.

---

### Task 3: room 6 takes the object (`rooms.js`, `rooms.test.mjs`)

**Files:** `prototype/tests/rooms.test.mjs`, `prototype/rooms.js`.

**Interfaces (changes):**

```js
import { FERRIS, ferrisPlacement } from './ferris.js';
export const ROOMS = [ …, { id: 'room6', name: 'Ferris wheel', object: FERRIS, signed: false }, … ];
// NEXT_ROOMS unchanged: [7, 2, 6, 3, 5, 4] -- comment: 7 (Titanic), 2 (Artemis II) and 6 (Ferris wheel) are taken, 3 is next
// roomLayout(k) returns additionally: ferris: { wheel, colliders } | null
```

- [ ] **Step 1: rewrite the affected test first** in `prototype/tests/rooms.test.mjs`: the test at `:23-25`
  (`ROOMS_EightRooms_EiffelAtomiumArtemisAndTitanicHaveAnObject`) → rename to
  `ROOMS_EightRooms_EiffelAtomiumArtemisFerrisAndTitanicHaveAnObject`, add
  `assert.equal(ROOMS[6].object, FERRIS); assert.equal(ROOMS[6].name, 'Ferris wheel'); assert.equal(ROOMS[6].signed, false);`
  and change `for (const r of ROOMS.slice(3, 7))` to `for (const r of ROOMS.slice(3, 6))`. Import `FERRIS`
  from `'../ferris.js'`. Leave `NEXT_ROOMS_…` and `spokeSigns_…` untouched: they must stay green by themselves.
- [ ] **Step 2: add the new tests** (after the Artemis block):

```js
// the Ferris wheel -- star room 6
import { FERRIS } from '../ferris.js';
const ferris = rooms[6];
test('roomLayout_Room6HoldsTheFerrisWheelOnTheCentre_UnsignedLikeTheOthers', () => {
  assert.deepEqual([ferris.tower.x, ferris.tower.z], ferris.centre); assert.deepEqual(ferris.feet, []); assert.equal(ferris.hull.length, 0); assert.equal(ferris.basin, null); assert.equal(ferris.artemis, null);
  assert.ok(ferris.ferris); assert.deepEqual([ferris.ferris.wheel.x, ferris.ferris.wheel.z], ferris.centre);
  assert.ok(ferris.towerView && !blocked(ferris, ferris.towerView.x, ferris.towerView.z));
  for (const R of rooms.filter(r => r.k !== 6)) assert.equal(R.ferris, null);
});

test('roomLayout_Room6_FeetAreSolid_UnderTheWheelAndTheGravelLoopAreFree_TwoPaths', () => {
  for (const c of ferris.ferris.colliders) assert.ok(blocked(ferris, c.x, c.z, 0), 'a foot');
  for (const [a, b] of [[0, 0], [0, 20], [95, 0], [0, -95], [-30, 0]]) assert.ok(!blocked(ferris, ...toWorld(ferris, a, b)), `free at ${a},${b}`);
  assert.equal(ferris.paths.length, 2);
  for (const [x, z] of ferris.paths[1].pts) assert.ok(!blocked(ferris, x, z), 'the 95 m loop is drivable');
});

test('roomLayout_Room6_TheCarReachesBothSidesOfTheWheel', () => {
  const r = reach(ferris), cell = (a, b) => r.seen.has(Math.round(a / r.step) + ',' + Math.round(b / r.step));
  assert.ok(cell(0, 0) && cell(0, 45) && cell(0, -45) && cell(45, 0), 'under the rim and on all sides'); assert.ok(r.seen.size > 4000);
});
```

- [ ] **Step 3: run red.** `node --test prototype/tests/rooms.test.mjs`.
- [ ] **Step 4: implement** in `rooms.js`: the import, the `ROOMS[6]` entry, the comment on `NEXT_ROOMS`, the
  header comment (line 3-4: add "Ferris wheel (room 6)"), and in `roomLayout` directly after the Artemis lines
  (`:99-101`):

```js
  // the Ferris wheel in the centre (ferris.js places it; ferrismesh.js builds it): four foot colliders, the car drives under the rim
  const ferris = (room.object && room.object.gondola) ? ferrisPlacement({ centre, frame: { f, v }, portal: { c: P }, y: ROOM_Y }, room.object) : null;
  if (ferris) colliders.push(...ferris.colliders);
```

  and `ferris` in the returned object next to `artemis` (`:126`).
- [ ] **Step 5: run green** `node --test prototype/tests/rooms.test.mjs`, then all
  `node --test prototype/tests/*.test.mjs` (`underground.test.mjs`, `fries.test.mjs`, `room-fly.test.mjs`,
  `enterables.test.mjs`, `artemis.test.mjs` read `ROOMS`/`roomLayout` — they must stay green with no edit).
- [ ] **Step 6: commit** `feat(hideout): star room 6 holds the Ferris wheel`, push; open the draft PR if not open.

**verify:** `node --test prototype/tests/*.test.mjs` all pass.

---

### Task 4 (graphics task): the meshes, the turn and the room build (`ferrismesh.js`, `index.html`)

**Files:** `prototype/ferrismesh.js` (new), `prototype/index.html`.

Not unit-tested (three.js); verified by Task 5's browser test and a look at the screenshot it leaves.

**Interfaces:**

```js
// prototype/ferrismesh.js -- the Ferris wheel as meshes, built from ferris.js's numbers
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FERRIS, gondolaAngles, legSegments } from './ferris.js';
// THREE.Group, y = 0 on the floor, +x along f (the axle), +z along v (wheel plane = z-y); userData.role = 'ferris'.
// returns { group, wheel, gondolas } -- wheel: the rotating group (rim, spokes, hub) at (0, hub.y, 0); gondolas: 32 pivot groups, children of wheel
export function buildWheel(cfg = FERRIS);
export function setWheelAngle(handle, angle);   // wheel.rotation.x = angle; every gondola pivot rotation.x = -angle (they hang upright)
export function ferrisTriangles(group);         // like artemisTriangles
```

- [ ] **Step 1: `ferrismesh.js`.** Static part: the two A-frames from `legSegments` (one cylinder per leg, radius
  `frame.r`, between `a` and `b`, `colours.steel`), a concrete foot block `2·foot.hw × foot.h × 2·foot.hw` under
  each leg, the axle (cylinder along x, `hub.len`, steel). Rotating part (child group `wheel`): the rim as two
  `TorusGeometry(rim, 0.6)` rings at `x = ±1.2` (white), 16 spoke pairs (thin cylinders hub → rim, white), the
  hub drum (`hub.r`, steel). Gondolas: for each `gondolaAngles` angle φ, a pivot group at `(0, rim·sinφ... )` in
  the wheel's frame (position `z = rim·cosφ`, `y = rim·sinφ`), holding a box `d × h × w` (colour cycling
  `colours.gondolas`) centred `drop` m outside the rim along the radial direction, plus a thin flat roof box
  (dark) on top; the pivot is what `setWheelAngle` counter-rotates. Merge per colour inside each gondola is not
  needed (32 small meshes are fine); merge the frames and rim per colour with `mergeGeometries`. One
  `MeshLambertMaterial` per colour, `userData.role = 'ferris'` on every mesh. No textures, no text, no flag, no
  logo.
- [ ] **Step 2: `index.html`.**
  - imports after the Artemis imports (`:517-518`): `import { FERRIS, wheelAngle } from './ferris.js'; import { buildWheel, setWheelAngle, ferrisTriangles } from './ferrismesh.js';`
  - `ROOM` (`:2655`): add `ferris: null`; reset it where `ensureRoom` (`:2816`) resets `ROOM.artemis`.
  - `roomMeshes` (`:2827`): `if (R.ferris) roomFerris(group, R);` next to the Artemis call.
  - new `roomFerris(group, R)` after `roomArtemis`: `const w = buildWheel(FERRIS); w.group.position.set(R.ferris.wheel.x, R.y, R.ferris.wheel.z); w.group.rotation.y = -R.ferris.wheel.th; group.add(w.group);`
    and `ROOM.ferris = { built: R.k, handle: w, angle: 0, h: FERRIS.h, gondolas: w.gondolas.length, tris: ferrisTriangles(w.group), colliders: R.ferris.colliders.length };`
  - `stepFerris(dt)`, called in the frame loop (`:4392`, next to `stepWreck(dt)`): `if (!ROOM.ferris || ROOM.built !== ROOM.ferris.built) return; ROOM.ferris.angle = wheelAngle(performance.now() / 1000); setWheelAngle(ROOM.ferris.handle, ROOM.ferris.angle);`
    (guard clause first; the turn is visual only).
  - debug hook next to `__mm.artemis` (`:2954`): `window.__mm.ferris = () => ROOM.ferris && ROOM.built === ROOM.ferris.built ? { built: ROOM.ferris.built, angle: ROOM.ferris.angle, h: ROOM.ferris.h, gondolas: ROOM.ferris.gondolas, tris: ROOM.ferris.tris, colliders: ROOM.ferris.colliders, gondolaAngle: ROOM.ferris.handle.gondolas[0].rotation.x, wheelRotation: ROOM.ferris.handle.wheel.rotation.x } : null;`
  - `grep -n "object.url" prototype/index.html` — the only guard is `ensureRoom`'s; nothing else to change.
- [ ] **Step 3: look at it once** (no test yet): serve the repo (`python3 -m http.server 8000`), open
  `http://localhost:8000/prototype/?dev=1`, Testhub → hideout → ring, drive into spoke 6 (or run Task 5's test
  and open its screenshot). The wheel should read as a white rim with coloured gondolas on dark A-frames,
  seen face-on from the portal. Adjust colours only in `FERRIS.colours`.
- [ ] **Step 4: commit** `feat(hideout): build the turning Ferris wheel in room 6`, push.

**verify:** `node --test prototype/tests/*.test.mjs` still green (nothing pure changed); `grep -c "role = 'ferris'" prototype/ferrismesh.js` ≥ 1.

---

### Task 5: the one browser test (`test_hideout.py`)

**Files:** `prototype/tests/test_hideout.py`.

- [ ] **Step 1: push the branch first**, then write the test after
  `test_artemis_room_builds_the_rocket_and_capsule_on_entering_without_a_download` (`:1098`):

```python
@needs_world
def test_ferris_room_builds_the_turning_wheel_on_entering_without_a_download(server, tmp_path):
    """Entering spoke 6 builds the Ferris wheel (112 m, 32 gondolas) from primitives -- no model file is fetched; a foot is solid, the room
    centre (under the rim) and the lawn beside it are open; the wheel turns and the gondolas hang upright. Leaves a screenshot."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        h = page.evaluate("() => window.__mm.hideout()"); ride(page, h, "ring")
        assert page.evaluate("() => window.__mm.ferris()") is None
        into_room(page, 6, "room6")
        page.wait_for_function("() => window.__mm.ferris() && window.__mm.ferris().built === 6", timeout=120000)
        w0 = page.evaluate("() => window.__mm.ferris()")
        page.wait_for_timeout(1500)
        w1 = page.evaluate("() => window.__mm.ferris()")
        info = page.evaluate("() => ({ below: window.__mm.below(), counts: window.__mm.counts })")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, th = window.__mm.spoke(6, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], p = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -600);
          return { foot: p(8, 30), centre: p(0, 0), beside: p(0, 60) }; }""")
        view = page.evaluate("() => { const v = window.__mm.below().tower, th = window.__mm.spoke(6, 0).th; return { x: v.x - Math.cos(th) * 170, z: v.z - Math.sin(th) * 170, th }; }")
        page.evaluate(f"() => window.__mm.sim({view['x']}, {view['z']}, {view['th']}, 0, 1.5, [], -600)")
        page.set_viewport_size({"width": 1280, "height": 720}); page.wait_for_timeout(1500)
        page.screenshot(path=str(tmp_path / "ferris-room.png"))
        br.close()
    print("screenshot:", tmp_path / "ferris-room.png")
    assert errors == []
    assert requests == [], requests
    assert w0["built"] == 6 and abs(w0["h"] - 112) < 1e-6 and w0["gondolas"] == 32 and 1500 <= w0["tris"] <= 30000 and w0["colliders"] == 4, w0
    assert w1["angle"] != w0["angle"], (w0, w1)
    assert abs(w1["gondolaAngle"] + w1["wheelRotation"]) < 1e-9, w1
    assert info["below"]["built"] == 6 and info["below"]["level"] == "room6" and info["below"]["object"] is True and info["counts"].get("ferris") == 1 and "eiffel" not in info["counts"], info
    assert math.hypot(push["foot"]["dx"], push["foot"]["dz"]) > 0.5, push
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) < 0.01 for k in ("centre", "beside")), push
```

  (`ride`, `into_room`, `open_page`, `needs_world`, `math` already exist in the file; if the Artemis test's
  probe helper shape differs, copy it exactly from `:1098` rather than from this block.)
- [ ] **Step 2: run it, foreground, once:** `pytest prototype/tests/test_hideout.py -k ferris -x -q`
  (`timeout` ≥ 600 000 ms on the call). Open the screenshot it prints and check the look (Task 4 Step 3). If it
  fails on the push probes, fix `ferrisPlacement` heights/half widths in `ferris.js` (and its node tests first);
  never loosen the test.
- [ ] **Step 3: commit** `test(hideout): the Ferris room builds a turning wheel without a download`, push.

**verify:** 1 passed; `errors == []`; screenshot shows the wheel.

---

### Task 6: CHANGELOG, PR

**Files:** `CHANGELOG.md`.

- [ ] **Step 1: CHANGELOG** under `## [Unreleased]` → `### Added`, at the top, timestamp from
  `TZ=Europe/Zurich date '+%F %H:%M'`, English, one entry, format as the other entries (CLAUDE.md: bold 1–3
  keywords, keys in `<kbd>`):

  > - `2026-11-04 HH:MM` The hideout room **second on the left of the lift** now holds a **Ferris wheel**, life size: a **100 m wheel** on a 57 m hub with 32 gondolas, turning slowly while the gondolas stay upright. Drive round it on the gravel loop or **under the rim**; the four feet of its frames are solid, the helicopter (<kbd>F</kbd>) flies round it and over the top (108 m). It is built from simple shapes in the game, no downloaded model.
- [ ] **Step 2: final checks:** `node --test prototype/tests/*.test.mjs` green; `git diff --stat main` lists only
  the files of this plan; no `.glb`, no `CREDITS.md`/README/`strings.js` change.
- [ ] **Step 3: commit** `docs(changelog): Ferris wheel room` with `Closes #<issue>`; push; update the draft PR
  `feat(hideout): Ferris wheel in star room 6 (#<issue>)` with Summary / Changes / Testing (node count, the one
  Playwright test, the screenshot) / Checklist. State in the PR body: **merge not before Wednesday 2026-11-04**
  (the object must not go live before the demo). Do not merge.

**verify:** PR open (draft), CI green, one CHANGELOG entry, no third-party files.
