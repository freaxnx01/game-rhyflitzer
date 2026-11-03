# blaze.glb — licence and credit

- **Title:** Low Poly Fire Truck
- **Author:** jg-3d (Sketchfab user jg-3d, https://sketchfab.com/jg-3d)
- **Source:** https://sketchfab.com/3d-models/low-poly-fire-truck-688b7c17a0e54a05b0b2d51a8aee061b
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`blaze.glb` is a derivative of that model, made with `tools/prepare-blaze.mjs`. In the game the fire engine is called
"Rhy Blaze" (German: "Rhy Löschi"); the attribution above names the original work's title as the licence requires. The game is a
non-commercial fan project and shows no maker's badge, no crest, no lettering and no number plate.

## Modifications

- Frame: turned so the front points along +x, the origin between the axles, wheels on y = 0 (the original is already in metres: 7.3 m long).
- The tyres and rims, which shared one primitive per material for all four wheels, split into four wheel nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer.
- The blank front number plate removed.
- The blue roof lights split into a left and a right group, so the game flashes them in turn.
- New plain materials in the original colours, all double-sided; the head lamps and tail lamps light up with the game's lights.
- Normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
