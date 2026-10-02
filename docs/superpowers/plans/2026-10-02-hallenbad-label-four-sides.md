# Hallenbad Sissila label on all four sides (#38) — Implementation Plan

**Goal:** The `HALLENBAD SISSILA` label appears on all four façades of the Hallenbad,
readable from outside, sized to each façade, at today's height — in both the traced
and the OSM world.

**Architecture:** A pure helper `facadeLabels(x, z, rot, w, d)` in `prototype/world.js`
returns one placement per façade. `hallenbad()` in `prototype/index.html` uses it
to add four label meshes instead of one. Spec:
`docs/superpowers/specs/2026-10-02-hallenbad-label-four-sides-design.md`.

**Tech:** vanilla JS (ES modules), three.js, `node:test`, Playwright (Python) smoke test.

## Global Constraints

- TDD: write the failing test first, watch it fail, then implement.
- Never modify an existing test to make it green. Stop and report after 3 failed attempts.
- Surgical edits only: touch `hallenbad()`, the `world.js` import line in
  `index.html`, `world.js`, `world.test.mjs` and `CHANGELOG.md`, nothing else.
- Run Playwright tests in the foreground, never in the background.
- Commits: Conventional Commits, reference `#38`.

## Task 1 — `facadeLabels` helper (TDD)

**Files:** `prototype/world.js`, `prototype/tests/world.test.mjs`.

**Interface:**

```js
export function facadeLabels(x, z, rot, w, d, off = 0.1)
// returns 4 × { x, z, rotY, w, h }, façades in order +z, +x, −z, −x (local frame)
```

1. **Write the failing test.** Append to `prototype/tests/world.test.mjs`:

   ```js
   import { facadeLabels } from '../world.js';

   test('facadeLabels: one outward label per façade, sized to it', () => {
     const near = (a, b) => Math.abs(a - b) < 1e-9;
     const same = (got, want) => assert.ok(['x', 'z', 'rotY', 'w', 'h'].every(k => near(got[k], want[k])), `${JSON.stringify(got)} != ${JSON.stringify(want)}`);
     const t = facadeLabels(100, 200, 0, 28, 26);   // traced hall, default size
     assert.equal(t.length, 4);
     same(t[0], { x: 100, z: 213.1, rotY: 0, w: 16.8, h: 16.8 * 2.2 / 16 });             // today's façade
     same(t[1], { x: 114.1, z: 200, rotY: Math.PI / 2, w: 15.6, h: 15.6 * 2.2 / 16 });
     same(t[2], { x: 100, z: 186.9, rotY: Math.PI, w: 16.8, h: 16.8 * 2.2 / 16 });
     same(t[3], { x: 85.9, z: 200, rotY: 3 * Math.PI / 2, w: 15.6, h: 15.6 * 2.2 / 16 });
     const o = facadeLabels(0, 0, Math.PI / 2, 42.7, 47.1);  // OSM size, rotated a quarter turn
     same(o[0], { x: -23.65, z: 0, rotY: -Math.PI / 2, w: 20, h: 2.75 });             // clamped to 20 m
     same(o[1], { x: 0, z: 21.45, rotY: 0, w: 20, h: 2.75 });
   });
   ```

2. **Run:** `node --test prototype/tests/world.test.mjs` — expect FAIL
   (`facadeLabels` is not exported).

3. **Implement** in `prototype/world.js`, after `pickLabels`:

   ```js
   // One label per façade of a w × d hall rotated like box() (rotateY(-rot)): faces +z, +x, -z, -x in the local frame,
   // each just off its wall, facing outward, 0.6 × the façade long (max 20 m) with the sign's 16:2.2 aspect
   export function facadeLabels(x, z, rot, w, d, off = 0.1) {
     const c = Math.cos(rot), s = Math.sin(rot);
     return [[0, d / 2 + off, w], [w / 2 + off, 0, d], [0, -(d / 2 + off), w], [-(w / 2 + off), 0, d]].map(([lx, lz, len], k) => {
       const lw = Math.min(0.6 * len, 20);
       return { x: x + lx * c - lz * s, z: z + lx * s + lz * c, rotY: -rot + k * Math.PI / 2, w: lw, h: lw * 2.2 / 16 };
     });
   }
   ```

4. **Run:** `node --test prototype/tests/` — all green.

5. **Commit:** `feat(world): facade label placements for four-sided signs (#38)`.

## Task 2 — four labels in `hallenbad()`

**Files:** `prototype/index.html`.

1. Add `facadeLabels` to the `import { … } from './world.js'` list (line ~192).

2. In `hallenbad()` (line ~497) replace the single-label code

   ```js
   const label = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.2), new THREE.MeshBasicMaterial({ map: textTex('HALLENBAD SISSILA', …), transparent: true })); label.position.set(…); label.rotation.y = -rot; signs.add(label);
   ```

   with one shared material and four meshes:

   ```js
   const mat = new THREE.MeshBasicMaterial({ map: textTex('HALLENBAD SISSILA', 1024, 144, '#1c5fb0', '#ffffff', '700 96px "Barlow Condensed", sans-serif'), transparent: true });
   for (const f of facadeLabels(x, z, rot, w, d)) { const label = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), mat); label.position.set(f.x, b + 6.5, f.z); label.rotation.y = f.rotY; signs.add(label); }
   ```

   Keep the `textTex` arguments exactly as they are today.

3. **Verify in a browser** (foreground):
   - `node --test prototype/tests/` — green.
   - `pytest prototype/tests/test_smoke.py` — green (page loads, empty console).
   - Serve the repo (`python3 -m http.server 8000`), open `/prototype/index.html`,
     jump/drive to the Hallenbad and confirm the label reads correctly (not mirrored)
     from all four sides. Do it for the OSM world (default) and the traced world
     (block `data/world_hochrhein.json`, as `open_page(..., block_world=True)` does in
     `prototype/tests/test_street_labels.py`).

4. **Commit:** `feat(prototype): Hallenbad Sissila label on all four sides (#38)`.

## Task 3 — CHANGELOG

**Files:** `CHANGELOG.md`.

1. Under `## [Unreleased]` → `### Changed` (create the subsection if missing),
   add one player-facing line:
   `- The Hallenbad Sissila now shows its name on all four sides, so you can read it from whichever way you drive up.`
2. **Commit:** `docs(changelog): Hallenbad label on all four sides (#38)`.
