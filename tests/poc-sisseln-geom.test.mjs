/* #987: the WebGPU Sisseln PoC's pure geometry helpers. Pure: no three.js, no DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heightAt,
  roadRibbon,
  lampSpots,
  pickLampLights,
  scatterInRing,
  pointInRing
} from '../poc/webgpu-sisseln/js/sisseln-geom.js';

// 2 x 2 height grid, 10 m apart, corner heights 0 / 10 / 20 / 30
const GRID = {
  hdr: { w: 2, h: 2, step: 10, x0: 0, z0: 0 },
  data: Float32Array.from([0, 10, 20, 30])
};

test('heightAt_corners_returnTheirOwnValue', () => {
  assert.equal(heightAt(GRID, 0, 0), 0);
  assert.equal(heightAt(GRID, 10, 0), 10);
  assert.equal(heightAt(GRID, 0, 10), 20);
  assert.equal(heightAt(GRID, 10, 10), 30);
});

test('heightAt_centre_isTheMeanOfTheCorners', () => {
  assert.equal(heightAt(GRID, 5, 5), 15);
});

test('heightAt_halfwayAlongAnEdge_interpolates', () => {
  assert.equal(heightAt(GRID, 5, 0), 5);
  assert.equal(heightAt(GRID, 0, 5), 10);
});

test('heightAt_outsideTheGrid_clampsToTheEdge', () => {
  assert.equal(heightAt(GRID, -500, -500), 0);
  assert.equal(heightAt(GRID, 500, 500), 30);
});

test('roadRibbon_twoPoints_hasFourVertices', () => {
  const ribbon = roadRibbon([[0, 0], [10, 0]], 4);
  assert.equal(ribbon.positions.length, 4 * 3);
  assert.equal(ribbon.uvs.length, 4 * 2);
  assert.equal(ribbon.indices.length, 6);
});

test('roadRibbon_straightRoad_isAsWideAsAsked', () => {
  const { positions } = roadRibbon([[0, 0], [10, 0]], 4);
  const left = [positions[0], positions[2]];
  const right = [positions[3], positions[5]];
  assert.equal(Math.hypot(left[0] - right[0], left[1] - right[1]), 4);
});

test('roadRibbon_vertexHeights_areZeroForTheCallerToLift', () => {
  const { positions } = roadRibbon([[0, 0], [10, 0]], 4);
  for (let i = 1; i < positions.length; i += 3) assert.equal(positions[i], 0);
});

test('roadRibbon_uv_runsAcrossAndAlongInMetres', () => {
  const { uvs } = roadRibbon([[0, 0], [10, 0]], 4);
  assert.deepEqual([...uvs], [0, 0, 1, 0, 0, 10, 1, 10]);
});

test('roadRibbon_tooFewPoints_isEmpty', () => {
  const ribbon = roadRibbon([[0, 0]], 4);
  assert.equal(ribbon.positions.length, 0);
  assert.equal(ribbon.indices.length, 0);
});

test('roadRibbon_repeatedPoint_isSkipped', () => {
  const ribbon = roadRibbon([[0, 0], [0, 0], [10, 0]], 4);
  assert.equal(ribbon.positions.length, 4 * 3);
});

const STRAIGHT = { cls: 'residential', w: 6, pts: [[0, 0], [120, 0]] };

test('lampSpots_residentialRoad_placesThemAtTheSpacing', () => {
  const spots = lampSpots([STRAIGHT], 30);
  assert.equal(spots.length, 5); // 0, 30, 60, 90, 120 m
  assert.equal(spots[0].x, 0);
  assert.equal(spots[4].x, 120);
});

test('lampSpots_lamp_standsBesideTheCarriageway', () => {
  const [spot] = lampSpots([STRAIGHT], 30);
  assert.ok(Math.abs(spot.z) > STRAIGHT.w / 2, `the lamp stands off the road, got z ${spot.z}`);
});

test('lampSpots_serviceAndFootpaths_getNoLamps', () => {
  assert.deepEqual(lampSpots([{ cls: 'service', w: 3, pts: [[0, 0], [120, 0]] }], 30), []);
  assert.deepEqual(lampSpots([{ cls: 'footway', w: 2, pts: [[0, 0], [120, 0]] }], 30), []);
});

test('lampSpots_mainRoads_getLamps', () => {
  for (const cls of ['motorway', 'primary', 'tertiary', 'unclassified', 'living_street']) {
    assert.ok(lampSpots([{ cls, w: 6, pts: [[0, 0], [60, 0]] }], 30).length > 0, cls);
  }
});

const FORTY_SPOTS = Array.from({ length: 40 }, (_, i) => ({ x: i * 10, z: 0 }));

test('pickLampLights_manySpots_returnsTheCap', () => {
  assert.equal(pickLampLights(FORTY_SPOTS, 0, 0, 16).length, 16);
});

test('pickLampLights_result_isNearestFirst', () => {
  const picked = pickLampLights(FORTY_SPOTS, 200, 0, 16);
  assert.equal(picked[0].x, 200);
  let previous = -1;
  for (const spot of picked) {
    const distance = Math.abs(spot.x - 200);
    assert.ok(distance >= previous, 'sorted by distance');
    previous = distance;
  }
});

test('pickLampLights_fewerSpotsThanTheCap_returnsThemAll', () => {
  assert.equal(pickLampLights(FORTY_SPOTS.slice(0, 3), 0, 0, 16).length, 3);
});

const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100]];
const TRIANGLE = [[0, 0], [100, 0], [0, 100]];

test('pointInRing_insideAndOutside', () => {
  assert.equal(pointInRing(50, 50, SQUARE), true);
  assert.equal(pointInRing(150, 50, SQUARE), false);
  assert.equal(pointInRing(90, 90, TRIANGLE), false);
});

test('scatterInRing_sameSeed_isDeterministic', () => {
  assert.deepEqual(scatterInRing(SQUARE, 0.002, 7), scatterInRing(SQUARE, 0.002, 7));
});

test('scatterInRing_differentSeed_movesThePoints', () => {
  assert.notDeepEqual(scatterInRing(SQUARE, 0.002, 7), scatterInRing(SQUARE, 0.002, 8));
});

test('scatterInRing_everyPoint_isInsideTheRing', () => {
  const points = scatterInRing(TRIANGLE, 0.01, 3);
  assert.ok(points.length > 10, `got ${points.length} points`);
  for (const { x, z } of points) assert.equal(pointInRing(x, z, TRIANGLE), true);
});

test('scatterInRing_density_scalesTheCount', () => {
  const sparse = scatterInRing(SQUARE, 0.001, 5).length;
  const dense = scatterInRing(SQUARE, 0.01, 5).length;
  assert.ok(dense > sparse * 5, `${sparse} sparse vs ${dense} dense`);
});

test('scatterInRing_degenerateRing_isEmpty', () => {
  assert.deepEqual(scatterInRing([[0, 0], [1, 0]], 0.01, 1), []);
});
