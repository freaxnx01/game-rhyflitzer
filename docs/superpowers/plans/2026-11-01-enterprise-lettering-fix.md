# Enterprise saucer lettering fix — implementation plan (#607)

**Spec:** `docs/superpowers/specs/2026-11-01-enterprise-lettering-fix-design.md`.

**Layout:** the game lives in the repo root (since 2e8cb91).

**TDD:** each task starts with a red test.

**Commit and push** after every task.

**Tests:**
- Node: `node --test tests/*.test.mjs`
- Playwright, only the Enterprise room test:
  `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_hideout.py -k enterprise_room -x -q -s`
  Never `from test_hideout import *` in a new file: that collects and runs the whole 18-minute file.

**Where things are:**
- `enterprise.js`: `ENTERPRISE` (with `lettering`), `letteringFrame`, and the plaque `DEDICATION` from PR#608. Leave the plaque alone.
- `index.html`: `roomLettering(k)` (about line 3160) drapes the four decals. `ROOM.models[8]` is the Enterprise root (ring 2, room 0 is
  flat index 8). `window.__mm.enterprise()` is the test hook.

## Task 1 — Pure data and `ringMean` (`enterprise.js`)

**Failing tests** in `tests/enterprise.test.mjs`:

```js
test('ENTERPRISE_bakedLettering_CoversTheRedRegistryColumn', () => {
  const [r] = ENTERPRISE.bakedLettering; assert.equal(ENTERPRISE.bakedLettering.length, 1); assert.equal(r.size, 1024);
  assert.ok(r.x0 <= 822 && r.x1 >= 841 && r.y0 <= 233 && r.y1 >= 355, 'x 825-838, y 236-352 with a 3 px margin');
  assert.ok(r.x1 - r.x0 < 40 && r.y1 - r.y0 < 140, 'no wider than the lettering');
});
test('ringMean_InnerRectOfOneColourInARingOfAnother_ReturnsTheRing', () => {
  const w = 10, h = 10, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([200, 0, 0, 255], i * 4);                          // red everywhere ...
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < 2 || x > 7 || y < 2 || y > 7) px.set([90, 100, 110, 255], (y * w + x) * 4);   // ... grey ring
  assert.deepEqual(ringMean(px, w, h, { x0: 3, y0: 3, x1: 6, y1: 6 }, 1).map(Math.round), [200, 0, 0], 'a ring inside the red is red');
  assert.deepEqual(ringMean(px, w, h, { x0: 2, y0: 2, x1: 7, y1: 7 }, 1).map(Math.round), [90, 100, 110], 'the ring just outside is grey');
});
test('ENTERPRISE_drape_DenserGridLargerOffset', () => {
  assert.deepEqual(ENTERPRISE.drape, { seg: [96, 12], offset: 1.5, spread: 1 });
});
```

**Implement:**
- `ENTERPRISE.bakedLettering = [{ size: 1024, x0: 822, y0: 233, x1: 841, y1: 355 }]` (inclusive pixel bounds, at the texture's
  size; scale by `image.width / size` if the image differs).
- `ENTERPRISE.drape = { seg: [96, 12], offset: 1.5, spread: 1 }`.
- `export function ringMean(px, w, h, rect, ring)`: the mean RGB (an array of three floats) of the pixels with
  `rect.x0 - ring <= x <= rect.x1 + ring` and the same for y, minus those inside `rect`, clamped to the image.

## Task 2 — Paint the baked registry out (`index.html`)

- `paintOutBakedLettering(root, O)`:
  - get the `saucer` node's material map (`.material.map`); return if there is none;
  - draw `map.image` (an `ImageBitmap`) to a canvas, get the pixels, and fill each `O.bakedLettering` rect with `ringMean(..., 2)`;
  - make a `THREE.CanvasTexture` from the canvas, copy `flipY`, `colorSpace`, `wrapS`, `wrapT`, `magFilter`, `minFilter`,
    `anisotropy` and `channel` from the old map, set it as the material's map, `needsUpdate` on the material, dispose the old map;
  - mark `root.userData.paintedOut = (root.userData.paintedOut || 0) + 1` (once per model; guard with a flag like `lettered`).
- Call it right before `roomLettering(k)` wherever that is called.
- `__mm.enterprise()` gains `paintedOut: m ? m.userData.paintedOut || 0 : 0`.
- Update the comment in `tools/prepare-enterprise.mjs` about the baked lettering: the game paints it out at load
  (`paintOutBakedLettering`).

**Test** (in `test_enterprise_room_holodeck_stars_and_the_ship_hovering_over_the_car`): `assert e["paintedOut"] == 1, e`.

## Task 3 — Drape that stays clear of the hull (`index.html`)

**Failing test first.** Add a hook `window.__mm.letteringClear()`: for each underside decal (`side === 'bottom'`; store `side` in the
mesh's `userData` when building it), sample a 60 × 8 grid over the decal's bounding box in the model frame. For each sample, cast
a ray from 5 m below the ship straight up (in world space) and intersect the saucer and the decal. Count the samples where the
saucer is hit **before** the decal. Return `[{ text, samples, blocked, maxDepth }]`. In the Enterprise room test assert, for both
decals, `blocked == 0`. It is red today (16 % and 6 %, up to 23 m).

**Then change `roomLettering`:**
- `new THREE.PlaneGeometry(d.w, d.h, O.drape.seg[0], O.drape.seg[1])`;
- per vertex, cast `3 × 3` rays `O.drape.spread` metres apart round it; keep the **lowest** hit (`up === false`) or the
  **highest** (`up === true`); offset by `O.drape.offset`;
- a vertex whose rays all miss takes the **mean** of the vertices that hit (second pass), not the previous vertex's height.

Run the test. If `blocked` is still above 0 for a decal, measure before moving anything: print the saucer height along the decal's
centre line (every 2 m across the ship, at `x - 30 .. x + 30` in 5 m steps). Then move that decal's `x` in `ENTERPRISE.lettering`
to the smoothest stretch, at most 40 m from today's value. Keep the node test for `lettering` passing (name nearer the bow than
the registry, `150 < x < 300`). Take the screenshot from under the saucer and look at it.

## Task 4 — Changelog and verify

- CHANGELOG under `[Unreleased]` → `### Fixed` (timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`):
  > The **Enterprise**'s lettering reads cleanly again: no blurred red **double registry** on top of the saucer, and the hull no
  > longer **cuts off** the letters underneath.
- Run `node --test tests/*.test.mjs` and the Enterprise room Playwright test. Both green.
