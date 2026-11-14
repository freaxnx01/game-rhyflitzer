# Rhy Monster (monster truck) — Implementation Plan (#905)

**Goal:** `VEHICLES.monster`, the Rhy Monster: a glTF monster truck (steelcyclonestudios' "Free Monster Truck
Model", CC BY 4.0, unbranded, paintable) that drives on vehicle parameters only — big wheels, tall, slow, heavy.
Spec: `docs/superpowers/specs/2026-11-13-monster-truck-design.md`.

**Global constraints:** buildless; node unit tests via `node --test tests/<file>.test.mjs`; Playwright only the
files named in Task 5, foreground, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Line
numbers are from `e3d35fd`; grep, don't trust them. Commit and push before the browser tests. Follow the estate
(`beb07da`) file for file.

**Precondition:** the unmodified download is in the repo at `assets/src/free_monster_truck_model.glb` with
`assets/src/free_monster_truck_model.LICENSE.md` (committed 2026-11-14, as for #831). If it is missing, stop
and say so — do not try to download it.

---

### Task 1: `tools/prepare-monster.mjs` and the asset

**Files:** `tools/prepare-monster.mjs`, `assets/monster.glb`, `assets/monster.LICENSE.md`,
`tests/monster_asset.test.mjs` (all new)

- [ ] **Step 1: Failing asset test** — copy `tests/delorean_asset.test.mjs` (its `readGlb`, `triangles`,
  `nodeByName` helpers), point `FILE`/`LICENSE` at `assets/monster.glb` / `assets/monster.LICENSE.md`:

```js
test('monsterGlb_Committed_WithinTheBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-monster.mjs and copy the result to assets/monster.glb');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 1000 * 1024, `size ${statSync(FILE).size}`);
  assert.ok(triangles(j) >= 24000 && triangles(j) <= 30000, `triangles ${triangles(j)}`);
  assert.ok(j.materials.length <= 8, `materials ${j.materials.length}`);
  assert.ok(!j.textures?.length && !j.animations?.length, 'no textures, no animations');
  assert.deepEqual(j.extensionsUsed, ['EXT_meshopt_compression']);
});
test('monsterGlb_Nodes_RootBodyFourWheels', () => {
  const j = readGlb(FILE);
  for (const n of ['monster', 'body', 'wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR']) assert.ok(nodeByName(j, n), n);
  const fl = nodeByName(j, 'wheel_FL'), fr = nodeByName(j, 'wheel_FR'), rl = nodeByName(j, 'wheel_RL');
  assert.ok(fl.translation[0] > 1.4 && rl.translation[0] < -1.4 && fl.translation[2] < 0 && fr.translation[2] > 0, 'wheels on their corners');
  assert.ok(Math.abs(fl.translation[1] - 0.84) < 0.1, `tyre centre ${fl.translation[1]} m up: 66-inch tyres`);
});
test('monsterGlb_Materials_ByRoleWithPaintLampsGlass', () => {
  const mats = readGlb(FILE).materials, m = (n) => mats.find(x => x.name === n);
  for (const n of ['Paint', 'Rubber', 'Glass', 'LampHead', 'LampTail']) assert.ok(m(n), n);
  assert.deepEqual(m('Paint').extras, { paint: true }); assert.deepEqual(m('Glass').extras, { glass: true });
  assert.equal(m('LampHead').extras.lamp, 'head'); assert.equal(m('LampTail').extras.lamp, 'tail');
});
test('monsterGlb_Names_CarryNoBrand', () => {
  const j = readGlb(FILE), names = [...j.nodes, ...j.meshes, ...j.materials].map(x => x.name ?? '').join(' ');
  assert.ok(!/logo|badge|emblem|plate|steelcyclone/i.test(names), names);
  assert.ok(existsSync(LICENSE));
});
```

- [ ] **Step 2:** `node --test tests/monster_asset.test.mjs` → FAIL (no file).
- [ ] **Step 3: Write `tools/prepare-monster.mjs`** from `tools/prepare-estate.mjs` (header, usage, simplify loop,
  `MATERIAL_ROLES`/`ROLES`, an unmapped name throws) plus the `--list` probe of `tools/prepare-delorean.mjs`:
  1. `--list` first: every node/mesh/material with triangles and world bounds — orientation, units, the wheel parts
     per corner, the one animation, any emblem/lettering mesh (bed sides, tailgate, bonnet). Record the drops.
  2. Frame: bake transforms; group the wheel parts into four `wheel_*` by the sign of x and z (`hatchback.js`
     `wheelPlan`); scale to `WHEELBASE_M = 3.30`; +x forward, +y up, +z right, tyres on y = 0, origin on the axle
     midpoint. Print l/w/h, wheel centres and the tyre radius.
  3. `MATERIAL_ROLES` for the 63 names → `Paint` (`extras.paint`, white), `Black`, `Chrome`, `Rubber`, `Glass`
     (`extras.glass`, BLEND), `LampHead` / `LampTail` (the estate's factors, `extras.lamp`), `Amber`. Drop the
     animation and the emblem meshes; `prune()`.
  4. Simplify to `TARGET_TRIS = { min: 24000, max: 30000, aim: 27000 }`; `dedup`, `prune`, join by material, `weld`,
     crease normals, `EXT_meshopt_compression`.
- [ ] **Step 4:** run it under the memory cap from a scratch folder with the npm packages (the estate script's
  usage block); copy the output to `assets/monster.glb`; write `assets/monster.LICENSE.md` like
  `assets/estate.LICENSE.md` (title "Free Monster Truck Model", author steelcyclonestudios, the source URL, CC BY
  4.0, in-game name "Rhy Monster", the modifications). Put the measured wheel centres / radius in the test.
- [ ] **Step 5:** `node --test tests/monster_asset.test.mjs` → PASS. **Commit**
  `feat(vehicles): the Rhy Monster's 3D model and its prep script (#905)`.

### Task 2: `monster.js`, the table entry

**Files:** `monster.js`, `tests/monster.test.mjs` (new); `index.html` (import + `VEHICLES` entry)

- [ ] **Step 1: Failing test** — copy `tests/estate.test.mjs`, rename to `MONSTER`:

```js
test('MONSTER_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(MONSTER.model, 'gltf'); assert.equal(MONSTER.type, 'screen');
  assert.deepEqual(MONSTER.gltf, { id: 'monster', url: './assets/monster.glb', fallback: 'compact' });
  assert.deepEqual(MONSTER.collision, { shape: 'circle', r: 1.9 });
  assert.doesNotThrow(() => checkSound(MONSTER.sound)); assert.doesNotThrow(() => checkCrash(MONSTER.sound.crash));
  assert.equal(MONSTER.blinkers.length, 2); assert.equal(MONSTER.tip, undefined, 'it does not tip over');
});
test('MONSTER_Wheels_MatchTheModelsWheelNodes', () => {
  // tools/prepare-monster.mjs prints these; wheelR is the tyre radius, about 0.84
  assert.ok(MONSTER.wheelR > 0.75 && MONSTER.wheelR < 0.95);
  assert.deepEqual(MONSTER.wheels, [[/* x front */, /* |z| */], [/* x rear */, /* |z| */]]);
});
test('MONSTER_Drive_SlowHeavyAndSoft', () => {
  assert.equal(Math.round(MONSTER.drive.top * 3.6), 119); assert.equal(MONSTER.sound.engine.topKmh, 119);
  assert.equal(MONSTER.sound.engine.cylinders, 8); assert.equal(MONSTER.mass, 4.5);
  assert.ok(MONSTER.drive.grip < 7 && MONSTER.drive.steerRate < 2, 'soft in the corners');
  assert.equal(gearAt(100, MONSTER.sound.gears), 1, 'a two-speed automatic');
});
test('MONSTER_IsPaintable_SunflowerFromTheFactory', () => {
  assert.equal(paintable(MONSTER), true); assert.equal(MONSTER.defaultPaint, 'sunflower');
  assert.equal(buildableId('monster', MONSTER, 'loading'), 'compact'); assert.equal(buildableId('monster', MONSTER, 'ready'), 'monster');
  assert.ok(statBars(MONSTER).mass >= 8);
});
```

- [ ] **Step 2:** `node --test tests/monster.test.mjs` → FAIL (no module).
- [ ] **Step 3: Write `monster.js`** from `estate.js`: the header comment (what it is, the real-truck numbers), then
  the entry with the spec's table values (section 2): `type: 'screen'`, `gltf`, `paint: true, defaultPaint:
  'sunflower'`, `wheels`/`wheelR` from Task 1's print-out, `drive`, `mass: 4.5`, `engineAt: [1.6, 1.9, 0]`,
  `collision`, `camera`, `sound` (gears `[0, 45, 999]`, V8 harmonics from `tumbler.js`, the air horn, the crash),
  `blinkers` at the head lamps and the tail from the model's bounds.
- [ ] **Step 4:** `index.html`: `import { MONSTER } from './monster.js';` beside the estate import (`index.html:1041`)
  and `monster: MONSTER,   // Rhy Monster, a monster truck ...` as the last `VEHICLES` entry (`index.html:3317`).
- [ ] **Step 5:** `node --test tests/monster.test.mjs tests/carselect.test.mjs tests/gltfvehicle.test.mjs` → PASS.
  **Commit** `feat(vehicles): Rhy Monster, a monster truck on 66-inch tyres (#905)`.

### Task 3: texts and credits

**Files:** `strings.js`, `index.html` (About credits), `README.md`, `CHANGELOG.md`, `tests/test_credits.py`

- [ ] **Step 1: Failing tests** — append to `tests/test_credits.py`, after the estate's two:

```python
def test_monster_model_is_credited_everywhere():
    """"Free Monster Truck Model" by steelcyclonestudios, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note, the F1 help."""
    for f in ("README.md", "CHANGELOG.md", "assets/monster.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "steelcyclonestudios" in t and "CC BY 4.0" in t and "Free Monster Truck Model" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditMonster") == 2 and 'data-i18n="creditMonster"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_monster_model_is_committed_and_small():
    glb = ROOT / "assets" / "monster.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 1000 * 1024
```

- [ ] **Step 2:** `pytest tests/test_credits.py -k monster` → FAIL.
- [ ] **Step 3:** `strings.js` en + de: `veh_monster_name` "Rhy Monster", `veh_monster_class` "Monster truck" /
  "Monstertruck", `veh_monster_desc` (a pickup cab on 1.7 m tyres, 4.5 t, a blown V8 with two gears, 119 km/h, rolls
  over kerbs, sunflower from the factory or any colour; de with real umlauts, `Du` capitalised), `creditMonster` in
  the estate's wording (`strings.js:452`, `:1217`). `index.html:747`: `<small data-i18n="creditMonster"></small>`
  after `creditEstate`. `README.md:128`: the credit line after the estate's. `CHANGELOG.md` `[Unreleased] / Added`,
  newest first, `TZ=Europe/Zurich date '+%F %H:%M'`, 1–3 bold keywords.
- [ ] **Step 4:** `pytest tests/test_credits.py` → PASS. **Commit** `docs(vehicles): credit the Rhy Monster's model (#905)`.

### Task 4: the garage counts

**Files:** `tests/test_carselect.py`

- [ ] **Step 1:** `tests/test_carselect.py:93-96`: "Car 1 of 20" → 21, `["false"] * 19` → 20, "Garage · 20 vehicles" → 21;
  `:192-194`: 21 → 22, `["false"] * 20` → 21, "Garage · 21 vehicles" → 22. Grep for any other `of 20` / `20 vehicles`.
- [ ] **Step 2: Commit** `test(carselect): one more car in the garage (#905)`. Push.

### Task 5: browser verification (foreground, after the push)

**Files:** `tests/test_monster_model.py` (new)

- [ ] **Step 1:** copy `tests/test_estate_model.py` → `tests/test_monster_model.py`, `load_monster`; pin: state
  `ready`, triangles ≤ 30000, size l ≈ 5.4 ± 0.1 and w ≈ 3.5 ± 0.15 (take the real numbers from Task 1's print-out),
  4 wheel nodes with 2 steering, head 1 / tail 1 lamp, `"Paint" in materials`, the wheels-face-outwards check; and
  one drive check: `window.__mm.driveSim(3, ['ArrowUp'])` returns `speed` ≤ 33.5 and `worst` ≥ -0.05 (the wheels stay
  on the ground, the speed is capped by the table).
- [ ] **Step 2:** `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pytest tests/test_monster_model.py
  tests/test_carselect.py tests/test_car_gallery.py -x` in the foreground, generous `timeout`. Fix, don't loosen.
- [ ] **Step 3: Commit** `test(vehicles): the Rhy Monster in the browser (#905)`. Push.
