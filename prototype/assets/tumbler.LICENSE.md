# tumbler.glb — licence and credit

- **Title:** Batmobile-The Dark Knight Tumbler
- **Author:** Gravity Jack (Sketchfab user gravityjack, https://sketchfab.com/gravityjack)
- **Source:** https://sketchfab.com/3d-models/batmobile-the-dark-knight-tumbler-7ae346a9724a40faa467a3107dfb09e9
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`tumbler.glb` is a derivative of that model, made with `tools/prepare-tumbler.mjs`. In the game the car is called
"Rhy Tumbler"; the attribution above names the original work's title as the licence requires. The licence covers the model,
not the design of the film car it depicts; the game is a non-commercial fan project and shows no logo.

## Modifications

- Units and frame: scaled to the film car's 4.57 m length in metres, rotated so the front points along +x, the origin between the axles, wheels on y = 0.
- The four wheels in their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`, the two rear tyres split by side) with the origin at the tyre centre, so they roll and steer.
- The animation removed.
- The windscreen given a plain glass material and the head lamps a plain lamp material that lights up with L; the body keeps the textured atlas with a lower metalness.
- Textures converted to 1024 px WebP, geometry compressed with `EXT_meshopt_compression`.
