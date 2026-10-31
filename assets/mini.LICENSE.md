# mini.glb — licence and credit

- **Title:** Mr Bean Car FBX
- **Author:** Sxi.Sai (Sketchfab, https://sketchfab.com/Sxi.Sai)
- **Source:** https://sketchfab.com/3d-models/mr-bean-car-fbx-428dfc665ab4473fa1cdc42e498e64b2
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`mini.glb` is a derivative of that model, made with `tools/prepare-mini.mjs` (#468). In the game the car is called
"Little Classic"; the attribution above names the original work's title as the licence requires.

## Modifications

- Units and frame: scaled to 3.05 m length in metres, rotated so the front points along +x, centred between the tyres, wheels on y = 0.
- The four wheels split into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the wheel centre, so they roll and steer.
- The head and tail lamp lenses got their own materials so the game can light them; the unused normal map is gone.
- The paint recoloured from yellow toward Citron Green; the "I ♥ LONDON" sticker on the boot lid painted over.
- The 4096² texture shrunk to one 1024² JPEG; compressed with `EXT_meshopt_compression`.
