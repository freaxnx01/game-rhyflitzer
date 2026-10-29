# beetle.glb — licence and credit

- **Title:** VW Beetle Florida v2
- **Author:** Libau Media (Sketchfab user robinmikart, https://sketchfab.com/robinmikart)
- **Source:** https://sketchfab.com/3d-models/vw-beetle-florida-v2-aa3c40db85234d1c9b261c5734ea99a9
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`beetle.glb` is a derivative of that model, made with `tools/prepare-beetle.mjs`. In the game the car is called
"Ladybug" (German: "Marienkäfer"); the attribution above names the original work's title as the licence requires.

## Modifications

- Units and frame: scaled to the real 2.40 m wheelbase in metres, rotated so the front points along +x, the origin on the axle midpoint, wheels on y = 0.
- The four wheels split into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the wheel centre, so they roll and steer; the steered front wheels turned straight.
- The open left door replaced by a mirror image of the closed right door.
- The photo texture removed: the licence plate is blank, the drag-strip timeslip sticker on the dashboard is gone.
- The eighteen materials replaced by plain, mostly non-metallic ones of the same colours; the head and tail lamps and the glass got game roles.
- Compressed with `EXT_meshopt_compression`.
