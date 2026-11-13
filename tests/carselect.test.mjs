// #7: the car selection screen's pure rules. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAINTS, paintFinish, DEFAULT_CHOICE, STAT_KEYS, statBars, barCells, cycle, paintable, parseChoice, withPaint, withChair, chairable, initialChoice, carselKeyAction, spinStep, lookShift, vehicleText, SPIN_RESUME, SPIN_AUTO, SPIN_KEY, THUMB, thumbView, thumbKey, nextThumb, VEHICLE_TYPES, powerClass, classLine, galleryOrder, selectableIds, STAND_IN_IDS, stagePose } from '../carselect.js';

const COMPACT = { model: 'compact', drive: { top: 60, accel: 16, grip: 9, steerRate: 2.6 }, mass: 1.0 };
const TRACTOR = { model: 'gltf', drive: { top: 11.1, accel: 6, grip: 30, steerRate: 2.2 }, mass: 2.5 };   // #6 spec values
const BUS = { model: 'gltf', drive: { top: 22, accel: 4, grip: 6, steerRate: 1.1 }, mass: 8 };
const IDS = ['compact', 'bus'], PAINT_IDS = PAINTS.map(p => p.id);

test('PAINTS: thirteen unique ids and hexes, navy first, purple and pink from #25, one orange, racing blue for the Rhy Hyper, silver metallic last, every hex #rrggbb', () => {
  assert.equal(PAINTS.length, 13);
  assert.equal(new Set(PAINT_IDS).size, 13);
  assert.equal(new Set(PAINTS.map(p => p.hex)).size, 13);
  assert.equal(PAINTS.at(-1).id, 'silver');
  assert.equal(PAINTS[0].id, 'navy'); assert.equal(PAINTS[0].hex, '#1b2d5e');
  assert.equal(PAINTS.find(p => p.id === 'plum')?.hex, '#7b3fa0');
  assert.equal(PAINTS.find(p => p.id === 'flamingo')?.hex, '#ff6fa8');
  assert.deepEqual(PAINTS.filter(p => p.hex === '#ff7a1a').map(p => p.id), ['signal']);   // #25's orange is the mockup's Signal, not a second entry
  for (const p of PAINTS) { assert.match(p.hex, /^#[0-9a-f]{6}$/, p.id); assert.ok(p.nameKey.startsWith('paint'), p.id); }
  assert.deepEqual(DEFAULT_CHOICE, { id: 'hatchback', paint: 'navy' });   // #830: the hatchback is the start car
});

test('paintFinish_SilverIsMetallic_EveryOtherPaintKeepsTheModelsOwnFinish', () => {
  const base = { metalness: 0.25, roughness: 0.35 }, silver = PAINTS.find(p => p.id === 'silver');
  const f = paintFinish(silver, base);
  assert.ok(f.metalness > base.metalness && f.metalness < 1, 'metallic, but not a mirror: the car still reads without a sky map');
  assert.deepEqual(paintFinish(PAINTS.find(p => p.id === 'navy'), base), base);
  assert.deepEqual(paintFinish(PAINTS.find(p => p.id === 'navy'), { metalness: 0, roughness: 0.38 }), { metalness: 0, roughness: 0.38 });
});

test('statBars: compact 8 / 8 / 8 / 3, tractor and bus from the #6 table, integers clamped to 1..10', () => {
  assert.deepEqual(statBars(COMPACT), { top: 8, accel: 8, handling: 8, mass: 3 });
  assert.deepEqual(statBars(TRACTOR), { top: 1, accel: 3, handling: 10, mass: 8 });
  assert.deepEqual(statBars(BUS), { top: 3, accel: 2, handling: 5, mass: 10 });
  assert.deepEqual(statBars({ ...COMPACT, drive: { ...COMPACT.drive, top: 30 }, mass: 2 }), { top: 4, accel: 8, handling: 8, mass: 7 });
  const zero = statBars({ drive: { top: 0, accel: 0, grip: 0, steerRate: 0 }, mass: 0 }), huge = statBars({ drive: { top: 1e9, accel: 1e9, grip: 1e9, steerRate: 1e9 }, mass: 1e9 });
  for (const k of STAT_KEYS) { assert.equal(zero[k], 1, k); assert.equal(huge[k], 10, k); assert.ok(Number.isInteger(statBars(COMPACT)[k]), k); }
  assert.throws(() => statBars({ mass: 1 }), /statBars/);                                   // no drive: fail fast, never NaN bars
  assert.throws(() => statBars({ drive: { top: 60, accel: 16 }, mass: 1 }), /statBars/);    // grip missing
  assert.throws(() => statBars({ ...COMPACT, mass: 'heavy' }), /statBars/);
});

test('barCells: lit cells, the last lit one is the tip, the rest off', () => {
  assert.deepEqual(barCells(3), ['lit', 'lit', 'tip', 'off', 'off', 'off', 'off', 'off', 'off', 'off']);
  assert.deepEqual(barCells(1), ['tip', ...Array(9).fill('off')]);
  assert.deepEqual(barCells(10), [...Array(9).fill('lit'), 'tip']);
});

test('cycle wraps both ways', () => {
  assert.equal(cycle(0, 3, 1), 1); assert.equal(cycle(2, 3, 1), 0); assert.equal(cycle(0, 3, -1), 2); assert.equal(cycle(0, 1, 1), 0); assert.equal(cycle(0, 1, -1), 0);
});

test('paintable: procedural models yes, glTF only when the entry opts in, paint: false always wins', () => {
  assert.equal(paintable(COMPACT), true);
  assert.equal(paintable(BUS), false);
  assert.equal(paintable({ ...BUS, paint: true }), true);
  assert.equal(paintable({ ...COMPACT, paint: false }), false);
});

test('parseChoice: a valid choice passes, every kind of garbage falls back field by field', () => {
  assert.deepEqual(parseChoice('{"id":"bus","paint":"ice"}', IDS, PAINT_IDS), { id: 'bus', paint: 'ice' });
  assert.deepEqual(parseChoice(null, IDS, PAINT_IDS), DEFAULT_CHOICE);
  assert.deepEqual(parseChoice('', IDS, PAINT_IDS), DEFAULT_CHOICE);
  assert.deepEqual(parseChoice('not json', IDS, PAINT_IDS), DEFAULT_CHOICE);
  assert.deepEqual(parseChoice('42', IDS, PAINT_IDS), DEFAULT_CHOICE);
  assert.deepEqual(parseChoice('{"id":"tank","paint":"ice"}', IDS, PAINT_IDS), { id: 'hatchback', paint: 'ice' });
  assert.deepEqual(parseChoice('{"id":"bus","paint":"zebra"}', IDS, PAINT_IDS), { id: 'bus', paint: 'navy' });
  assert.deepEqual(parseChoice('{"id":"constructor"}', IDS, PAINT_IDS), DEFAULT_CHOICE);
  assert.notEqual(parseChoice(null, IDS, PAINT_IDS), DEFAULT_CHOICE);   // a copy, never the constant itself
});

test('parseChoice: keeps a true chair flag, drops anything else; an old stored choice reads as chair off', () => {
  const mini = parseChoice('{"id":"mini","paint":"navy","chair":true}', ['compact', 'mini'], PAINT_IDS);
  assert.equal(mini.chair, true);
  assert.deepEqual(mini, { id: 'mini', paint: 'navy', chair: true });   // nothing but the three known fields
  for (const bad of ['"yes"', '1', 'false', 'null', '[]']) {
    const c = parseChoice(`{"id":"mini","paint":"navy","chair":${bad}}`, ['compact', 'mini'], PAINT_IDS);
    assert.ok(!('chair' in c), bad);                                     // absent, not false: old deepEquals stay valid
  }
  assert.deepEqual(parseChoice('{"id":"compact","paint":"navy"}', ['compact', 'mini'], PAINT_IDS), { id: 'compact', paint: 'navy' });   // written before the chair existed
});

test('withChair: on adds the flag, off removes it; chairable: only vehicles that declare the option', () => {
  assert.deepEqual(withChair({ id: 'mini', paint: 'navy' }, true), { id: 'mini', paint: 'navy', chair: true });
  assert.deepEqual(withChair({ id: 'mini', paint: 'navy', chair: true }, false), { id: 'mini', paint: 'navy' });
  assert.equal(chairable({ options: { chair: true } }), true);
  assert.equal(chairable({ options: { chair: 'yes' } }), false);
  assert.equal(chairable({}), false);
  assert.equal(chairable(null), false);
});

test('statBars: the Little Classic (#463) — top 7, accel 9, handling 9, mass 3', () => {
  assert.deepEqual(statBars({ drive: { top: 54, accel: 17, grip: 10 }, mass: 0.75 }), { top: 7, accel: 9, handling: 9, mass: 3 });
});

test('initialChoice: ?vehicle= wins over the stored id for this load, unknown ids are ignored, paint stays', () => {
  assert.deepEqual(initialChoice('{"id":"compact","paint":"ice"}', '?vehicle=bus', IDS, PAINT_IDS), { id: 'bus', paint: 'ice' });
  assert.deepEqual(initialChoice('{"id":"bus","paint":"ice"}', '?vehicle=tank', IDS, PAINT_IDS), { id: 'bus', paint: 'ice' });
  assert.deepEqual(initialChoice(null, '?debug&vehicle=bus', IDS, PAINT_IDS), { id: 'bus', paint: 'navy' });
  assert.deepEqual(initialChoice(null, '', IDS, PAINT_IDS), DEFAULT_CHOICE);
});

test('carselKeyAction: Esc backs out, arrows spin, Tab / Enter / Space stay native, every game key is ignored', () => {
  assert.equal(carselKeyAction({ code: 'Escape' }), 'back');
  assert.equal(carselKeyAction({ code: 'ArrowLeft' }), 'spin'); assert.equal(carselKeyAction({ code: 'ArrowRight' }), 'spin');
  for (const c of ['Tab', 'Enter', 'NumpadEnter', 'Space']) assert.equal(carselKeyAction({ code: c }), 'pass', c);
  for (const c of ['KeyT', 'KeyC', 'KeyR', 'KeyH', 'KeyM', 'KeyJ', 'KeyF', 'KeyB', 'KeyV', 'KeyG', 'KeyP', 'KeyL', 'F1', 'F3', 'ArrowUp', 'ArrowDown', 'KeyW', 'ControlLeft']) assert.equal(carselKeyAction({ code: c }), 'ignore', c);
});

test('spinStep: idle turntable turns by itself, a held arrow takes over, auto resumes after SPIN_RESUME seconds', () => {
  const idle = spinStep({ angle: 0, idle: SPIN_RESUME }, 0.1, { dir: 0, drag: 0 });
  assert.ok(Math.abs(idle.angle - SPIN_AUTO * 0.1) < 1e-12, idle.angle);
  const held = spinStep({ angle: 1, idle: SPIN_RESUME }, 0.1, { dir: 1, drag: 0 });
  assert.ok(Math.abs(held.angle - (1 + SPIN_KEY * 0.1)) < 1e-12, held.angle); assert.equal(held.idle, 0);
  const still = spinStep(held, 0.5, { dir: 0, drag: 0 });
  assert.equal(still.angle, held.angle); assert.equal(still.idle, 0.5);
  let s = still; for (let i = 0; i < 20; i++) s = spinStep(s, 0.1, { dir: 0, drag: 0 });
  assert.ok(s.idle >= SPIN_RESUME && s.angle > still.angle, JSON.stringify(s));
  const dragged = spinStep({ angle: 0, idle: 5 }, 0.1, { dir: 0, drag: 50 });
  assert.ok(Math.abs(dragged.angle - 0.5) < 1e-12, dragged.angle); assert.equal(dragged.idle, 0);
  const wrapped = spinStep({ angle: 6.2, idle: 0 }, 0.1, { dir: 1, drag: 0 });
  assert.ok(wrapped.angle >= 0 && wrapped.angle < 2 * Math.PI, wrapped.angle);
  const back = spinStep({ angle: 0.05, idle: 0 }, 0.1, { dir: -1, drag: 0 });
  assert.ok(back.angle > 6 && back.angle < 2 * Math.PI, back.angle);
});

test('lookShift: a centred stage shifts nothing; a stage left of centre moves the look target to the right of the car', () => {
  assert.deepEqual(lookShift(0, 0, 10, 62, 16 / 9), [0, 0]);
  const [right, up] = lookShift(-0.4, 0.2, 10, 62, 2);
  const halfH = 10 * Math.tan(31 * Math.PI / 180);
  assert.ok(Math.abs(right - 0.4 * halfH * 2) < 1e-12, right); assert.ok(right > 0);
  assert.ok(Math.abs(up + 0.2 * halfH) < 1e-12, up); assert.ok(up < 0);
  assert.throws(() => lookShift(NaN, 0, 10, 62, 2), /lookShift/);                          // a broken stage rect fails fast instead of a silent 0
  assert.throws(() => lookShift(0, 0, 10, 62, undefined), /lookShift/);
});

test('vehicleText: strings when they exist, the id as the name otherwise, never a raw key', () => {
  const tr = (k) => ({ veh_compact_name: 'Sissle Speedster', veh_compact_class: 'Compact · Class B' })[k] ?? k;
  assert.equal(vehicleText(tr, 'compact', 'name'), 'Sissle Speedster');
  assert.equal(vehicleText(tr, 'compact', 'class'), 'Compact · Class B');
  assert.equal(vehicleText(tr, 'compact', 'desc'), '');
  assert.equal(vehicleText(tr, 'bus', 'name'), 'bus');
  assert.equal(vehicleText(tr, 'bus', 'class'), '');
});

// #626: the garage gallery
test('thumbView: looks at the box centre from the front-left, as close as the bounding sphere fits the frame\'s width', () => {
  const box = { min: [-2.3, 0, -0.9], max: [2.2, 1.5, 0.9] }, v = thumbView(box);
  assert.deepEqual(v.at.map(c => +c.toFixed(6)), [-0.05, 0.75, 0]);
  const d = v.eye.map((c, i) => c - v.at[i]), dist = Math.hypot(...d), r = Math.hypot(4.5, 1.5, 1.8) / 2;
  assert.ok(d[0] > 0 && d[1] > 0 && d[2] < 0, `front (+x), above, left (-z): ${d}`);
  const halfW = Math.atan(Math.tan((THUMB.fov / 2) * Math.PI / 180) * THUMB.w / THUMB.h);
  assert.ok(dist * Math.sin(halfW) >= r && dist * Math.sin(halfW) < r * 1.2, `the bounding sphere just fits the horizontal field of view: ${dist}`);
  const bus = thumbView({ min: [-6, 0, -1.3], max: [6, 3.2, 1.3] });
  assert.ok(Math.hypot(...bus.eye.map((c, i) => c - bus.at[i])) > dist * 2, 'a 12 m bus is photographed from further away');
});

test('thumbView: fails fast on a box that is not three finite numbers per corner', () => {
  assert.throws(() => thumbView({ min: [0, 0], max: [1, 1, 1] }), /thumbView/);
  assert.throws(() => thumbView({ min: [0, NaN, 0], max: [1, 1, 1] }), /thumbView/);
});

test('thumbKey: a paintable car needs a photo per paint, a car in its own colours one photo', () => {
  assert.equal(thumbKey('compact', 'navy', true), 'compact|navy');
  assert.notEqual(thumbKey('compact', 'navy', true), thumbKey('compact', 'silver', true));
  assert.equal(thumbKey('bus', 'navy', false), thumbKey('bus', 'silver', false));
});

test('nextThumb: the current car first, then table order; skips cached and not-yet-loaded cars; null when nothing is left', () => {
  const ids = ['compact', 'bus', 'estate', 'mini'];
  assert.equal(nextThumb(ids, 'estate', () => false, () => true), 'estate');
  assert.equal(nextThumb(ids, 'estate', id => id === 'estate', () => true), 'compact');
  assert.equal(nextThumb(ids, 'compact', id => id === 'compact', id => id !== 'bus'), 'estate');
  assert.equal(nextThumb(ids, 'compact', () => true, () => true), null);
  assert.equal(nextThumb(ids, 'compact', () => false, () => false), null);
});

// ---- #493: type chips and the power class ----
const car = (top, accel, type) => ({ type, mass: 1, drive: { top, accel, grip: 9 } });

test('powerClass: the top-speed and acceleration bars together give A (17+), B (14+), C (10+), D', () => {
  assert.equal(powerClass(car(83.3, 21)), 'A');   // the hypercar: 10 + 10
  assert.equal(powerClass(car(56, 19)), 'A');     // the rally car: 7 + 10
  assert.equal(powerClass(car(60, 16)), 'B');     // the compact: 8 + 8
  assert.equal(powerClass(car(49, 10)), 'C');     // the DeLorean: 7 + 5
  assert.equal(powerClass(car(38, 9)), 'C');      // the three-wheeler: 5 + 5
  assert.equal(powerClass(car(20, 5)), 'D');      // the Model T: 3 + 3, not class A any more
  assert.throws(() => powerClass({ mass: 1, drive: { top: 60 } }), /numeric/);
});

test('classLine: the type name from the strings, then the computed class; the class alone when a vehicle has no type name', () => {
  const table = { veh_compact_class: 'Compact', powerClass: (c) => `Class ${c}` }, tr = (k, ...a) => typeof table[k] === 'function' ? table[k](...a) : table[k] ?? k;
  assert.equal(classLine(tr, 'compact', car(60, 16)), 'Compact · Class B');
  assert.equal(classLine(tr, 'custom', car(20, 5)), 'Class D');
});

test('galleryOrder: the chosen type only, strongest first, table order on a tie; all shows every vehicle', () => {
  const defs = { compact: car(60, 16, 'everyday'), hyper: car(83.3, 21, 'sport'), modelt: car(20, 5, 'everyday'), estate: car(57.5, 13.5, 'everyday'), knight: car(61.1, 15, 'screen'), odd: car(50, 10) };
  const ids = Object.keys(defs);
  assert.deepEqual(VEHICLE_TYPES, ['everyday', 'sport', 'utility', 'screen']);
  assert.deepEqual(galleryOrder(ids, defs, 'everyday'), ['compact', 'estate', 'modelt']);
  assert.deepEqual(galleryOrder(ids, defs, 'all'), ['hyper', 'compact', 'knight', 'estate', 'odd', 'modelt']);   // compact and knight tie at 16
  assert.deepEqual(galleryOrder(ids, defs, 'utility'), []);
  assert.throws(() => galleryOrder(ids, defs, 'boats'), /type/);
});

// ---- #830: the Sissle Speedster retires ----
test('selectableIds: the stand-in compact is never offered, order and other ids kept (#830)', () => {
  assert.deepEqual(STAND_IN_IDS, ['compact']);
  assert.deepEqual(selectableIds(['compact', 'hatchback', 'delorean', 'slow']), ['hatchback', 'delorean', 'slow']);
  assert.deepEqual(selectableIds([]), []);
});

test('initialChoice: a stored or queried compact becomes the hatchback, its paint kept (#830)', () => {
  const ids = selectableIds(['compact', 'hatchback', 'bus']);
  assert.deepEqual(initialChoice('{"id":"compact","paint":"ice","paintChosen":true}', '', ids, PAINT_IDS), { id: 'hatchback', paint: 'ice', paintChosen: true });
  assert.deepEqual(initialChoice('{"id":"bus","paint":"ice"}', '?vehicle=compact', ids, PAINT_IDS), { id: 'bus', paint: 'ice' });
  assert.deepEqual(initialChoice(null, '?vehicle=compact', ids, PAINT_IDS), { id: 'hatchback', paint: 'navy' });
});

// ---- #903: the car-selection stage frames the parked car on foot, not the walker ----
test('stagePose_OnFootWithParkedCar_ReturnsTheParkedPoseNotTheWalker', () => {
  const walker = { x: 1810, y: 28.8, z: 608, th: 0.3, vx: 1 }, parked = { x: 1810, y: 16.8, z: 610, th: 0 };
  assert.deepEqual(stagePose(parked, walker), { x: 1810, y: 16.8, z: 610, th: 0 });
});

test('stagePose_NoParkedCar_ReturnsThePlayerPose', () => {
  const p = { x: 5, y: 2, z: -3, th: 1.2, vx: 9 };
  assert.deepEqual(stagePose(null, p), { x: 5, y: 2, z: -3, th: 1.2 });
});
