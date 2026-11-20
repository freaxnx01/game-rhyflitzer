// #620: Deep Space Nine with the U.S.S. Defiant docked, in ring-2 room 1 -- pure numbers, no three.js, no DOM: the descriptor
// loadModel reads. The station hovers like the Enterprise (#491), so it shares that room's machinery: `hover` sends loadModel
// down the hovering-ship branch, enterprisePlacement puts it over the room centre and stepEnterprise bobs it; the room takes
// the Enterprise room's holodeck-and-stars look (SPACE_LOOK / HOLODECK / starField in enterprise.js).
// Unit-tested with `node --test tests/ds9.test.mjs`.
//
// The model (assets/models/ds9.glb, tools/prepare-ds9.mjs) is in metres at the maintainer's 50 %: the station 726 m across
// (1450 m full size) and 493.9 m tall, its axis on x = z = 0 and its lowest point on y = 0, with the 85.4 m Defiant docked at
// the outer docking ring on +x -- so the model's +x is the side the Defiant is on. Measured 2026-11-17: 721.6 x 717.7 m in the
// bounding box (726 m is the widest radius doubled, and that radius lies off the axes), the ring's mid-plane 246.9 m up.
export const DS9 = {
  key: 'ds9', h: 493.9, diameter: 726, scale: 1, anchor: [0, 0, 0],
  hover: 25,                                   // the lowest pylon over the floor: the car and the bus drive under it
  yaw: Math.PI / 6,                            // the Defiant's side towards the portal, turned 30 degrees to the right: it is in view on arrival
  bob: { amp: 1, period: 20 },                 // a station drifts slower and less than a ship, metres and seconds
  // the helicopter ceiling in this room only (rooms.js: roomLayout's fly.ceiling), so the station's 519 m top can be flown
  // round -- 51 m over it, and still 30 m under ring 1's floor 600 m above this one
  ceiling: 570,
  url: './assets/models/ds9.glb', loadWithin: 400,
};
