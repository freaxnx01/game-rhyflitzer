import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GEMEINDEN, LANDMARK_INFO, GEMEINDEN_EHRENDINGEN, LANDMARK_INFO_EHRENDINGEN, foldText, landmarkEntries, filterLandmarks, gemeindenOf, faceToward, rampApproach } from '../landmarks.js';

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

test('LANDMARK_INFO holds the 14 landmarks of #41, the 9 of #46, the LANDI tower of #81, the Südspange of #125, the Bergsee of #94 and the hideout of #102 and the food truck of #103', () => {
  assert.equal(LANDMARK_INFO.length, 28);
  for (const l of LANDMARK_INFO) {
    assert.ok(GEMEINDEN.includes(l.gemeinde), l.name);
    assert.equal([l.anchor, l.building, l.at].filter(Boolean).length, 1, `${l.name}: exactly one of anchor / building / at`);
  }
  assert.deepEqual(GEMEINDEN, ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln']);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.building).map(l => [l.name, l.gemeinde, l.building]),
    [['Schloss Schönau (Trompeterschloss)', 'Bad Säckingen', 390621357], ['Gallusturm', 'Bad Säckingen', 25835477],
     ['Diebsturm', 'Bad Säckingen', 92036948], ['Bahnhof Bad Säckingen', 'Bad Säckingen', 25049518],
     ['Kursaal', 'Bad Säckingen', 91592556], ['Aqualon Therme', 'Bad Säckingen', 92039355],
     ['Bahnhof Eiken', 'Eiken', 199241726],
     ['Bodenackerstrasse 6c', 'Sisseln', 171822634], ['Bodenackerstrasse 10B', 'Sisseln', 171822943],
     ['Gemeindehaus Sisseln', 'Sisseln', 171822808], ['Schulhaus Sisseln', 'Sisseln', 171822721]]);
  assert.deepEqual(LANDMARK_INFO.filter(l => l.gemeinde === 'Eiken').map(l => l.name), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm', 'Südspange Sisslerfeld', 'Güggeli-Foodtruck']);
});

test('#46 entries resolve from their buildings, sort into their Gemeinde and are found accent-blind', () => {
  const square = (id, x) => ({ id: String(id), ring: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]] });
  const buildings = BUILDINGS_46.map(([, , id], i) => square(id, i * 100));
  const e = landmarkEntries(LANDMARK_INFO, {}, buildings);              // no anchors: the building entries, plus the anchorless fixed points of #125 and #94
  const expected = BUILDINGS_46.map(([n, g]) => [n, g]);
  expected.splice(expected.findIndex(([n]) => n === 'Aqualon Therme') + 1, 0, ['Bergsee', 'Bad Säckingen']);
  expected.splice(expected.findIndex(([n]) => n === 'Bergsee') + 1, 0, ['Reservoir Hübel', 'Münchwilen']);
  expected.splice(expected.findIndex(([n]) => n === 'Bahnhof Eiken') + 1, 0, ['Südspange Sisslerfeld', 'Eiken']);
  assert.deepEqual(e.map(x => [x.n, x.g]), expected);
  assert.deepEqual(e.find(x => x.n === 'Kursaal'), { n: 'Kursaal', g: 'Bad Säckingen', x: 405, z: 5 });
  assert.deepEqual(filterLandmarks(e, 'schonau', null).map(x => x.n), ['Schloss Schönau (Trompeterschloss)']);
  assert.deepEqual(filterLandmarks(e, 'trompeter', null).map(x => x.n), ['Schloss Schönau (Trompeterschloss)']);
  assert.deepEqual(filterLandmarks(e, 'bahnhof bad sackingen', null).map(x => x.n), ['Bahnhof Bad Säckingen']);
  assert.deepEqual(filterLandmarks(e, '', 'Eiken').map(x => x.n), ['Bahnhof Eiken', 'Südspange Sisslerfeld']);
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
  assert.deepEqual(e.map(x => x.n), ['Bergsee', 'Reservoir Hübel', 'DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm', 'Südspange Sisslerfeld']);
  assert.deepEqual(e.find(x => x.n === 'LANDI-Turm'), { n: 'LANDI-Turm', g: 'Eiken', x: 1832.7, z: 627.7 });
  assert.deepEqual(filterLandmarks(e, 'landi', null).map(x => x.n), ['LANDI-Turm']);
  assert.deepEqual(filterLandmarks(e, 'LANDI', 'Eiken').map(x => x.n), ['LANDI-Turm']);
  assert.deepEqual(landmarkEntries(LANDMARK_INFO, { dsmChimney: anchors.dsmChimney }, []).map(x => x.n), ['Bergsee', 'Reservoir Hübel', 'DSM-Kamin', 'Südspange Sisslerfeld']);   // anchor missing: skipped
});

test('#103 Güggeli-Foodtruck resolves from its anchor, sits last in Eiken and is found by "gugg", "food" and "GÜGGELI"', () => {
  const anchors = { dsmChimney: { x: 1065.2, z: 345.1 }, stationSisseln: { x: 1854.2, z: 685.8 }, landiTurm: { x: 1832.7, z: 627.7 }, foodTruck: { x: 1758.5, z: 1986.5 } };
  const e = landmarkEntries(LANDMARK_INFO, anchors, [{ id: '199241726', ring: [[1700, 1930], [1720, 1930], [1720, 1943], [1700, 1943]] }]);
  assert.deepEqual(filterLandmarks(e, '', 'Eiken').map(x => x.n), ['DSM-Kamin', 'Bahnhof Sisseln', 'Bahnhof Eiken', 'LANDI-Turm', 'Südspange Sisslerfeld', 'Güggeli-Foodtruck']);
  assert.deepEqual(e.find(x => x.n === 'Güggeli-Foodtruck'), { n: 'Güggeli-Foodtruck', g: 'Eiken', x: 1758.5, z: 1986.5 });
  for (const q of ['gugg', 'food', 'GÜGGELI', 'truck']) assert.deepEqual(filterLandmarks(e, q, null).map(x => x.n), ['Güggeli-Foodtruck'], q);
  assert.ok(!landmarkEntries(LANDMARK_INFO, { landiTurm: anchors.landiTurm }, []).some(x => x.n === 'Güggeli-Foodtruck'), 'skipped while the anchor is missing');
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

test('LANDMARK_INFO has the Südspange row in Eiken at the K295 junction (#125)', () => {
  const item = LANDMARK_INFO.find(x => x.name === 'Südspange Sisslerfeld');
  assert.ok(item);
  assert.equal(item.gemeinde, 'Eiken');
  assert.deepEqual(item.at, [1528, 409]);
  assert.equal(item.jump, undefined);
});

test('landmarkEntries gives the Südspange its fixed point without any world anchor (#125)', () => {
  const e = landmarkEntries(LANDMARK_INFO, {}, []).find(x => x.n === 'Südspange Sisslerfeld');
  assert.deepEqual(e, { n: 'Südspange Sisslerfeld', g: 'Eiken', x: 1528, z: 409 });
});

test('filterLandmarks finds the Südspange by "sudspange", "südspange" and "SISSLERFELD" (#125)', () => {
  const e = landmarkEntries(LANDMARK_INFO, {}, []);
  for (const q of ['sudspange', 'südspange', 'SISSLERFELD']) assert.ok(filterLandmarks(e, q, null).some(x => x.n === 'Südspange Sisslerfeld'), q);
});

test('#94 Bergsee, Hallenbad and Plattform are in the J table', () => {
  const by = n => LANDMARK_INFO.find(l => l.name === n);
  assert.equal(by('Bergsee').gemeinde, 'Bad Säckingen');
  assert.deepEqual(by('Bergsee').at, [-2349, -2207]);
  assert.deepEqual(by('Bergsee').jump, [-2281.8, -2179.9]);
  assert.equal(by('Hallenbad Sissila').gemeinde, 'Sisseln');
  assert.equal(by('Hallenbad Sissila').anchor, 'hallenbad');
  assert.equal(by('Plattform Sisslerfeld').gemeinde, 'Münchwilen');
  assert.deepEqual(by('Plattform Sisslerfeld').jump, [78.1, 861.4]);
  const names = landmarkEntries(LANDMARK_INFO, { hallenbad: { x: 1968, z: -374.2 } }, []).map(x => x.n);
  assert.ok(names.includes('Bergsee') && names.includes('Hallenbad Sissila'));
  assert.deepEqual(filterLandmarks(landmarkEntries(LANDMARK_INFO, {}, []), 'berg', null).map(x => x.n), ['Bergsee']);
});

const WORLD_URL = new URL('../../data/world_hochrhein.json', import.meta.url);
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
// the road a jump spot snaps to, the way nearestJumpable picks it (prototype/index.html)
const nearestRoad = (roads, x, z) => roads.filter(r => !r.bridge && r.cls !== 'motorway' && r.cls !== 'motorway_link')
  .flatMap(r => r.pts.slice(1).map((b, i) => {
    const a = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return { d: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), n: r.n };
  })).reduce((best, c) => (c.d < best.d ? c : best));

test('#94 world sanity: the Bergsee point lies in the lake, the jump spots on their streets', { skip: !existsSync(WORLD_URL) }, () => {
  const w = JSON.parse(readFileSync(WORLD_URL, 'utf8'));
  const by = n => LANDMARK_INFO.find(l => l.name === n);
  const [bx, bz] = by('Bergsee').at;
  assert.ok(w.water.some(c => c.name === 'Bergsee' && inRing(c.rings[0], bx, bz)), 'the Bergsee point is inside a Bergsee water ring');
  const bergseeRoad = nearestRoad(w.roads, ...by('Bergsee').jump);
  assert.ok(bergseeRoad.d < 3, `Bergsee jump spot is ${bergseeRoad.d.toFixed(1)} m off the nearest road`);
  assert.equal(bergseeRoad.n, 'Am Bergsee');
  const plattformRoad = nearestRoad(w.roads, ...by('Plattform Sisslerfeld').jump);
  assert.ok(plattformRoad.d < 3, `Plattform jump spot is ${plattformRoad.d.toFixed(1)} m off the nearest road`);
  assert.equal(plattformRoad.n, 'Breitenloh');
  const p = w.anchors.landmarks.plattform, j = by('Plattform Sisslerfeld').jump;
  assert.ok(Math.hypot(j[0] - p.x, j[1] - p.z) >= 15, 'Plattform jump spot is clear of the tower');
});

test('landmarkEntries and gemeindenOf take the region Gemeinden (#127)', () => {
  const info = [{ name: 'Im Böndlern', gemeinde: 'Ehrendingen', anchor: 'boendlern' }];
  const e = landmarkEntries(info, { boendlern: { x: -149.5, z: -1464.9 } }, [], GEMEINDEN_EHRENDINGEN);
  assert.deepEqual(e, [{ n: 'Im Böndlern', g: 'Ehrendingen', x: -149.5, z: -1464.9 }]);
  assert.deepEqual(gemeindenOf(e, GEMEINDEN_EHRENDINGEN), ['Ehrendingen']);
  assert.deepEqual(gemeindenOf(e), []);                       // default stays the Hochrhein list
});

test('the Ehrendingen J list has Im Böndlern and the Wanderweg, all in Ehrendingen, no ramp (#127)', () => {
  const names = LANDMARK_INFO_EHRENDINGEN.map(i => i.name);
  assert.ok(names.includes('Im Böndlern') && names.includes('Wanderweg'));
  assert.ok(LANDMARK_INFO_EHRENDINGEN.every(i => i.gemeinde === 'Ehrendingen' && !i.ramp));
  assert.deepEqual(GEMEINDEN_EHRENDINGEN, ['Ehrendingen']);
});

// #102: a hand-measured position
const FIXED_INFO = [
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Reservoir Hübel', gemeinde: 'Münchwilen', at: [-712.8, 1528.2], jump: [-703.3, 1419.1] },
];

test('landmarkEntries_GamePosition_IsTakenAsIs', () => {
  const e = landmarkEntries(FIXED_INFO, ANCHORS, BUILDINGS).find(x => x.n === 'Reservoir Hübel');
  assert.deepEqual(e, { n: 'Reservoir Hübel', g: 'Münchwilen', x: -712.8, z: 1528.2, j: [-703.3, 1419.1] });
});

test('landmarkEntries_FixedPositionEntry_ListsAlwaysAndSortsByGemeinde', () => {
  assert.deepEqual(landmarkEntries(FIXED_INFO, ANCHORS, BUILDINGS).map(x => x.n), ['Reservoir Hübel', 'Smile-Kreisel'], 'Münchwilen sorts before Sisseln');
});

test('LANDMARK_INFO_HasTheReservoirHuebelInMuenchwilenAlways (#102)', () => {
  const e = LANDMARK_INFO.find(i => i.name === 'Reservoir Hübel');
  assert.ok(e, 'listed'); assert.equal(e.gemeinde, 'Münchwilen'); assert.deepEqual(e.at, [-712.8, 1528.2]);
  assert.ok(!('secret' in e), 'no secret flag: it is in the J list from the start');
  assert.ok(landmarkEntries(LANDMARK_INFO, {}, []).some(x => x.n === 'Reservoir Hübel'), 'listed by default');
  assert.ok(!LANDMARK_INFO.some(i => /eiffel/i.test(i.name)), 'the name does not spoil the tower');
});

test('landmarkEntries_LookPoint_IsPassedThrough (#102)', () => {
  const info = [{ name: 'Reservoir Hübel', gemeinde: 'Münchwilen', at: [-712.8, 1528.2], jump: [-703.3, 1419.1], look: [-703.7, 1423.6] }];
  assert.deepEqual(landmarkEntries(info, {}, [])[0], { n: 'Reservoir Hübel', g: 'Münchwilen', x: -712.8, z: 1528.2, j: [-703.3, 1419.1], look: [-703.7, 1423.6] });
  // the Reservoir Hübel's J spot is on the Hübel; the car turns to look at the gate in the hillside, not along the road
  assert.deepEqual(LANDMARK_INFO.find(i => i.name === 'Reservoir Hübel').look, [-703.7, 1423.6]);
});
