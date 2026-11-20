# Rhy Tanker, a heating-oil tanker with an articulated drawbar trailer (#1103) — design

## Intent

A new drivable vehicle after the maintainer's photos (2026-11-20): a Swiss heating-oil delivery truck, a modern three-axle
rigid truck with a white tank, pulling a two-axle drawbar tank trailer in the same livery. The trailer **swings** behind the
truck in corners (maintainer: "der Anhänger soll beweglich sein").

## Decisions (maintainer, 2026-11-20)

- **Base model:** the cab from Sketchfab "MAN TGX 2010 V8 – High-Detail Semi-Truck" by DevPoly3D, CC BY 4.0
  (https://sketchfab.com/3d-models/man-tgx-2010-v8-high-detail-semi-truck-34ce748d9a4b4de7b035cfe5cb97f5d1), a two-axle tractor
  unit. Everything else — the third axle, the rigid chassis, the tank with its walkway and ladder, the drawbar trailer — is
  generated **in the prepare tool** (`tools/prepare-tanker.mjs`) and baked into `assets/tanker.glb`.
  Rejected: the "FTRC MAN TGS-E" (a race truck covered in sponsor logos, ripped from an Assetto Corsa mod) and the Magirus D
  tanker (complete, but a 1970s look).
- **Trailer:** visual only, angle-limited. It follows the hitch with drawbar kinematics, swings out in corners, its wheels
  roll; the jackknife angle is clamped to ±70°. Only the truck collides; the trailer may clip through a wall in a tight turn.
- **Unbranded** (project rule for third-party vehicles): no maker badges (the TGX has MAN lettering on the grille and the rear),
  no oil-company or loyalty-card logos, no plate numbers, phone numbers or web addresses. Livery: green cab and chassis, white
  tanks with an orange-red stripe. Generic orange ADR plates (blank) front and rear and the two hazard diamonds (flammable
  liquid: red; environment: white) at the rear may stay.

## Goals

1. `tanker` in `VEHICLES`, type `utility`, fixed livery (`paint: false`), English **Rhy Tanker**, German **Rhy Tanklaster**,
   with a class and description like the other vehicles.
2. The trailer swings: driving a constant circle settles it at a steady angle with the trailer **inside** the turn; driving
   straight on brings it back to 0; reversing makes it fold until the ±70° clamp.
3. The trailer's four wheels roll with the speed.
4. Shows in Choose car, the gallery, the vehicle depot (#553: a long vehicle, the south row) and as a multiplayer remote car;
   parked and gallery trailers stand straight; a remote trailer swings from the sender's pose stream.
5. Credited wherever the other models are (`strings.js` credit de/en, the about/credits markup, README, `assets/tanker.LICENSE.md`).

## Non-goals

- No collision for the trailer, no trailer in the depot's solid; no coupling/uncoupling; no fuel-delivery gameplay.
- No lettering texture ("Heizöl" etc.), no numbers on the ADR plates.

## Numbers

- Truck: about 9.5 m long, 2.55 m wide, cab like the TGX; three axles (front, tandem); tyre diameter 1.07 m (12 R 22.5, as the
  mixer). Tank about 6 m long behind the cab.
- Trailer: drawbar 1.6 m from the truck's rear hitch to the trailer's front axle; trailer body about 7 m, two axles 4.5 m apart.
- Drive (heavy, laden): top 80 km/h (22.2 m/s), slow off the line, wide in corners, mass 9 (the Fizz is 7);
  collision a capsule over the truck only.
- Depot footprint: truck + drawbar + trailer, about 19 m, still under the strip's 30 m depth.
