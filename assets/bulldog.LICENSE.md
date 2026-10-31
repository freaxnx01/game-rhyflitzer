# bulldog.glb — licence and credit

- **Title:** Chevrolet Caprice Classic Sedan
- **Author:** popit228fm (Sketchfab user popit228fm, https://sketchfab.com/popit228fm)
- **Source:** https://sketchfab.com/3d-models/chevrolet-caprice-classic-sedan-96200ce146014b858e2b284c123bbe42
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`bulldog.glb` is a derivative of that model, made with `tools/prepare-bulldog.mjs`. In the game the car is called "Rhy Bulldog";
the attribution above names the original work's title as the licence requires. The game is a non-commercial fan project and
shows no maker's badge.

## Modifications

- Units and frame: scaled to the real 2.946 m wheelbase in metres, rotated so the front points along +x, the origin between the axles, wheels on y = 0; the skinned doors placed by their joints.
- The four wheels split out of the shared wheel parts into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer.
- The grille script badge, the bowtie, the bonnet ornament and the front number plate removed.
- The texture atlas removed; new plain materials, and a livery texture drawn by the script (black with orange-yellow flames, the number 77) on the body panels.
- Added: a push bar on the nose and two tail lamps that light up with L, beside head lamps that do too.
- Normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
