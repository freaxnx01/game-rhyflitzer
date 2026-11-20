# tanker.glb — licence and credit

- **Title:** MAN TGX 2010 V8 – High-Detail Semi-Truck
- **Author:** DevPoly3D (Sketchfab user DevPoly3D, https://sketchfab.com/DevPoly3D)
- **Source:** https://sketchfab.com/3d-models/man-tgx-2010-v8-high-detail-semi-truck-34ce748d9a4b4de7b035cfe5cb97f5d1
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`tanker.glb` is a derivative of that model, made with `tools/prepare-tanker.mjs`. In the game the truck is called "Rhy Tanker";
the attribution above names the original work's title as the licence requires. The game is a non-commercial fan project and
shows no maker's badge.

## Modifications

- Only the cab and the wheels of the original tractor unit are used. Its frame with the fifth wheel, the fuel tanks, the rear
  mudguards, the side rail and the rear lamp bar are cut away.
- Units and frame: scaled to 1.07 m truck tyres in metres (the cab 2.54 m wide, 3.9 m high), rotated so the front points along +x,
  the origin between the front axle and the tandem, wheels on y = 0.
- Unbranded: the "MAN" lettering, the lion badge and the "V8" badge on the grille, the number plate's lettering and the "MAN"
  lettering on the rear mudguard are removed; the tyre textures (sidewalls reading "YOKOHAMA 104ZR") and every other texture
  are dropped. The blue paint is now green; all materials are plain colours, double-sided as in the original.
- Generated and added: a rigid chassis (the truck about 9.8 m long) with a third axle (the rear wheel pair split by side and cloned, the
  front wheels straightened), a white elliptic tank with an orange-red stripe, walkway, rails, manlids and ladder, side
  lockers, a hose cabinet, hazard diamonds, blank orange ADR plates, a rear bumper with lamps and a drawbar coupling; and a
  two-axle drawbar tank trailer in the same livery (A-frame drawbar, turntable, frame, tank, fittings, four wheels cloned from
  the front wheels) as its own node, so the game swings it.
- Wheel nodes `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`, `wheel_RL2`, `wheel_RR2` and `trailer_wheel_L1/R1/L2/R2` with the
  origin on the axle, so they roll and the front ones steer.
- The original's 38k triangles become about 40k in all (the cab and wheels simplified, the generated parts added), normals
  rebuilt, geometry compressed with `EXT_meshopt_compression`.
