import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEMEINDEN, LANDMARK_INFO, foldText, landmarkEntries, filterLandmarks, gemeindenOf, faceToward, rampApproach } from '../landmarks.js';

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

const BUILDINGS_46 = [
  ['Schloss Schönau (Trompeterschloss)', 'Bad Säckingen', 390621357],
  ['Gallusturm', 'Bad Säckingen', 25835477],
  ['Diebsturm', 'Bad Säckingen', 92036948],
  ['Bahnhof Bad Säckingen', 'Bad Säckingen', 25049518],
  ['Kursaal', 'Bad Säckingen', 91592556],
  ['Aqualon Therme', 'Bad Säckingen', 92039355],
  ['Bahnhof Eiken', 'Eiken', 199241726],
  ['Gemeindehaus Sisseln', 'Sisseln', 171822808],
  ['Schulhaus Sisseln', 'Sisseln', 171822721],
];

test('LANDMARK_INFO holds the 14 landmarks of #41, the 9 of #46 and the LANDI tower of #81', () => {
  assert.equal(LANDMARK_INFO.length, 24);
  for (const l of LANDMARK_INFO) {
    assert.ok(GEMEINDEN.includes(l.gemeinde), l.name);
    assert.ok(!!l.anchor !== !!l.building, `${l.name}: exactly one of anchor / building`);
  }
  assert.deepEqual(GEMEINDEN, ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln']);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.building).map(l => [l.name, l.gemeinde, l.building]),
    [['Schloss Schönau (Trompeterschloss)', 'Bad Säckingen', 390621357], ['Gallusturm', 'Bad Säckingen', 25835477],
     ['Diebsturm', 'Bad Säckingen', 92036948], ['Bahnhof Bad Säckingen', 'Bad Säckingen', 25049518],
     ['Kursaal', 'Bad Säckingen', 91592556], ['Aqualon Therme', 'Bad Säckingen', 92039355],
     ['Bahnhof Eiken', 'Eiken', 199241726],
     ['Bodenackerstrasse 6c', 'Sisseln', 171822634], ['Bodenackerstrasse 10B', 'Sisseln', 171822943],
     ['Gemeindehaus Sisseln', 'Sisseln', 171822808], ['Schulhaus Sisseln', 'Sisseln', 171822721]]);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.gemeinde === 'Eiken').map(l => l.name), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm']);
});

test('#46 entries resolve from their buildings, sort into their Gemeinde and are found accent-blind', () => {
  const square = (id, x) => ({ id: String(id), ring: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]] });
  const buildings = BUILDINGS_46.map(([, , id], i) => square(id, i * 100));
  const e = landmarkEntries(LANDMARK_INFO, {}, buildings);              // no anchors: only the building entries
  assert.deepEqual(e.map(x => [x.n, x.g]), BUILDINGS_46.map(([n, g]) => [n, g]));
  assert.deepEqual(e.find(x => x.n === 'Kursaal'), { n: 'Kursaal', g: 'Bad Säckingen', x: 405, z: 5 });
  assert.deepEqual(filterLandmarks(e, 'schonau', null).map(x => x.n), ['Schloss Schönau (Trompeterschloss)']);
  assert.deepEqual(filterLandmarks(e, 'trompeter', null).map(x => x.n), ['Schloss Schönau (Trompeterschloss)']);
  assert.deepEqual(filterLandmarks(e, 'bahnhof bad sackingen', null).map(x => x.n), ['Bahnhof Bad Säckingen']);
  assert.deepEqual(filterLandmarks(e, '', 'Eiken').map(x => x.n), ['Bahnhof Eiken']);
});

test('landmarkEntries passes a jump spot through as j (#79)', () => {
  const info = [{ name: 'Brücke', gemeinde: 'Stein', anchor: 'muenster', jump: [10, 20] }];
  assert.deepEqual(landmarkEntries(info, ANCHORS, []), [{ n: 'Brücke', g: 'Stein', x: -1331, z: -172.7, j: [10, 20] }]);
});

test('faceToward keeps a heading towards the target and flips one away from it (#79)', () => {
  assert.equal(faceToward(0, 0, 0, 10, 1), 0);
  assert.equal(faceToward(0, 0, 0, -10, 1), Math.PI);
  assert.equal(faceToward(Math.PI / 2, 5, 5, 5, 50), Math.PI / 2);
  assert.equal(faceToward(Math.PI / 2, 5, 5, 5, -50), Math.PI / 2 + Math.PI);
});

test('the Fridolinsbrücke jumps to the Swiss approach, east of the deck end (#79)', () => {
  const item = LANDMARK_INFO.find(x => x.name === 'Fridolinsbrücke');
  assert.ok(item.jump, 'Fridolinsbrücke has a jump spot');
  assert.ok(item.jump[0] > -1233.5, 'jump spot is east of the Swiss deck end (-1233.5, 533.5)');
  assert.ok(Math.hypot(item.jump[0] + 1233.5, item.jump[1] - 533.5) < 40, 'jump spot is near the Swiss deck end');
});

test('#81 LANDI-Turm resolves from its anchor, sits last in Eiken and is found by "landi"', () => {
  const anchors = { dsmChimney: { x: 1065.2, z: 345.1 }, stationSisseln: { x: 1854.2, z: 685.8 }, landiTurm: { x: 1832.7, z: 627.7 } };
  const e = landmarkEntries(LANDMARK_INFO, anchors, [{ id: '199241726', ring: [[2600, 900], [2610, 900], [2610, 910], [2600, 910]] }]);
  assert.deepEqual(e.map(x => x.n), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm']);
  assert.deepEqual(e.find(x => x.n === 'LANDI-Turm'), { n: 'LANDI-Turm', g: 'Eiken', x: 1832.7, z: 627.7 });
  assert.deepEqual(filterLandmarks(e, 'landi', null).map(x => x.n), ['LANDI-Turm']);
  assert.deepEqual(filterLandmarks(e, 'LANDI', 'Eiken').map(x => x.n), ['LANDI-Turm']);
  assert.deepEqual(landmarkEntries(LANDMARK_INFO, { dsmChimney: anchors.dsmChimney }, []).map(x => x.n), ['DSM-Kamin']);   // anchor missing: skipped
});

test('rampApproach stands runUp metres before the low edge, centred, facing up the ramp (+x)', () => {
  assert.deepEqual(rampApproach({ x0: 100, x1: 125.4, z0: 10, z1: 45.6, h: 3.4 }, 40), { x: 60, z: 27.8, th: 0 });
});

test('landmarkEntries passes the ramp flag through, and only for ramp items', () => {
  const info = [
    { name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp', ramp: true },
    { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  ];
  const e = landmarkEntries(info, { jumpRamp: { x: 337.8, z: 170.2 }, smileKreisel: { x: 1270, z: -148 } }, []);
  assert.deepEqual(e, [
    { n: 'Sprungschanze', g: 'Sisseln', x: 337.8, z: 170.2, ramp: true },
    { n: 'Smile-Kreisel', g: 'Sisseln', x: 1270, z: -148 },
  ]);
});

test('LANDMARK_INFO flags only the Sprungschanze as a ramp (#80)', () => {
  assert.deepEqual(LANDMARK_INFO.filter(l => l.ramp).map(l => l.name), ['Sprungschanze']);
});
