// navi.js — turn-by-turn guidance on a route from route.js (#106). Pure: no DOM, no window, so node --test can import it.
// A route is { pts, cum, len, joints: [{ s, deg }] }; turnAt(route, s) > 0 turns right. The Navi only reads — it never
// drives: no keys, no car state, no turn signals (the autopilot of #18 does that).
import { turnAt, trackRoute } from './route.js';

export const NAVI = {
  minTurnDeg: 30, slightMaxDeg: 60, sharpMinDeg: 120, uturnMinDeg: 165,   // turn classes (same 30 deg rule as the autopilot's blinkers, #18)
  passedM: 3,                  // a junction this far behind the car is done
  nowM: 30,                    // closer than this: "now"
  offRouteM: 25, offRouteS: 1.5, replanGapS: 3,   // leave the route by 25 m for 1.5 s -> plan again, at most every 3 s
  arriveM: 20,                 // arrived: this close to the end of the route
};

const rad2deg = (r) => r * 180 / Math.PI;

export function turnKind(rad) {
  const deg = Math.abs(rad2deg(rad));
  if (deg < NAVI.minTurnDeg) return null;
  if (deg >= NAVI.uturnMinDeg) return 'uturn';
  const side = rad > 0 ? 'Right' : 'Left';
  return (deg < NAVI.slightMaxDeg ? 'slight' : deg >= NAVI.sharpMinDeg ? 'sharp' : 'turn') + side;
}

// The next instruction-worthy turn at or ahead of s: a junction of 3+ roads where the route turns by 30 deg or more
export function nextManeuver(route, s) {
  for (const j of route.joints) {
    if (j.deg < 3 || j.s < s - NAVI.passedM) continue;
    const turn = turnAt(route, j.s), kind = turnKind(turn);
    if (kind) return { kind, dist: Math.max(0, j.s - s), turn, s: j.s };
  }
  return null;
}

// Metres as the panel shows them: 10 m steps below 100 m, 50 m steps below 1 km, then km. value 0 means "now".
export function roundDistance(m) {
  if (m < NAVI.nowM) return { value: 0, unit: 'm' };
  if (m < 100) return { value: Math.round(m / 10) * 10, unit: 'm' };
  if (m < 975) return { value: Math.round(m / 50) * 50, unit: 'm' };
  return { value: Math.round(m / 100) / 10, unit: 'km' };
}

export const newNaviState = () => ({ s: 0, offT: 0, sincePlan: 0 });

// afterReplan: the state of a fresh route
export function afterReplan(st) { st.s = 0; st.offT = 0; st.sincePlan = 0; }

export function naviStep(st, route, x, z, dt) {
  const t = trackRoute(route, x, z, st.s);
  if (Number.isFinite(t.d)) st.s = t.s;
  st.offT = t.d > NAVI.offRouteM ? st.offT + dt : 0;
  st.sincePlan += dt;
  const left = Math.max(0, route.len - st.s);
  const arrived = left <= NAVI.arriveM && t.d <= NAVI.arriveM;
  const replan = !arrived && st.offT >= NAVI.offRouteS && st.sincePlan >= NAVI.replanGapS;
  return { s: st.s, off: t.d, left, man: nextManeuver(route, st.s), arrived, replan };
}

// What the panel says: a turn ahead, a turn right now, or the remaining distance to the destination.
// `left` is the distance to the destination for the panel's second line; it never rounds to 0, so the
// last stretch reads "Destination in 30 m" instead of "Destination in 0 m" (the Navi ends 20 m before the end anyway).
export function describe(step) {
  const left = roundDistance(Math.max(NAVI.nowM, step.left));
  if (!step.man) return { type: 'dest', kind: null, dist: left, left, angle: 0 };
  const close = step.man.dist < NAVI.nowM;
  return { type: close ? 'now' : 'in', kind: step.man.kind, dist: roundDistance(step.man.dist), left, angle: rad2deg(step.man.turn) };
}
