# Underwater surface look Implementation Plan (#217)

**Goal:** From the river bed the water surface overhead reads as lit water (lighter than the murk), not as a dark board.

**Architecture:** `SURFACE_UNDER` + `surfaceLook(on)` in `prototype/underwater.js` (node-tested); `waterUnderside(on)` in `index.html` driven by `setUnderwater`; a hook field. Spec: `docs/superpowers/specs/2026-10-11-underwater-surface-look-design.md`.

## Global Constraints

- Buildless; no packages. Locate code by the quoted anchor lines (numbers are from `main` @ `b4d1279`).
- In `prototype/index.html` never put a `//` comment in the middle of a one-line statement; only after the final `;` of the line, or not at all.
- Do not touch `UW` (the fish plan #216 edits it); the new constants live in their own export.
- Browser test in the foreground, capped, one file: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_underwater.py -q -p no:cacheprovider -k "look_follows or murk"` (hand layout, no world needed). If `pipeline/.venv` is missing use `python3 -m pytest` (install to a scratch `--target`). Never the full suite.
- CHANGELOG hand-written, player-facing, English; never `git cliff -o`.

---

### Task 1: `surfaceLook` (node first)

**Files:** Modify `prototype/underwater.js`, `prototype/tests/underwater.test.mjs`.

- [ ] **Step 1: failing tests.** In `underwater.test.mjs` add `SURFACE_UNDER, surfaceLook` to the import from `'../underwater.js'` and append:

```js
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };

test('surfaceLook_Under_IsASelfLitTeal', () => {
  assert.deepEqual(surfaceLook(true), { emissive: SURFACE_UNDER.emissive, emissiveIntensity: SURFACE_UNDER.intensity });
  assert.ok(surfaceLook(true).emissiveIntensity > 0);
});

test('surfaceLook_Dry_IsOff', () => {
  assert.deepEqual(surfaceLook(false), { emissive: '#000000', emissiveIntensity: 0 });
});

test('SURFACE_UNDER_GlowIsLighterThanTheMurkAroundIt', () => {
  assert.ok(lum(SURFACE_UNDER.emissive) * SURFACE_UNDER.intensity > lum(UW.fogColor), 'the ceiling must not be darker than the fog');
});
```

`node --test prototype/tests/underwater.test.mjs` → FAIL (no exports).

- [ ] **Step 2: implement.** Append to `prototype/underwater.js`:

```js
// #217: the surface seen from below is lit from the wrong side (back face normals flip), so it turns into a dark board; under water it glows instead
export const SURFACE_UNDER = { emissive: '#3f9fb0', intensity: 0.8 };

export function surfaceLook(on) {
  return on ? { emissive: SURFACE_UNDER.emissive, emissiveIntensity: SURFACE_UNDER.intensity } : { emissive: '#000000', emissiveIntensity: 0 };
}
```

- [ ] **Step 3:** `node --test prototype/tests/underwater.test.mjs` → PASS. Commit `feat(underwater): surfaceLook for the lit ceiling (#217)`.

### Task 2: apply it in `setUnderwater`

**Files:** Modify `prototype/index.html` (3 places).

- [ ] **1. Import.** In `import { UW, bedDepth, submerged, underwaterCamY, bedSamples, makeSchool, schoolPose } from './underwater.js';` add `surfaceLook` after `schoolPose,` (if #216 is already merged the list also has `shuffled, spreadSchools`; just add the name).
- [ ] **2. New function.** Directly above the line starting `function setUnderwater(on) {` add:

```js
function waterUnderside(on) { const m = MESH.water && MESH.water.material; if (!m || !m.emissive) return; const s = surfaceLook(on); m.emissive.set(s.emissive); m.emissiveIntensity = s.emissiveIntensity; }
```

- [ ] **3. Call it.** In `function setUnderwater(on) { UWS.on = on; const St = STYLES[styleKey]; sunSprite.visible = !on; wreck.visible = on;` insert `waterUnderside(on);` right after `wreck.visible = on;` (same line, after the semicolon; the rest of the line is unchanged).
- [ ] **4. Hook.** In the line starting `window.__mm.underwater = () => ({ on: UWS.on,` insert, right after `waterDoubleSide: MESH.water ? MESH.water.material.side === THREE.DoubleSide : null,`, the text ` surface: { lit: !!MESH.water && !!MESH.water.material.emissive && MESH.water.material.emissive.getHex() !== 0 && MESH.water.material.emissiveIntensity > 0 },`.

### Task 3: the one browser test file, a visual check, CHANGELOG

**Files:** Modify `prototype/tests/test_underwater.py`, `CHANGELOG.md`.

- [ ] In `test_look_follows_the_camera` add to the final asserts (the values `dry`, `wet`, `back` already exist):
  `    assert dry["surface"]["lit"] is False and wet["surface"]["lit"] is True and back["surface"]["lit"] is False   # the ceiling glows only under the surface`
  In `test_t_underwater_keeps_the_murk` add after the existing assert: `    assert u["surface"]["lit"] is True   # the Smooth style's new water material gets the glow too (applyStyle -> setUnderwater)`.
  Run the Global Constraints command; both must fail before Task 2 (no `surface` field) and pass after.
- [ ] `node --test prototype/tests/` → PASS.
- [ ] **Visual check (not a test, foreground, once):** headless Chromium via a tiny Playwright script in your scratchpad (not the repo): open `prototype/index.html`, `__mm.place` into the river, wait for `__mm.underwater().on`, `page.screenshot(..., timeout=240000)`. The band at the top of the frame must be clearly lighter than the fog behind the car (the old build: a dark navy band). If it still reads dark, raise `SURFACE_UNDER.intensity` (one constant, re-run the node test) and say so in the PR. Attach the screenshot to the PR.
- [ ] `CHANGELOG.md` `## [Unreleased]` / `### Added`: `- Looking up from the bottom of the Rhine you now see lit water overhead instead of a dark board: the surface glows a soft teal as long as you are under it.`
- [ ] Commit `fix(underwater): the surface from below is lit, not a dark board (#217)`, push, PR closing #217.
