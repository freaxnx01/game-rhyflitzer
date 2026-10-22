import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALKER } from '../foot.js';
import { walkwayFloor, walkwayCeiling, walkwayPush, WALKWAY, wallActive } from '../walkways.js';
import { STAIRHALL, stairHall, hallLevels, floorAtY, floorLabel, keypadLabel, hudFloorText, hallFrame, hallArea, bodyColliderOff, hallRoofSlab, wallByTag, doorShouldClose } from '../stairhall.js';

const EG = 312.4, FLOORS = { pitch: 2.53, floors: Array.from({ length: 10 }, (_, k) => EG + k * 2.53), roof: EG + 25.3 + 0.5, housingTop: EG + 25.3 + 0.5 + 2.6 };
const ENTRANCE = { x: 2100, z: -380, th: 0.7, w: 1.0 }, PORCH = { w: 2.3, d: 2.9 };
const hall = () => stairHall(ENTRANCE, PORCH, FLOORS, EG);
const at = (h, a, b) => h.frame.toWorld(a, b);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('hallLevels_FromEgAndFloors_TenStoreysThenTheRoof', () => {
  const lv = hallLevels(EG, FLOORS);
  assert.equal(lv.length, 11); close(lv[0], EG); close(lv[9], EG + 9 * 2.53); close(lv[10], FLOORS.roof);
});

test('floorAtY_OnStairsAndLandings_NamesTheStoreyBelowTheHalfLanding', () => {
  const lv = hallLevels(EG, FLOORS);
  assert.equal(floorAtY(lv, EG), 0);
  assert.equal(floorAtY(lv, lv[4]), 4);
  assert.equal(floorAtY(lv, lv[4] + 1.265), 4, 'half landing');
  assert.equal(floorAtY(lv, lv[5] - 0.1), 5, 'top of the flight');
  assert.equal(floorAtY(lv, lv[10]), 10);
  assert.equal(floorAtY(lv, lv[0] - 3), 0);
});

test('floorLabel_SwissNaming_EgOgDach_AndEnglish', () => {
  assert.deepEqual([0, 1, 4, 9, 10].map(k => floorLabel(k, 'de')), ['EG', '1. OG', '4. OG', '9. OG', 'Dach']);
  assert.deepEqual([0, 1, 2, 3, 4, 9, 10].map(k => floorLabel(k, 'en')), ['ground floor', '1st floor', '2nd floor', '3rd floor', '4th floor', '9th floor', 'roof']);
  assert.equal(hudFloorText('6c', 4, 'de'), '6c · 4. OG');
  assert.equal(hudFloorText('6c', 4, 'en'), '6c · 4th floor');
  assert.equal(hudFloorText('6c', 0, 'en'), '6c · ground floor');
});

test('keypadLabel_Buttons_EgOneToNineDach', () => {
  assert.deepEqual([0, 1, 9, 10].map(k => keypadLabel(k, 'de')), ['EG', '1', '9', 'Dach']);
  assert.equal(keypadLabel(10, 'en'), 'Roof');
});

test('hallFrame_RoundTrip_AndTheAxisPointsIntoTheBuilding', () => {
  const f = hallFrame(ENTRANCE, PORCH.d), [x, z] = f.toWorld(3, -1), p = f.fromWorld(x, z);
  close(p.a, 3); close(p.b, -1);
  const [x1, z1] = f.toWorld(0, 0);
  close(Math.hypot(x1 - ENTRANCE.x, z1 - ENTRANCE.z), PORCH.d);
  close(Math.atan2(z1 - ENTRANCE.z, x1 - ENTRANCE.x), ENTRANCE.th);
});

test('stairHall_StairWidth_IsTwoFortyBetweenFifteenCentimetreWalls', () => {
  const h = hall(), left = wallByTag(h, 'left'), div = wallByTag(h, 'divider:l');
  const bOf = (w) => h.frame.fromWorld(w.x, w.z).b;
  const gap = (bOf(div) - div.hd) - (bOf(left) + left.hd);
  close(gap, STAIRHALL.inner, 1e-9);
  close(left.hd * 2, STAIRHALL.wall, 1e-9); close(div.hd * 2, STAIRHALL.wall, 1e-9);
});

// walking the stairs: the centre line of every storey, landing -> left flight -> half landing -> right flight -> next landing
function climb(h, k) {
  const pts = [[0.7, -0.65], [1.4, -0.65], [3.4, -0.65], [4.1, -0.65], [4.1, 0.65], [3.4, 0.65], [1.4, 0.65], [0.7, 0.65]], out = [];
  for (let i = 1; i < pts.length; i++) for (let t = 0; t < 1; t += 0.02) out.push(at(h, pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t));
  return out;
}

test('stairHall_EveryStorey_CanBeClimbedWithoutAJumpOrABump', () => {
  const h = hall();
  for (let k = 0; k < 10; k++) {
    let y = h.levels[k];
    for (const [x, z] of climb(h, k)) {
      const f = walkwayFloor(h.walk, x, z, y, WALKER);
      assert.notEqual(f, null, `storey ${k}: floor under the path`);
      assert.ok(Math.abs(f - y) <= 0.2, `storey ${k}: step of ${f - y}`);
      y = f;
      const c = walkwayCeiling(h.walk, x, z, y, WALKER);
      assert.ok(c === null || c - y >= WALKWAY.head, `storey ${k}: headroom ${c - y}`);
      assert.equal(walkwayPush(h.walk, x, z, y, WALKER.radius).length, 0, `storey ${k}: a wall in the way at ${x.toFixed(1)}`);
    }
    close(y, h.levels[k + 1], 1e-6);
  }
});

test('stairHall_Walls_FrontDoorIsOpenAtEgButWindowsAreNotDoors', () => {
  const h = hall(), [dx, dz] = at(h, 0.05, 0), [wx, wz] = at(h, 0.05, 2.0);
  assert.equal(walkwayPush(h.walk, dx, dz, h.levels[0], WALKER.radius).length, 0, 'through the door gap');
  const [sx, sz] = at(h, 0.05, 0.9);
  assert.ok(walkwayPush(h.walk, sx, sz, h.levels[0], WALKER.radius).length > 0, 'beside the door is wall');
  assert.equal(h.windows.length, 9);
  assert.deepEqual(h.windows.map(w => w.k), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const w of h.windows) assert.ok(w.y0 > h.levels[w.k] && w.y1 < h.levels[w.k + 1], 'a window is inside its storey');
  assert.ok(walkwayPush(h.walk, wx, wz, h.levels[3], WALKER.radius).length > 0, 'cannot walk out through a window');
});

test('stairHall_LiftDoors_OneLeafPerLevelAndOpeningItClearsTheGap', () => {
  const h = hall(), [x, z] = at(h, 0.7, 1.275);
  for (let k = 0; k <= 10; k++) {
    const leaf = wallByTag(h, `lift:${k}`); assert.ok(leaf, `leaf ${k}`);
    assert.ok(walkwayPush(h.walk, x, z, h.levels[k], 0.1).length > 0, `shut at ${k}`);
    leaf.off = true;
    assert.equal(walkwayPush(h.walk, x, z, h.levels[k], 0.1).length, 0, `open at ${k}`);
    leaf.off = false;
  }
});

test('stairHall_Walls_OnlyBlockOnTheirOwnStorey', () => {
  const h = hall(), w = wallByTag(h, 'front:4');
  assert.equal(wallActive(w, h.levels[4]), true);
  assert.equal(wallActive(w, h.levels[5]), false);
  assert.equal(wallActive(w, h.levels[3]), false);
});

test('stairHall_Porch_SlabRoofAndDoorLeaf', () => {
  const h = hall(), [x, z] = at(h, -1.5, 0);
  close(walkwayFloor(h.walk, x, z, EG, WALKER), EG);
  assert.equal(walkwayCeiling(h.walk, x, z, EG, WALKER), EG + 3.0);
  const door = wallByTag(h, 'porch:door'); assert.ok(door);
  const [dx, dz] = at(h, -PORCH.d, 0);
  assert.ok(walkwayPush(h.walk, dx, dz, EG, 0.3).length > 0); door.off = true;
  assert.equal(walkwayPush(h.walk, dx, dz, EG, 0.3).length, 0);
});

test('stairHall_Housing_RoofLobbyHasADoorOntoTheRoofAndAHousingCeiling', () => {
  const h = hall(), roof = FLOORS.roof, [x, z] = at(h, 0.7, 0);
  assert.ok(walkwayCeiling(h.walk, x, z, roof, WALKER) > roof + WALKWAY.head, 'room to stand under the housing roof');
  assert.ok(walkwayCeiling(h.walk, x, z, roof, WALKER) <= FLOORS.housingTop, 'a jump cannot leave the housing');
  const leaf = wallByTag(h, 'roofDoor'), [lx, lz] = at(h, 0.8, -1.275);
  assert.ok(walkwayPush(h.walk, lx, lz, roof, 0.1).length > 0); leaf.off = true;
  assert.equal(walkwayPush(h.walk, lx, lz, roof, 0.1).length, 0);
});

test('hallRoofSlab_BodyRing_RoofWalkableWithTheTowerCutOutAndRailedEdge', () => {
  const h = hall(), [cx, cz] = at(h, 10, 0);
  const ring = [-30, 30].flatMap(du => [-8, 8].map(dv => [cx + du, cz + dv]));
  const body = [ring[0], ring[1], ring[3], ring[2]];
  hallRoofSlab(h, body);
  const roof = FLOORS.roof;
  close(walkwayFloor(h.walk, cx, cz, roof, WALKER), roof);
  const [tx, tz] = at(h, 3, 0);
  assert.equal(walkwayFloor(h.walk, tx, tz, roof, WALKER) === roof, false, 'the tower hole is no roof (the flights are below)');
  const edge = h.walk.walls.filter(w => w.tag === 'edge'); assert.equal(edge.length, 4);
  assert.ok(walkwayPush(h.walk, cx - 30.1, cz - 8, roof, 0.35).length > 0, 'cannot step over the edge');
  assert.equal(walkwayPush(h.walk, cx, cz, roof, 0.35).length, 0);
});

test('hallArea_PointsOnAndAroundThePorchAndTower', () => {
  const h = hall();
  assert.equal(hallArea(h, ...at(h, 2, 0)), 'tower');
  assert.equal(hallArea(h, ...at(h, 1, 2)), 'tower', 'the shaft');
  assert.equal(hallArea(h, ...at(h, -1, 0)), 'porch');
  assert.equal(hallArea(h, ...at(h, -PORCH.d - 1, 0)), 'out');
  assert.equal(hallArea(h, ...at(h, 10, 0)), 'out');
});

test('bodyColliderOff_InsideOrAtAnOpenDoor_ButNotAtAShutOne', () => {
  const h = hall(), front = at(h, -PORCH.d - 1, 0);
  assert.equal(bodyColliderOff(h, ...at(h, 2, 0), false), true);
  assert.equal(bodyColliderOff(h, ...front, false), false);
  assert.equal(bodyColliderOff(h, ...front, true), true, 'open door within reach');
  assert.equal(bodyColliderOff(h, ...at(h, -PORCH.d - 8, 0), true), false, 'far from the door');
});

test('doorShouldClose_WalkedAwayFromTheOutside_Only', () => {
  const h = hall();
  assert.equal(doorShouldClose(h, ...at(h, -PORCH.d - 6, 0), 'out'), true);
  assert.equal(doorShouldClose(h, ...at(h, -PORCH.d - 1, 0), 'out'), false);
  assert.equal(doorShouldClose(h, ...at(h, 2, 0), 'tower'), false);
});
