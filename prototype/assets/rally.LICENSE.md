# rally.glb — licence and credit

- **Title:** 2013 Hyundai - i20 WRC
- **Author:** D3NK (3D Warehouse)
- **Source:** https://3dwarehouse.sketchup.com/model/4082138f-6179-4762-ba76-d2910a315f27
- **Licence:** 3D Warehouse General Model License — https://3dwarehouse.sketchup.com/tos/

`rally.glb` is a derivative of that model, made with `tools/prepare-rally.mjs`, and is used only as part of this game
(General Model License §1.3: a combined work with substantial additional content; not distributed as a standalone model, §2.4).
In the game the car is called "Rhy Rally"; it carries no manufacturer emblem and no sponsor.

## Modifications

- Units and frame: scaled to the real 2.57 m wheelbase in metres, rotated so the front points along +x, the origin on the axle midpoint, wheels on y = 0.
- The four wheels split into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the wheel centre, so they roll and steer.
- The two manufacturer emblems removed; the grille textures replaced by plain black; all materials replaced by plain role materials.
- Simplified from 55k to about 26k triangles.
- The white body painted in our own livery (light blue, navy, red, start number 8), projected per face from one 2048² texture.
- Compressed with `EXT_meshopt_compression`.
