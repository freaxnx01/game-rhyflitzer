// #462: the steam locomotive's numbers -- after an SBB A 3/5 (a Swiss 4-6-0 with a separate tender), no logo, no real number.
// Model metres: x forward, y up, z right; origin on the rail top at mid-length; the front buffer at +length/2. locomesh.js draws these.
export const LOCO = {
  length: 18.6, width: 3.0, height: 4.3,
  front: 9.3, tenderFront: -2.4, rear: -9.3,                // loco frame from tenderFront + 0.3 to front; tender from rear to tenderFront
  drivers: [3.9, 2.0, 0.1], driverR: 0.89,                   // three coupled driving axles, red spoked wheels
  bogie: [7.6, 6.3], bogieR: 0.43,                          // the leading bogie
  tenderWheels: [-3.6, -5.6, -7.6], tenderR: 0.5,
  boiler: { x0: 0.9, x1: 8.5, r: 0.82, y: 2.75 },
  smokebox: { x0: 7.7, x1: 8.7, r: 0.88 },
  chimney: [7.9, 4.3, 0], dome: [4.6, 3.95, 0],
  cabBox: { x0: -2.1, x1: 0.9, y0: 1.4, y1: 4.0 },
  tenderBox: { x0: -9.3, x1: -2.4, y0: 1.0, y1: 3.2 },
  cab: [-0.4, 3.2, 0.75],                                   // the cab view's eye: right-hand side, looking past the boiler
  crank: 0.35, rodY: 0.9,
  colours: { body: 0x16181b, wheel: 0xb3261e, beam: 0xb3261e, roof: 0x2a2d31, coal: 0x0f0f10, brass: 0xc9a43a, frame: 0x101113 },
};
export const wheelTurn = (dist, r) => dist / r;
export const rodOffset = (angle, crank) => [crank * Math.cos(angle), crank * Math.sin(angle)];
