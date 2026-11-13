# delorean.glb — licence and credit

- **Title:** DeLorean DMC 12 (Animated)
- **Author:** JEX-D (Sketchfab user JEX-D, https://sketchfab.com/JEX-D)
- **Source:** https://sketchfab.com/3d-models/delorean-dmc-12-animated-e90955c1dce945dfbcac09886b9f310e
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`delorean.glb` is a derivative of that model, made with `tools/prepare-delorean.mjs` from the unmodified original kept at
`assets/src/delorean_dmc_12_animated.glb`. In the game the car is called "Rhy Gullwing"; the attribution above names the
original work's title as the licence requires. The game is a non-commercial fan project and shows no maker's badge, no
lettering and no number plate.

## Modifications

- Units and frame: scaled to the 2.41 m wheelbase in metres (4.26 m long, 1.78 m wide, 1.18 m to the roof), turned so the front points along +x and up is +y, the origin between the axles, the tyres on y = 0.
- The maker's three-letter name on the nose (the nodes `C`, `D`, `M`, `M.001`, 2'288 triangles between them) and the rear number plate removed.
- Two stray lamp meshes the author left 33 m under the car removed; they would have blown up the body box the game measures.
- Each axle's tyres and rims, one mesh per axle in the original, split by side into four wheel nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and the front pair steers; set symmetric.
- The two gull-wing doors moved into their own nodes (`door_L`, `door_R`) with the origin on the hinge at the roof spine, so the game can swing them up; the hinges set symmetric.
- All 18 animation clips dropped, the author's door animation among them: the game owns the door state and drives the two nodes itself.
- The 16 original materials merged into eight plain ones by role, all double-sided — `Steel`, `Dark`, `Glass`, `LampHead`, `LampTail`, `Rubber`, `Rim`, `Interior`. The head and tail lenses light up with the game's lights; the body's steel is replaced at build by the game's shared brushed steel, and no paint applies to it.
- Normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
