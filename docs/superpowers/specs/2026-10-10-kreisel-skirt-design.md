# The Smile-Kreisel floats above the ground (#222) — design

Status: enriched 2026-10-10 (`--quick`). Playtest entry 20; the old untracked TODO.md line is already gone.

## Root cause (measured 2026-10-10 on `main` @ `cda3b21`, real world + terrain)

`smileKreiselAt(x, z, inner)` in `prototype/index.html` builds the **apron** and the **island** as plain `CylinderGeometry` discs whose heights are
fixed relative to `b = terrainH(x, z)`, the terrain height at the **centre**: apron from `b + 0.025` to `b + 0.375`, island from `b` to `b + 1.1`.
Where the ground under the disc is lower than `b`, the disc hangs in the air with its underside (dark, unlit) showing.

In the OSM world the roundabout is way 190288657, centre (1264.5, -147.0), ring radius 12.4, road width 7, so `inner = 8.9` and the apron reaches r = 10.0.
`groundH` sampled on 16 points: ring r = 8 is level with the centre (the road is graded flat), at **r = 10 the ground is up to 1.46 m below the centre**.
That is the "apron and island hang in the air on one side, with a dark rim under them" of the screenshots (x 1287.8 / z -140.8 and x 1282.5 / z -149.6 are on that side).

## Fix

Give both discs a **skirt**: keep the top exactly where it is (cars drive on `k.b + 0.375`, `prototype/index.html` line `for (const k of KREISEL) ... Math.max(k.b + 0.375, fill)`),
and extend the cylinder **down** to 0.3 m below the lowest terrain sampled on a 16-point ring at the disc's outer radius. The skirt side is the same colour/material as the disc.

- new helper `lowestTerrain(x, z, r)` (16 samples on the ring + the centre, `terrainH`);
- `skirt = max(0, b - low) + 0.3`; apron height `0.35 + skirt`, island height `1.1 + skirt`, both translated so the top is unchanged;
- `KREISEL` entries gain `bottom` (the apron's lowest y) so a test can read it.

Rejected: tilting or re-shaping the discs to the ground plane (the top is also the car's driving surface and a tilted island looks worse); lowering the apron top (changes the collision height `k.b + 0.375`); grading the terrain mesh (pipeline change, not needed).

## Test

`__mm.kreisel()` (read-only hook) returns each roundabout with `{ x, z, b, apron, bottom, low }` where `low` is `lowestTerrain(x, z, apron)`.
Playwright test on the real world: `bottom <= low - 0.2` for every entry. Red before (bottom = b + 0.025), green after (bottom = low - 0.275).
No frames needed: the model is built at load.
