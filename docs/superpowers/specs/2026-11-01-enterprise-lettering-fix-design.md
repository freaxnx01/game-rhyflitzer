# Enterprise saucer lettering: no double registry on top, nothing cut off underneath (#607)

Status: the maintainer reported it on 2026-11-01 ("Schriftzüge Enterprise komisch", two screenshots) and chose to **keep the white
canvas lettering** and remove what is wrong around it.

## What is wrong (measured)

1. **Top: a second, red registry behind the white one.** The model's saucer base texture (`assets/models/enterprise_d.glb`,
   material `saucer`, image 8, 1024 × 1024 WebP) has the red-outlined "NCC-1701-D" and "U.S.S. ENTERPRISE" painted in. That is one
   column of pixels, **x 825–838, y 236–352** (red-pixel scan, 2026-11-01). `tools/prepare-enterprise.mjs` already calls it
   "unreadable in the game", but it is big and red enough to show as a blurred ghost next to the white decal (`roomLettering`,
   `index.html`, positions in `enterprise.js` `lettering`). The emissive map (image 10) has no lettering.
2. **Underside: letters swallowed by the hull.** In the tester's screenshot, and in our own screenshot from the plaque test (PR#608),
   "U.S.S. ENTERPRISE" and "NCC-1701-D" under the saucer are partly hidden. `roomLettering` drapes each decal as a
   24 × 4-segment plane, 0.6 m below the hull at the ray-hit vertices. Between those vertices the curved hull comes through the
   flat triangles. Measured 2026-11-01 in the browser with rays from below through each underside decal (about 2000 samples
   each): the hull lies in front of the decal at **16 %** of the samples under "U.S.S. ENTERPRISE", up to **23 m** deep, and at **6 %**
   under "NCC-1701-D", up to **2 m**. Depths of 23 m are no curvature: there is a step in the hull under the name (a structure
   below the saucer, or a vertex whose ray missed and kept its neighbour's height).

## Goals

1. **Paint the baked registry out at load time.** After the Enterprise model loads, the saucer's base colour map is copied to a
   canvas. Each rectangle in a new `ENTERPRISE.bakedLettering` list (texture pixels at 1024 px, with a 3 px margin) is filled with
   the mean colour of a 2 px ring of texels just outside it. That texture replaces the map, keeping the original's `flipY`,
   `colorSpace`, wrap and filter settings. Nothing is fetched or re-encoded, and the shipped `.glb` is unchanged, because rebuilding
   it needs the 104 MB Sketchfab original.
2. **Underside lettering fully visible.** The draped planes follow the hull closely enough that no hull triangle lies between the
   camera and the letters:
   - denser grid: 96 × 12 segments instead of 24 × 4;
   - an offset of 1.5 m instead of 0.6 m;
   - each vertex gets the **lowest** hit (top side: the highest) of a 3 × 3 cluster of rays 1 m apart, so the plane never cuts
     into a bump between its vertices.

   Same for the top side; it has no visible clipping today, but it uses the same code.

   **If a step is still left under a decal** (where `letteringClear` is above 0 after the denser drape), move that decal along the
   ship (`x` in `lettering`) to a smooth stretch of the hull, at most 40 m. Measure first: print the hull height along the decal's
   centre line and pick the stretch. Do not shrink the text. A vertex whose rays all miss takes the mean height of the vertices that
   hit, not the previous vertex's height.
3. The white lettering, its text, size and position stay as they are.

## Non-goals

- No rebuild of `enterprise_d.glb` and no change to `tools/prepare-enterprise.mjs`. Only its comment about the baked lettering is
  updated to say the game paints it out.
- The drive section's own markings are not touched.

## Constraints

- **Pure numbers in `enterprise.js`:** `bakedLettering` and the drape settings (`drape: { seg: [96, 12], offset: 1.5, spread: 1 }`).
  A pure helper `ringMean(pixels, w, rect, ring)` returns the mean RGB of the ring round a rectangle, and is unit-tested on a small
  synthetic image.
- `index.html` only wires it: `paintOutBakedLettering(root)` runs where `roomLettering` runs, once per loaded model.

## Decided calls (the builder's)

- Paint out at runtime rather than in the asset: there is no original in the repo, and the pipeline runner cannot fetch it
  (Sketchfab token).
- A flat mean colour is enough: the patch is 14 × 117 texels and lies under the white decal.

## Tests

- **`tests/enterprise.test.mjs`:**
  - `bakedLettering` covers the measured column with its margin;
  - `ringMean` on a synthetic image (an inner rectangle of one colour inside a ring of another) returns the ring's colour;
  - `drape` has the numbers above.
- **`tests/test_hideout.py`, the Enterprise room test, extended:**
  - `__mm.enterprise()` reports `paintedOut: 1`;
  - a new `__mm.letteringClear()` casts rays from below through the two underside decals (a 60 × 8 sample grid each) and returns
    the fraction where the hull is hit before the decal. It must be **0**;
  - the existing screenshot from under the saucer is kept.
