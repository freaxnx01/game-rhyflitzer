# harvester.glb — licence and credit

- **Title:** Harvester Near Completion
- **Author:** webbsketches (Sketchfab user webbsketches, https://sketchfab.com/webbsketches)
- **Source:** https://sketchfab.com/3d-models/harvester-near-completion-cc4bf1104f2840ddad4b3aaa68fc3f74
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`harvester.glb` is a derivative of that model, made with `tools/prepare-harvester.mjs`. In the game the combine is called
"Rhy Harvester"; the attribution above names the original work's title as the licence requires. The game is a non-commercial
fan project and shows no maker's badge.

## Modifications

- Units and frame: scaled to 1.8 m front tyres in metres (11.7 m long, the header 9.9 m wide), rotated so the front points along +x, the origin between the axles, wheels on y = 0.
- The wheel parts, which held both wheels of an axle, cut at the centre plane into four wheel nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer.
- The reel moved into its own node on its axis, so the game turns it.
- All textures removed (with them a small emblem on the header); new plain materials, all double-sided as in the original: the body is white and takes the paint colour chosen in the game, the rims grey, the cab's lamp strips light up with the head lamps.
- Simplified from about 120k to 35k triangles, normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
