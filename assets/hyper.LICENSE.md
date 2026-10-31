# hyper.glb — licence and credit

- **Title:** Free Bugatti Chiron
- **Author:** ALIEEEN (Sketchfab user ALIEEEN, https://sketchfab.com/ALIEEEN)
- **Source:** https://sketchfab.com/3d-models/free-bugatti-chiron-374890e62c5a44e9a739ca638b6e0a18
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`hyper.glb` is a derivative of that model, made with `tools/prepare-hyper.mjs`. In the game the car is called "Rhy Hyper";
the attribution above names the original work's title as the licence requires. The game is a non-commercial fan project and
shows no maker's badge.

## Modifications

- Units and frame: scaled to the real 2.711 m wheelbase in metres, the origin between the axles, wheels on y = 0.
- The four wheels in their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer.
- The grille badge removed.
- The textures removed; new plain materials: a paintable body (the dark side of the two-tone body keeps a fixed dark blue), glass, trim, and head and tail lamp materials that light up with L.
- Simplified from about 97k to 30k triangles; normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
