# mclaren.glb — licence and credit

- **Title:** McLaren P1
- **Author:** hartwelkisaka (Sketchfab user hartwelkisaka, https://sketchfab.com/hartwelkisaka)
- **Source:** https://sketchfab.com/3d-models/mclaren-p1-e791b5aee5c6497c83994f4e5f1db84b
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`mclaren.glb` is a derivative of that model, made with `tools/prepare-mclaren.mjs`. In the game the car is called "Rhy Papaya";
the attribution above names the original work's title as the licence requires. The game is a non-commercial fan project and
shows no maker's badge.

## Modifications

- Units and frame: scaled to the real 2.67 m wheelbase in metres, rotated so the front points along +x, the origin between the axles, wheels on y = 0.
- The four wheels gathered into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer.
- The rear number plate removed.
- The textures removed; new plain materials: a paintable body, glass, trim, and head and tail lamp materials that light up with L.
- Simplified from about 231k to 28k triangles; normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
