# newbeetle.glb — licence and credit

- **Title:** 1998 Volkswagen New Beetle
- **Author:** ddiaz-design (Sketchfab user ddiaz-design, https://sketchfab.com/ddiaz-design)
- **Source:** https://sketchfab.com/3d-models/1998-volkswagen-new-beetle-81d1dbbf18e841a184c51f028e652879
- **Licence:** CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/

`newbeetle.glb` is a derivative of that model, made with `tools/prepare-newbeetle.mjs`. In the game the car is called
"Rhy Bubble"; the attribution above names the original work's title as the licence requires. Under the ShareAlike term the
modified file stays under CC BY-NC-SA 4.0, and under the NonCommercial term the game stays non-commercial.

## Modifications

- Units and frame: scaled to the real 2.51 m wheelbase in metres, rotated so the front points along +x, the origin on the axle midpoint, wheels on y = 0.
- The four wheels split into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer.
- The VW emblems on the nose and the hatch and the four brake calipers removed.
- Simplified from 152k to about 30k triangles, normals rebuilt (smooth below a 40° crease).
- The 35 materials replaced by plain ones by role; the body is one white paint material the game colours (sunflower yellow by default), the lamps and the glass got game roles.
- Compressed with `EXT_meshopt_compression`.
