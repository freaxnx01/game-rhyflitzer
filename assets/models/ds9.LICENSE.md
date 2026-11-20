# ds9.glb — licences and credits

`ds9.glb` holds two models, both used under **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/:

| Part | Title | Author | Source |
|---|---|---|---|
| the station | „Deep Space Nine - Star Trek" | **rossrobotics** (https://sketchfab.com/rossrobotics) | https://sketchfab.com/3d-models/deep-space-nine-star-trek-3e1743fc00be4d83848c7d890b8a5988 |
| the docked ship | „U.S.S. Defiant" | **Feltman_Langer** (https://sketchfab.com/Feltman_Langer) | https://sketchfab.com/3d-models/uss-defiant-8e875133c49240699d3b19de324826cf |

`ds9.glb` is a derivative of both, made with `tools/prepare-ds9.mjs` from the unmodified originals kept at
`assets/src/ds9_station.glb` and `assets/src/uss_defiant.glb` (each with its own LICENSE.md). The game is a
non-commercial fan project; it credits both authors in the F1 help, `CREDITS.md`, `README.md` and `CHANGELOG.md`.

## Modifications (#620)

- **Half scale, in metres, +y up:** the station is 726 m across (1450 m full size) and 493.9 m tall, its axis on
  x = z = 0 and its lowest point on y = 0; the Defiant is 85.4 m long (170.7 m full size) — the same 50 %.
- **The station:** the six meshes of the original STL scan welded on position, joined into one, and decimated from
  410'493 to 69'989 triangles; one material `Hull` (`#9a9ea3`, metallic 0.35, roughness 0.55) replaces the
  original's untextured white one.
- **The Defiant:** decimated from 118'213 to 20'452 triangles, one primitive per material; its stray default cube
  (`Cube_0`, material `Material`) dropped; its lamp, window, deflector, bussard, engine and impulse materials given
  an emissive equal to their base colour, so they read against the dark room. The bow turned from the original's
  +y onto the model's +x.
- **Docked:** the Defiant sits in its own node at the station's outer docking ring on +x, turned 180° about y so
  its bow points back at the axis, its nose tip 1 m outside the ring's widest radius (363 m) at the ring's
  mid-plane (246.9 m over the station's lowest point).
- Normals rebuilt with a 40° crease, texture coordinates dropped (neither original has a texture), geometry
  compressed with `EXT_meshopt_compression`.
