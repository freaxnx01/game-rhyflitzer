# modelt.glb — licence and credit

- **Title:** Ford Model T Downloadable
- **Author:** Libau Media (Sketchfab user robinmikart, https://sketchfab.com/robinmikart)
- **Source:** https://sketchfab.com/3d-models/ford-model-t-downloadable-8cb1c1243c394144837a15f4722a2867
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`modelt.glb` is a derivative of that model, made with `tools/prepare-modelt.mjs` (#521). In the game the car is called
"Tin Lizzie" (German: "Blechliesel"); the attribution above names the original work's title as the licence requires.

## Modifications

- Units and frame: scaled to the real 2.54 m wheelbase in metres, rotated so the front points along +x, the origin on the axle midpoint, wheels on y = 0.
- The four wheels split into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the wheel centre, so they roll and steer.
- The ten materials replaced by plain, mostly non-metallic ones of the same colours; the head lamp lenses and glass got game roles.
- A small red tail lamp added on the left rear (the original has none).
- Compressed with `EXT_meshopt_compression`.
