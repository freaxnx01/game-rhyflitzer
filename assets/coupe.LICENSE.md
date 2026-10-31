# coupe.glb — licence and credit

- **Title:** 2012 BMW 1M
- **Author:** OUTPISTON (Sketchfab user outpiston, https://sketchfab.com/outpiston)
- **Source:** https://sketchfab.com/3d-models/2012-bmw-1m-b011893b8f8049568610be2abb3ecf8e
- **Licence:** CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/

`coupe.glb` is a derivative of that model, made with `tools/prepare-coupe.mjs`. In the game the car is called "Rhy Coupé";
the attribution above names the original work's title as the licence requires. The modified model file stays under
CC BY-NC-SA 4.0. The game is a non-commercial fan project and shows no maker's badge.

## Modifications

- Units and frame: scaled to the real 2.66 m wheelbase in metres, rotated so the front points along +x, the origin between the axles, wheels on y = 0.
- The four wheels in their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer.
- The four badges (bonnet, boot lid, wing, front bumper) removed.
- The textures removed; new plain materials: a paintable body, glass, trim, and head and tail lamp materials that light up with L (the part holding both lamp inserts split by end).
- Normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
