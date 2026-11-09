# estate.glb — licence and credit

- **Title:** 2009 Skoda Octavia Combi
- **Author:** tonielpro520 (Sketchfab user tonielpro520, https://sketchfab.com/tonielpro520)
- **Source:** https://sketchfab.com/3d-models/2009-skoda-octavia-combi-9b9f212d14b34d44bebf9fbb22afa54a
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`estate.glb` is a derivative of that model, made with `tools/prepare-estate.mjs`. In the game the car is called "Rhy Estate"
(German "Rhy Kombi"); the attribution above names the original work's title as the licence requires. The game is a non-commercial
fan project and shows no maker's badge.

## Modifications

- Units and frame: scaled to a 2.578 m wheelbase in metres (4.57 m long), rotated so the front points along +x, the origin between the axles, wheels on y = 0.
- The tyres, rims, brake discs and hub parts grouped into four wheel nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer; set symmetric.
- The badges removed: the grille, the tailgate and the four wheel centres.
- The textures and the original materials replaced by plain materials, all double-sided; the body paint is a separate material the game colours; the head lamp covers and the red lenses light up with the head lamps and the brakes.
- Simplified from about 484k to about 28k triangles; normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
