// #620: Deep Space Nine with the Defiant docked, in ring-2 room 1 -- pure. node --test tests/ds9.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DS9 } from '../ds9.js';
import { ROOMS2, RINGS, ROOM2_Y, roomLayout } from '../rooms.js';
import { enterprisePlacement } from '../enterprise.js';

test('DS9_HalfScale_HoversWithRoomToFlyOver', () => {
  assert.equal(DS9.key, 'ds9'); assert.equal(DS9.diameter, 726); assert.equal(DS9.hover, 25); assert.equal(DS9.ceiling, 570);
  assert.ok(Math.abs(DS9.h - 493.9) < 2, `height ${DS9.h}`);
  assert.ok(DS9.hover + DS9.h + 40 < DS9.ceiling, 'the helicopter clears the station by 40 m');
  assert.ok(DS9.ceiling < 600, 'and stays under ring 1\'s floor, 600 m over this one');
  assert.equal(DS9.url, './assets/models/ds9.glb'); assert.equal(DS9.loadWithin, 400);
  assert.equal(DS9.scale, 1); assert.deepEqual(DS9.anchor, [0, 0, 0]);
  assert.equal(DS9.hull, undefined); assert.equal(DS9.feet, undefined);   // no colliders: the lowest point is 25 m up
  assert.ok(DS9.bob.amp > 0 && DS9.bob.period >= 14, 'a slower, smaller bob than the Enterprise: the station is no ship');
});

test('ds9Placement_OnTheRoomCentre_DockSideTowardsThePortal', () => {
  const R = roomLayout(1, ROOMS2[1], RINGS[1]), p = enterprisePlacement(R, DS9);
  assert.deepEqual([p.x, p.z], R.centre); assert.equal(p.y, ROOM2_Y + DS9.hover);
  // the model's +x -- where the Defiant is docked -- points at the portal, turned by `yaw` so the ship is in view on arrival
  const toPortal = Math.atan2(R.portal.c[1] - p.z, R.portal.c[0] - p.x);
  const d = Math.atan2(Math.sin(p.th - toPortal), Math.cos(p.th - toPortal));
  assert.ok(Math.abs(Math.abs(d) - DS9.yaw) < 1e-9, `model +x is ${d} rad off the portal, not ${DS9.yaw}`);
  assert.ok(Math.abs(DS9.yaw - Math.PI / 6) < 1e-9, '30 degrees');
  // the station, 726 m across on the centre of a 1000 m room, keeps clear of the walls whichever way it is turned
  assert.ok(DS9.diameter / 2 < R.half - 100, 'at least 100 m to each wall');
});

test('ROOMS2_Room1IsDeepSpaceNine_SpaceLook_Unsigned', () => {
  assert.deepEqual([ROOMS2[1].name, ROOMS2[1].object, ROOMS2[1].look, ROOMS2[1].signed], ['Deep Space Nine', DS9, 'space', false]);
  assert.equal(ROOMS2[1].dedication, undefined);
});

test('roomLayout_FlyCeiling570OnlyInTheDs9Room', () => {
  for (let k = 0; k < 8; k++) {
    assert.equal(roomLayout(k, ROOMS2[k], RINGS[1]).fly.ceiling, k === 1 ? DS9.ceiling : 420, `ring-2 room ${k}`);
    assert.equal(roomLayout(k, undefined, RINGS[0]).fly.ceiling, 420, `ring-1 room ${k}`);
  }
});
