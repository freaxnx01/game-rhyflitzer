// #165: where a beam to a clicked terrain point lands. Pure module, node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beamSpot, BEAM_SNAP } from '../beam.js';

const free = () => false;
const walled = () => true;
const road = (d) => () => ({ d, x: 5, z: 6, th: 1.5 });

test('beamSpot_freeSpot_landsOnTheClickedTerrainPoint', () => {
  assert.deepEqual(beamSpot(10, 20, { blocked: free, nearestRoad: road(1) }), { x: 10, z: 20, kind: 'terrain' });
});

test('beamSpot_blockedWithRoadInReach_landsOnTheRoadWithItsHeading', () => {
  assert.deepEqual(beamSpot(10, 20, { blocked: walled, nearestRoad: road(BEAM_SNAP) }), { x: 5, z: 6, th: 1.5, kind: 'road' });
});

test('beamSpot_blockedAndRoadTooFar_isNull', () => {
  assert.equal(beamSpot(10, 20, { blocked: walled, nearestRoad: road(BEAM_SNAP + 0.1) }), null);
});

test('beamSpot_blockedAndNoRoadAtAll_isNull', () => {
  assert.equal(beamSpot(10, 20, { blocked: walled, nearestRoad: () => null }), null);
});
