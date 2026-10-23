import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HATCHBACK, WHEEL_NODES, wheelPlan, wheelEntries, tableWheels } from '../hatchback.js';
import { loadStep, buildableId, modelUrl, paintOnSelect, lampRole, raceBlocked } from '../gltfvehicle.js';
import { PAINTS, DEFAULT_CHOICE, paintable, statBars, parseChoice, initialChoice, withPaint } from '../carselect.js';
import { checkSound } from '../sound.js';
import { checkCrash } from '../impact.js';

// the compact as in index.html's VEHICLES table (numbers that the Hatchback is compared against)
const COMPACT = { model: 'compact', drive: { top: 60, accel: 16, grip: 9 }, mass: 1.0 };
const IDS = ['compact', 'delorean', 'hatchback'], PAINT_IDS = PAINTS.map(p => p.id);
const CENTRES = { wheel_FL: [1.36, 0.33, -0.77], wheel_FR: [1.36, 0.33, 0.77], wheel_RL: [-1.36, 0.33, -0.77], wheel_RR: [-1.36, 0.33, 0.77] };

test('HATCHBACK_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(HATCHBACK.model, 'gltf');
  assert.deepEqual(HATCHBACK.collision, { shape: 'circle', r: 1.25 });
  assert.ok([HATCHBACK.drive.top, HATCHBACK.drive.accel, HATCHBACK.drive.grip, HATCHBACK.mass, HATCHBACK.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(HATCHBACK.sound));
  assert.doesNotThrow(() => checkCrash(HATCHBACK.sound.crash));
  assert.equal(HATCHBACK.sound.engine.cylinders, 4);
});

test('HATCHBACK_Entry_LivelierAndHeavierThanTheCompactWithOwnSound', () => {
  assert.ok(HATCHBACK.drive.top > COMPACT.drive.top && HATCHBACK.drive.grip > COMPACT.drive.grip && HATCHBACK.drive.accel > COMPACT.drive.accel);
  assert.ok(HATCHBACK.mass > COMPACT.mass);
  assert.ok(HATCHBACK.sound.engine.limitRpm > 6800, 'higher revving than the compact (limit 6800)');
  assert.deepEqual(statBars(HATCHBACK), { top: 9, accel: 9, handling: 9, mass: 4 });
});

test('HATCHBACK_Paint_RepaintableWithRedDefault', () => {
  assert.equal(paintable(HATCHBACK), true);
  assert.equal(paintable({ model: 'gltf' }), false, 'a fixed-paint glTF stays unpaintable');
  assert.equal(PAINTS.find(p => p.id === HATCHBACK.defaultPaint).hex, '#e0322d');
});

test('HATCHBACK_Camera_HasEveryViewTheTableNeeds', () => {
  for (const k of ['chase', 'near', 'cockpit', 'bumper', 'drone']) assert.ok(HATCHBACK.camera[k], k);
  assert.equal(HATCHBACK.camera.cockpit.eye.length, 3);
});

test('parseChoice_Hatchback_AcceptedAndUnknownFallsBackToCompact', () => {
  assert.deepEqual(parseChoice('{"id":"hatchback","paint":"ice"}', IDS, PAINT_IDS), { id: 'hatchback', paint: 'ice' });
  assert.deepEqual(parseChoice('{"id":"tank","paint":"ice"}', IDS, PAINT_IDS), { id: 'compact', paint: 'ice' });
  assert.equal(DEFAULT_CHOICE.id, 'compact');
  assert.deepEqual(initialChoice(null, '?vehicle=hatchback', IDS, PAINT_IDS), { id: 'hatchback', paint: 'navy' });
});

test('wheelPlan_AllFourNodes_FrontsFirstPerSideLeftIsMinusZ', () => {
  assert.deepEqual(wheelPlan([...WHEEL_NODES, 'body']), [
    { name: 'wheel_FL', front: true, side: -1 }, { name: 'wheel_FR', front: true, side: 1 },
    { name: 'wheel_RL', front: false, side: -1 }, { name: 'wheel_RR', front: false, side: 1 }]);
});

test('wheelPlan_MissingWheel_ThrowsNamingIt', () => {
  assert.throws(() => wheelPlan(['body', 'wheel_FL', 'wheel_FR', 'wheel_RR']), /wheel_RL missing/);
});

test('wheelEntries_FromCentres_GivesAxleXHalfTrackAndRadius', () => {
  const e = wheelEntries(CENTRES);
  assert.deepEqual(e.map(w => [w.name, w.x, w.z, w.r]), [['wheel_FL', 1.36, -0.77, 0.33], ['wheel_FR', 1.36, 0.77, 0.33], ['wheel_RL', -1.36, -0.77, 0.33], ['wheel_RR', -1.36, 0.77, 0.33]]);
});

test('tableWheels_FromEntries_MatchesTheHatchbackTable', () => {
  assert.deepEqual(tableWheels(wheelEntries(CENTRES)), HATCHBACK.wheels);
});

test('loadStep_Lifecycle_IdleLoadingReadyOrFailed', () => {
  assert.equal(loadStep('idle', 'want'), 'loading');
  assert.equal(loadStep('loading', 'loaded'), 'ready');
  assert.equal(loadStep('loading', 'error'), 'failed');
  assert.equal(loadStep('loading', 'want'), 'loading', 'a second highlight does not start a second load');
});

test('loadStep_FailedAndReady_AreSticky', () => {
  assert.equal(loadStep('failed', 'want'), 'failed', 'no retry storm in one session');
  assert.equal(loadStep('ready', 'want'), 'ready');
  assert.equal(loadStep('idle', 'loaded'), 'idle', 'an event out of order changes nothing');
});

test('buildableId_GltfNotReady_IsTheFallback', () => {
  for (const s of ['idle', 'loading', 'failed']) assert.equal(buildableId('hatchback', HATCHBACK, s), 'compact');
  assert.equal(buildableId('hatchback', HATCHBACK, 'ready'), 'hatchback');
  assert.equal(buildableId('compact', COMPACT, 'idle'), 'compact', 'a procedural car never waits');
});

test('modelUrl_Override_OnlyAllowListedAssetPaths', () => {
  assert.equal(modelUrl(HATCHBACK, ''), './assets/hatchback.glb');
  assert.equal(modelUrl(HATCHBACK, '?vehicle=hatchback&glb=./assets/missing.glb'), './assets/missing.glb');
  for (const bad of ['https://evil.example/x.glb', '//evil.example/x.glb', './assets/../index.html', './assets/a.html', '/etc/passwd'])
    assert.equal(modelUrl(HATCHBACK, `?glb=${encodeURIComponent(bad)}`), './assets/hatchback.glb', bad);
});

test('paintOnSelect_FactoryPaint_BecomesDefaultPaintOtherwiseKept', () => {
  assert.equal(paintOnSelect(HATCHBACK, 'navy'), 'swiss');
  assert.equal(paintOnSelect(HATCHBACK, 'ice'), 'ice');
  assert.equal(paintOnSelect(COMPACT, 'navy'), 'navy', 'a car without defaultPaint keeps the paint');
});

test('lampRole_Extras_HeadTailOrNull', () => {
  assert.equal(lampRole({ lamp: 'head' }), 'head');
  assert.equal(lampRole({ lamp: 'tail' }), 'tail');
  for (const x of [undefined, null, {}, { lamp: 'roof' }, { paint: true }]) assert.equal(lampRole(x), null);
});

test('raceBlocked_GltfWhileIdleOrLoading_TrueOtherwiseFalse', () => {
  assert.equal(raceBlocked(HATCHBACK, 'loading'), true);
  assert.equal(raceBlocked(HATCHBACK, 'idle'), true);
  assert.equal(raceBlocked(HATCHBACK, 'ready'), false);
  assert.equal(raceBlocked(HATCHBACK, 'failed'), false, 'a failed load falls back, the button must not hang');
  assert.equal(raceBlocked(COMPACT, 'idle'), false);
});

test('paintOnSelect_ChosenPaint_StaysEvenIfItIsTheFactoryNavy', () => {
  assert.equal(paintOnSelect(HATCHBACK, 'navy', true), 'navy', 'a deliberately chosen navy stays');
  assert.equal(paintOnSelect(HATCHBACK, 'navy', false), 'swiss');
  assert.equal(paintOnSelect(HATCHBACK, 'ice', false), 'ice');
});

test('parseChoice_PaintChosenFlag_KeptOnlyWhenTrueOldChoicesStillWork', () => {
  assert.deepEqual(parseChoice('{"id":"compact","paint":"navy","paintChosen":true}', IDS, PAINT_IDS), { id: 'compact', paint: 'navy', paintChosen: true });
  assert.deepEqual(parseChoice('{"id":"compact","paint":"navy"}', IDS, PAINT_IDS), { id: 'compact', paint: 'navy' }, 'an old stored choice has no flag');
  assert.deepEqual(parseChoice('{"id":"compact","paint":"navy","paintChosen":"yes"}', IDS, PAINT_IDS), { id: 'compact', paint: 'navy' });
});

test('initialChoice_QueryVehicle_KeepsThePaintChosenFlag', () => {
  const stored = '{"id":"compact","paint":"navy","paintChosen":true}';
  assert.deepEqual(initialChoice(stored, '?vehicle=hatchback', IDS, PAINT_IDS), { id: 'hatchback', paint: 'navy', paintChosen: true });
});

test('withPaint_PlayerPicksPaint_MarksItChosenWithoutMutating', () => {
  const before = { id: 'compact', paint: 'navy' };
  assert.deepEqual(withPaint(before, 'navy'), { id: 'compact', paint: 'navy', paintChosen: true });
  assert.deepEqual(before, { id: 'compact', paint: 'navy' });
});
