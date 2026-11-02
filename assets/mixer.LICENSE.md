# mixer.glb — licence and credit

- **Title:** Magirus D serie mixer truck
- **Author:** Randonavt (Sketchfab user Randonavt, https://sketchfab.com/Randonavt)
- **Source:** https://sketchfab.com/3d-models/magirus-d-serie-mixer-truck-2816fbf6ca4d489592282b77dbf1c28e
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`mixer.glb` is a derivative of that model, made with `tools/prepare-mixer.mjs`. In the game the truck is called "Rhy Mixer";
the attribution above names the original work's title as the licence requires. The game is a non-commercial fan project and
shows no maker's badge.

## Modifications

- Units and frame: scaled to 1.07 m truck tyres in metres (7.2 m long), rotated so the front points along +x, the origin between the front axle and the tandem, wheels on y = 0.
- The six wheels (front axle, two tandem axles with twin tyres) moved into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`, `wheel_RL2`, `wheel_RR2`) with the origin on the axle, so they roll and steer.
- The drum moved into its own node on its axis, so the game turns it.
- The front and rear number plates removed.
- The cab's and the drum's livery textures kept; all other textures removed and replaced by plain materials, all double-sided as in the original.
- Simplified from about 127k to 35k triangles, normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
