# wobbler.glb — licence and credit

- **Title:** Reliant-regal-supervan
- **Author:** 3DDomino (Sketchfab user 3DDomino, https://sketchfab.com/3DDomino)
- **Source:** https://sketchfab.com/3d-models/reliant-regal-supervan-6c868a7d53d04f04a6319ec016a05c10
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`wobbler.glb` is a derivative of that model, made with `tools/prepare-wobbler.mjs`. In the game the car is called "Rhy Wobbler";
the attribution above names the original work's title as the licence requires. The game is a non-commercial fan project and
shows no maker's badge.

## Modifications

- Units and frame: scaled to a 2.17 m wheelbase in metres (3.33 m long), rotated so the front points along +x, the origin between the axles, wheels on y = 0.
- The three wheels moved into their own nodes with the origin at the tyre centre, so they roll and steer; the one front wheel is cut in two halves at its centre plane (`wheel_FL`, `wheel_FR`, both turning about its centre), the rear ones are `wheel_RL`, `wheel_RR`.
- The badge on the nose removed.
- New plain materials, all double-sided as in the original; the body is white and takes the paint colour chosen in the game.
- Simplified from about 230k to 25k triangles, normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
