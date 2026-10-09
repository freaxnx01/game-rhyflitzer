// #7: the car selection screen's pure rules. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAINTS, DEFAULT_CHOICE, STAT_KEYS, statBars, barCells, cycle, paintable, parseChoice, initialChoice, carselKeyAction, spinStep, lookShift, vehicleText, SPIN_RESUME, SPIN_AUTO, SPIN_KEY } from '../carselect.js';

const COMPACT = { model: 'compact', drive: { top: 60, accel: 16, grip: 9, steerRate: 2.6 }, mass: 1.0 };
const TRACTOR = { model: 'gltf', drive: { top: 11.1, accel: 6, grip: 30, steerRate: 2.2 }, mass: 2.5 };   // #6 spec values
const BUS = { model: 'gltf', drive: { top: 22, accel: 4, grip: 6, steerRate: 1.1 }, mass: 8 };
const IDS = ['compact', 'bus'], PAINT_IDS = PAINTS.map(p => p.id);

test('PAINTS: eleven unique ids and hexes, navy first, purple and pink from #25, one orange, every hex #rrggbb', () => {
  assert.equal(PAINTS.length, 11);
  assert.equal(new Set(PAINT_IDS).size, 11);
  assert.equal(new Set(PAINTS.map(p => p.hex)).size, 11);
  assert.equal(PAINTS[0].id, 'navy'); assert.equal(PAINTS[0].hex, '#1b2d5e');
  assert.equal(PAINTS.find(p => p.id === 'plum')?.hex, '#7b3fa0');
  assert.equal(PAINTS.find(p => p.id === 'flamingo')?.hex, '#ff6fa8');
  assert.deepEqual(PAINTS.filter(p => p.hex === '#ff7a1a').map(p => p.id), ['signal']);   // #25's orange is the mockup's Signal, not a second entry
  for (const p of PAINTS) { assert.match(p.hex, /^#[0-9a-f]{6}$/, p.id); assert.ok(p.nameKey.startsWith('paint'), p.id); }
  assert.deepEqual(DEFAULT_CHOICE, { id: 'compact', paint: 'navy' });
});

test('statBars: compact 8 / 8 / 8 / 3, tractor and bus from the #6 table, integers clamped to 1..10', () => {
  assert.deepEqual(statBars(COMPACT), { top: 8, accel: 8, handling: 8, mass: 3 });
  assert.deepEqual(statBars(TRACTOR), { top: 1, accel: 3, handling: 10, mass: 8 });
  assert.deepEqual(statBars(BUS), { top: 3, accel: 2, handling: 5, mass: 10 });
  assert.deepEqual(statBars({ ...COMPACT, drive: { ...COMPACT.drive, top: 30 }, mass: 2 }), { top: 4, accel: 8, handling: 8, mass: 7 });
  const zero = statBars({ drive: { top: 0, accel: 0, grip: 0, steerRate: 0 }, mass: 0 }), huge = statBars({ drive: { top: 1e9, accel: 1e9, grip: 1e9, steerRate: 1e9 }, mass: 1e9 });
  for (const k of STAT_KEYS) { assert.equal(zero[k], 1, k); assert.equal(huge[k], 10, k); assert.ok(Number.isInteger(statBars(COMPACT)[k]), k); }
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
  assert.deepEqual(parseChoice('{"id":"tank","paint":"ice"}', IDS, PAINT_IDS), { id: 'compact', paint: 'ice' });
  assert.deepEqual(parseChoice('{"id":"bus","paint":"zebra"}', IDS, PAINT_IDS), { id: 'bus', paint: 'navy' });
  assert.deepEqual(parseChoice('{"id":"constructor"}', IDS, PAINT_IDS), DEFAULT_CHOICE);
  assert.notEqual(parseChoice(null, IDS, PAINT_IDS), DEFAULT_CHOICE);   // a copy, never the constant itself
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
});

test('vehicleText: strings when they exist, the id as the name otherwise, never a raw key', () => {
  const tr = (k) => ({ veh_compact_name: 'Sissle Speedster', veh_compact_class: 'Compact · Class B' })[k] ?? k;
  assert.equal(vehicleText(tr, 'compact', 'name'), 'Sissle Speedster');
  assert.equal(vehicleText(tr, 'compact', 'class'), 'Compact · Class B');
  assert.equal(vehicleText(tr, 'compact', 'desc'), '');
  assert.equal(vehicleText(tr, 'bus', 'name'), 'bus');
  assert.equal(vehicleText(tr, 'bus', 'class'), '');
});
