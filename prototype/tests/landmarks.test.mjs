import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEMEINDEN, LANDMARK_INFO, foldText, landmarkEntries, filterLandmarks, gemeindenOf } from '../landmarks.js';

const ANCHORS = { muenster: { x: -1331, z: -172.7 }, smileKreisel: { x: 1270, z: -148 } };
const BUILDINGS = [{ id: '171822634', ring: [[0, 0], [10, 0], [10, 20], [0, 20]] }];
const INFO = [
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Bodenackerstrasse 6c', gemeinde: 'Sisseln', building: 171822634 },
  { name: 'Fridolinsmünster', gemeinde: 'Bad Säckingen', anchor: 'muenster' },
  { name: 'Gone', gemeinde: 'Stein', anchor: 'notInWorld' },
  { name: 'Gone too', gemeinde: 'Eiken', building: 1 },
];

test('foldText drops accents and case', () => {
  assert.equal(foldText('Fridolinsmünster'), 'fridolinsmunster');
  assert.equal(foldText('MÜNST'), 'munst');
  assert.equal(foldText('Bad Säckingen'), 'bad sackingen');
});

test('landmarkEntries takes anchor positions and building ring means', () => {
  const e = landmarkEntries(INFO, ANCHORS, BUILDINGS);
  assert.deepEqual(e.find(x => x.n === 'Fridolinsmünster'), { n: 'Fridolinsmünster', g: 'Bad Säckingen', x: -1331, z: -172.7 });
  assert.deepEqual(e.find(x => x.n === 'Bodenackerstrasse 6c'), { n: 'Bodenackerstrasse 6c', g: 'Sisseln', x: 5, z: 10 });
});

test('landmarkEntries skips sources missing from the world', () => {
  const names = landmarkEntries(INFO, ANCHORS, BUILDINGS).map(x => x.n);
  assert.ok(!names.includes('Gone'));
  assert.ok(!names.includes('Gone too'));
  assert.equal(names.length, 3);
});

test('landmarkEntries orders west to east by Gemeinde, then by table order', () => {
  assert.deepEqual(landmarkEntries(INFO, ANCHORS, BUILDINGS).map(x => x.n), ['Fridolinsmünster', 'Smile-Kreisel', 'Bodenackerstrasse 6c']);
});

test('landmarkEntries copes with a world without anchors or buildings', () => {
  assert.deepEqual(landmarkEntries(INFO, undefined, undefined), []);
});

test('filterLandmarks searches names accent-blind and combines with the Gemeinde', () => {
  const e = landmarkEntries(INFO, ANCHORS, BUILDINGS);
  assert.deepEqual(filterLandmarks(e, 'munst', null).map(x => x.n), ['Fridolinsmünster']);
  assert.deepEqual(filterLandmarks(e, ' Münst ', null).map(x => x.n), ['Fridolinsmünster']);
  assert.deepEqual(filterLandmarks(e, '', 'Sisseln').map(x => x.n), ['Smile-Kreisel', 'Bodenackerstrasse 6c']);
  assert.deepEqual(filterLandmarks(e, 'smile', 'Sisseln').map(x => x.n), ['Smile-Kreisel']);
  assert.deepEqual(filterLandmarks(e, 'smile', 'Bad Säckingen'), []);
  assert.deepEqual(filterLandmarks(e, 'sisseln', null), []);   // Gemeinde is not searched, only names
  assert.equal(filterLandmarks(e, '', null).length, 3);
});

test('gemeindenOf lists the Gemeinden present, west to east', () => {
  assert.deepEqual(gemeindenOf(landmarkEntries(INFO, ANCHORS, BUILDINGS)), ['Bad Säckingen', 'Sisseln']);
});

test('LANDMARK_INFO holds the 14 landmarks of the spec', () => {
  assert.equal(LANDMARK_INFO.length, 14);
  for (const l of LANDMARK_INFO) {
    assert.ok(GEMEINDEN.includes(l.gemeinde), l.name);
    assert.ok(!!l.anchor !== !!l.building, `${l.name}: exactly one of anchor / building`);
  }
  assert.deepEqual(GEMEINDEN, ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln']);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.building).map(l => [l.name, l.building]),
    [['Bodenackerstrasse 6c', 171822634], ['Bodenackerstrasse 10B', 171822943]]);
});
