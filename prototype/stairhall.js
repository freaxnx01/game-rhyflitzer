// #411 stage 1: the stair hall of Bodenackerstrasse 6c as walkways (walkways.js). Pure: no three.js, no DOM.
// Hall frame: origin O on the facade line at the porch door's axis; a = metres into the building (heading entrance.th), b = to the right, so
// world(a, b) = O + a * (cos th, sin th) + b * (-sin th, cos th); the porch is at a < 0. Plan (a, b), walls 0.15 thick:
//   b -1.35 .. -1.2 left wall | stairs -1.2 .. 1.2 (inner width 2.40) | 1.2 .. 1.35 divider | lift shaft 1.35 .. 2.5 | 2.5 .. 2.65 right wall
//   a 0 .. 0.15 facade wall | landing 0.15 .. 1.3 | flights 1.3 .. 3.5 (left up, right back up, well wall between) | half landing 3.5 .. 4.7 | back wall to 4.85
// Levels 0..9 are EG and 1.-9. OG, level 10 is the roof; the housing around the tower rises to housingTop. Spec: docs/superpowers/specs/2026-10-22-enter-6c-stage1-design.md
import { emptyWalkways } from './walkways.js';

export const STAIRHALL = {
  storeys: 10,
  wall: 0.15, inner: 2.40,
  land: 1.3, run: 2.2, half: 1.2, depth: 4.85,
  b0: -1.35, b1: 2.65,                              // the tower's outer width, shaft included
  shaft: { b0: 1.35, b1: 2.5, a0: 0.15, a1: 1.25 },
  liftDoor: { a0: 0.3, a1: 1.1, h: 2.1 }, frontDoor: { b0: -0.6, b1: 0.6, h: 2.2 }, roofDoor: { a0: 0.35, a1: 1.25, h: 2.1 },
  window: { b0: -0.6, b1: 0.6, sill: 0.9, top: 2.0 },
  rail: 1.1, porchH: 3.0, door: 1.0,
};

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
export const FLOOR_LABELS = {
  de: (k) => (k === 0 ? 'EG' : k === 10 ? 'Dach' : `${k}. OG`),
  en: (k) => (k === 0 ? 'ground floor' : k === 10 ? 'roof' : `${ORDINAL[k]} floor`),
};
// "6c · 4. OG" / "6c · 4th floor"
export const floorLabel = (k, lang) => (FLOOR_LABELS[lang] || FLOOR_LABELS.en)(k);
export const keypadLabel = (k, lang) => (k === 0 ? 'EG' : k === 10 ? (lang === 'de' ? 'Dach' : 'Roof') : String(k));
export const hudFloorText = (house, k, lang) => `${house} · ${floorLabel(k, lang)}`;

// the eleven level heights: EG at eg, then one pitch each, the roof last
export function hallLevels(eg, floors, cfg = STAIRHALL) {
  const lv = Array.from({ length: cfg.storeys }, (_, k) => eg + k * floors.pitch);
  lv.push(floors.roof);
  return lv;
}

// the storey a walker at height y is on: the highest level at most stepUp above the feet (a half landing still counts as the lower storey)
export function floorAtY(levels, y, reach = 0.6) {
  let k = 0;
  for (let i = 0; i < levels.length; i++) if (levels[i] <= y + reach) k = i;
  return k;
}

export function hallFrame(entrance, porchDepth) {
  const c = Math.cos(entrance.th), s = Math.sin(entrance.th), ox = entrance.x + c * porchDepth, oz = entrance.z + s * porchDepth;
  return {
    ox, oz, th: entrance.th, c, s,
    toWorld: (a, b) => [ox + c * a - s * b, oz + s * a + c * b],
    fromWorld: (x, z) => ({ a: (x - ox) * c + (z - oz) * s, b: -(x - ox) * s + (z - oz) * c }),
  };
}

const rectAB = (f, a0, a1, b0, b1) => { const [x, z] = f.toWorld((a0 + a1) / 2, (b0 + b1) / 2); return { x, z, hw: (a1 - a0) / 2, hd: (b1 - b0) / 2, c: f.c, s: f.s }; };
// a ramp climbing from a0 (height y0) to a1 (height y1); a1 < a0 turns it around
function rampAB(f, a0, a1, b0, b1, y0, y1) {
  const r = rectAB(f, Math.min(a0, a1), Math.max(a0, a1), b0, b1);
  return a1 >= a0 ? { ...r, y0, y1 } : { ...r, c: -f.c, s: -f.s, y0, y1 };
}

// layout(entrance, porch, floors, eg) -> the hall: { frame, levels, walk, windows, doors, cabinRect, ... }. porch = { w, d } from bodenackerHouse().
export function stairHall(entrance, porch, floors, eg, cfg = STAIRHALL) {
  const f = hallFrame(entrance, porch.d), lv = hallLevels(eg, floors, cfg), top = floors.housingTop, walk = emptyWalkways();
  const wall = (tag, a0, a1, b0, b1, y0, y1) => walk.walls.push({ ...rectAB(f, a0, a1, b0, b1), y0, y1, tag });
  const slab = (a0, a1, b0, b1, y) => walk.slabs.push({ ...rectAB(f, a0, a1, b0, b1), y });
  const { wall: t, land, run, half, depth, b0, b1 } = cfg, aFl = land + run;   // aFl = 3.5, where the flights meet the half landing
  const L = (k) => lv[k], roof = L(cfg.storeys), N = cfg.storeys;

  // floors: EG over the whole footprint and the porch, the storey landings, the half landings, the door thresholds
  slab(-porch.d, 0, -porch.w / 2, porch.w / 2, L(0));
  slab(0, depth, b0, b1, L(0));
  for (let k = 1; k <= N; k++) slab(t, land, -1.2, 1.2, L(k));
  for (let k = 0; k < N; k++) slab(aFl, aFl + half, -1.2, 1.2, (L(k) + L(k + 1)) / 2);
  for (let k = 0; k <= N; k++) slab(cfg.liftDoor.a0, cfg.liftDoor.a1, 1.2, 1.35, L(k));
  // flights: left climbs away from the landing, right climbs back to it
  for (let k = 0; k < N; k++) {
    const mid = (L(k) + L(k + 1)) / 2;
    walk.ramps.push(rampAB(f, land, aFl, -1.2, -0.1, L(k), mid));
    walk.ramps.push(rampAB(f, aFl, land, 0.1, 1.2, mid, L(k + 1)));
  }

  // walls. Front (façade) wall: EG with the door, then one piece per storey (a window each on 1. OG ... 9. OG)
  wall('front:0:l', 0, t, b0, cfg.frontDoor.b0, L(0), L(1));
  wall('front:0:r', 0, t, cfg.frontDoor.b1, b1, L(0), L(1));
  wall('front:0:lintel', 0, t, cfg.frontDoor.b0, cfg.frontDoor.b1, L(0) + cfg.frontDoor.h, L(1));
  for (let k = 1; k < N; k++) wall(`front:${k}`, 0, t, b0, b1, L(k), L(k + 1));
  wall(`front:${N}`, 0, t, b0, b1, roof, top);
  // left wall, back wall, right of the stairs, the shaft's right and back wall: the whole height
  wall('left', t, depth, b0, -1.2, L(0), roof);
  wall('back', depth - t, depth, b0, 1.35, L(0), top);
  wall('right', 1.4, depth, 1.2, 1.35, L(0), top);
  wall('shaft:right', t, 1.4, 2.5, b1, L(0), top);
  wall('shaft:back', 1.25, 1.4, 1.35, 2.5, L(0), top);
  // the well between the flights: a wall up to a handrail over the roof; a rail across the left flight's top at roof level
  wall('well', land, aFl, -0.1, 0.1, L(0), roof + cfg.rail);
  wall('rail', land, land + 0.1, -1.2, -0.1, roof, roof + cfg.rail);
  // under the right flight and the half landing the EG headroom is too low to walk
  // (1.0 m high so that a walker on the half landing, 1.265 up, is not held by them; vy1 = how tall they are drawn)
  walk.walls.push({ ...rectAB(f, 2.05, depth - t, 0.1, 1.2), y0: L(0), y1: L(0) + 1.0, vy1: L(0) + 2.5, tag: 'under:r' });
  walk.walls.push({ ...rectAB(f, aFl, depth - t, -1.2, -0.1), y0: L(0), y1: L(0) + 1.0, vy1: L(0) + 2.5, tag: 'under:l' });
  // the divider between landing and shaft: a lift door gap per level (leaf = the door, lintel above it)
  const d = cfg.liftDoor;
  wall('divider:l', t, d.a0, 1.2, 1.35, L(0), top);
  wall('divider:r', d.a1, 1.4, 1.2, 1.35, L(0), top);
  for (let k = 0; k <= N; k++) {
    wall(`lift:${k}`, d.a0, d.a1, 1.2, 1.35, L(k), L(k) + d.h);
    wall(`liftLintel:${k}`, d.a0, d.a1, 1.2, 1.35, L(k) + d.h, k === N ? top : L(k + 1));
  }
  // the housing's side door onto the roof (left wall above the roof): the leaf is a wall that opens
  const r = cfg.roofDoor;
  wall('housing:left:a', t, r.a0, b0, -1.2, roof, top);
  wall('housing:left:b', r.a1, depth, b0, -1.2, roof, top);
  wall('roofDoor', r.a0, r.a1, b0, -1.2, roof, roof + r.h);
  wall('roofDoorLintel', r.a0, r.a1, b0, -1.2, roof + r.h, top);
  // the porch: side panes, the front with the door leaf between two side lights, a roof
  const pw = porch.w / 2;
  wall('porch:l', -porch.d, 0, -pw - 0.05, -pw, L(0), L(0) + cfg.porchH);
  wall('porch:r', -porch.d, 0, pw, pw + 0.05, L(0), L(0) + cfg.porchH);
  wall('porch:front:l', -porch.d - 0.05, -porch.d, -pw, -cfg.door / 2, L(0), L(0) + cfg.porchH);
  wall('porch:front:r', -porch.d - 0.05, -porch.d, cfg.door / 2, pw, L(0), L(0) + cfg.porchH);
  wall('porch:door', -porch.d - 0.05, -porch.d, -cfg.door / 2, cfg.door / 2, L(0), L(0) + cfg.frontDoor.h);
  wall('porch:lintel', -porch.d - 0.05, -porch.d, -cfg.door / 2, cfg.door / 2, L(0) + cfg.frontDoor.h, L(0) + cfg.porchH);
  walk.ceilings.push({ ...rectAB(f, -porch.d, 0, -pw, pw), y: L(0) + cfg.porchH });
  // the housing's roof; the roof deck itself is added by the caller (it needs the building's ring): hallRoofSlab()
  walk.ceilings.push({ ...rectAB(f, 0, depth, b0, b1), y: top - 0.15 });

  const windows = [];
  for (let k = 1; k < N; k++) windows.push({ k, a: 0, b0: cfg.window.b0, b1: cfg.window.b1, y0: L(k) + cfg.window.sill, y1: L(k) + cfg.window.top });
  const flatDoors = Array.from({ length: N }, (_, k) => ({ k, a: 0.75, b: -1.2, y: L(k) }));   // closed doors on the left wall, visual only
  const cabinRect = rectAB(f, cfg.shaft.a0, cfg.shaft.a1, cfg.shaft.b0, cfg.shaft.b1);
  return { frame: f, levels: lv, walk, windows, flatDoors, cabinRect, porch, entrance, housingTop: top,
    towerRect: rectAB(f, 0, depth, b0, b1), roofHole: rectAB(f, 0, depth, b0, b1), housing: { a0: 0, a1: depth, b0, b1, y0: roof, y1: top } };
}

// the roof deck: the body ring as a polygon with the tower cut out; rails along its edge (invisible, 1.2 m)
export function hallRoofSlab(hall, bodyWorld) {
  const roof = hall.levels[hall.levels.length - 1], walk = hall.walk;
  walk.slabs.push({ poly: bodyWorld, holes: [hall.roofHole], y: roof });
  for (let i = 0; i < bodyWorld.length; i++) {
    const [ax, az] = bodyWorld[i], [bx, bz] = bodyWorld[(i + 1) % bodyWorld.length], len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    walk.walls.push({ x: (ax + bx) / 2, z: (az + bz) / 2, hw: len / 2 + 0.2, hd: 0.1, c: (bx - ax) / len, s: (bz - az) / len, y0: roof, y1: roof + 1.2, tag: 'edge' });
  }
}

// where a point is relative to the hall: 'out', 'porch' or 'tower'
export function hallArea(hall, x, z, cfg = STAIRHALL) {
  const { a, b } = hall.frame.fromWorld(x, z), pw = hall.porch.w / 2;
  if (a >= 0 && a <= cfg.depth && b >= cfg.b0 && b <= cfg.b1) return 'tower';
  if (a >= -hall.porch.d && a < 0 && Math.abs(b) <= pw) return 'porch';
  return 'out';
}

// the building's own collider (the OSM outline) must not push the walker out of the porch or the tower; at an open door it stands aside
export function bodyColliderOff(hall, x, z, doorOpen, reach = 1.5) {
  if (hallArea(hall, x, z) !== 'out') return true;
  return doorOpen && Math.hypot(x - hall.entrance.x, z - hall.entrance.z) <= reach;
}

// the walkway wall with this tag, to open/close doors
export const wallByTag = (hall, tag) => hall.walk.walls.find(w => w.tag === tag);

// what a walker at the door of the entrance can do: the leaf opens by E; it shuts again when the walker is `closeAt` m away
export const DOOR_CLOSE_AT = 4;
export const doorShouldClose = (hall, x, z, area) => area === 'out' && Math.hypot(x - hall.entrance.x, z - hall.entrance.z) > DOOR_CLOSE_AT;
