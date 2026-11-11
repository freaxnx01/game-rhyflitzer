// #846: the Straussenfarm Sisseln's ostrich paddock -- outline, fence posts, gate, flock behaviour.
// Pure module (ostriches.js); the glue (meshes, solids, stepOstriches) lives in index.html and is covered by tests/test_ostriches.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSTRICH, PADDOCK, inPaddock, fencePosts, makeFlock, stepFlock } from '../ostriches.js';
import { LANDMARK_INFO } from '../landmarks.js';
import { rng } from '../world.js';

const G = PADDOCK.find(([x, z]) => x === 2365.4 && z === -379.3);   // the gate corner

function shoelace(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; a += x0 * z1 - x1 * z0; }
  return a / 2;
}

test('outline: 15 vertices A-O, first is A, none repeated, about 2 ha', () => {
  assert.equal(PADDOCK.length, 15);
  assert.deepEqual(PADDOCK[0], [2376.9, -321.1]);
  const keys = new Set(PADDOCK.map(([x, z]) => `${x},${z}`));
  assert.equal(keys.size, 15, 'a vertex repeats');
  // the parcel's true ring area is 16 589 m^2 (~1.7 ha): the spec's "~2 ha" included the farmyard pocket the
  // outline cuts out; the A-O vertices are the authority, so the bound brackets their area
  const area = Math.abs(shoelace(PADDOCK));
  assert.ok(area > 15500 && area < 17500, `area ${area}`);
});

test('inPaddock: inside yes, stable / road / farmyard no, edge pad yes', () => {
  assert.equal(inPaddock(2380, -450), true);
  assert.equal(inPaddock(2392, -345), false);        // the stable
  assert.equal(inPaddock(2400, -314), false);       // the Hauptstrasse
  assert.equal(inPaddock(2350, -340), false);        // the farmyard
  assert.equal(inPaddock(2376.9, -321.1, 1), true);  // vertex A, within the pad
});

test('fencePosts: post every <= 4 m, every vertex, one 4 m gate run near G, > 100 runs', () => {
  const { posts, runs } = fencePosts();
  for (let i = 1; i < posts.length; i++) {
    const d = Math.hypot(posts[i][0] - posts[i - 1][0], posts[i][1] - posts[i - 1][1]);
    assert.ok(d <= 4.01, `posts ${i - 1}-${i} are ${d} m apart`);
  }
  for (const v of PADDOCK) assert.ok(posts.some(p => Math.hypot(p[0] - v[0], p[1] - v[1]) < 1e-6), `vertex ${v} is not a post`);
  assert.ok(runs.length > 100, `${runs.length} runs`);
  const gates = runs.filter(r => r.gate);
  assert.equal(gates.length, 1);
  const [ga, gb] = gates[0].a;
  const len = Math.hypot(gates[0].b[0] - ga, gates[0].b[1] - gb);
  assert.ok(Math.abs(len - 4) < 0.05, `gate run is ${len} m`);
  const mx = (ga + gates[0].b[0]) / 2, mz = (gb + gates[0].b[1]) / 2;
  assert.ok(Math.hypot(mx - 2365.4, mz - -379.3) < 10, `gate midpoint ${mx},${mz} not near G`);
});

test('makeFlock: 8 birds well inside the south half, >= 4 m apart, 3 males first, same seed same flock', () => {
  const flock = makeFlock(7);
  assert.equal(flock.birds.length, OSTRICH.count);
  for (const b of flock.birds) {
    assert.ok(inPaddock(b.x, b.z, -1), `bird ${b.x},${b.z} not 1 m inside`);
    assert.ok(b.z > -440, `bird ${b.x},${b.z} not in the south half`);
  }
  for (let i = 0; i < flock.birds.length; i++) for (let j = i + 1; j < flock.birds.length; j++) {
    const a = flock.birds[i], c = flock.birds[j];
    assert.ok(Math.hypot(a.x - c.x, a.z - c.z) >= 4, 'birds too close');
  }
  for (let i = 0; i < 3; i++) assert.equal(flock.birds[i].male, true);
  for (let i = 3; i < flock.birds.length; i++) assert.equal(flock.birds[i].male, false);
  assert.deepEqual(makeFlock(7), flock);
});

test('the flock stays inside for 60 s with a player circling inside', () => {
  const flock = makeFlock(31), rnd = rng(5);
  for (let i = 0; i < 3750; i++) {
    const t = i * 0.016;
    const player = { x: 2380 + 30 * Math.cos(t * 0.5), z: -450 + 30 * Math.sin(t * 0.5) };
    stepFlock(flock, 0.016, player, rnd);
    for (const b of flock.birds) assert.ok(inPaddock(b.x, b.z, -OSTRICH.inset + 0.01), `bird ${b.x},${b.z} left the paddock at t=${t.toFixed(1)}`);
  }
});

test('a bird flees from a near player and calms when it is far away', () => {
  const flock = makeFlock(31), rnd = rng(9);
  const b = flock.birds[0];
  let dx = b.x - OSTRICH.centre[0], dz = b.z - OSTRICH.centre[1], d = Math.hypot(dx, dz);
  if (d < 1) { dx = 0; dz = 1; d = 1; }   // degenerate: push the player south so the bird flees north
  const player = { x: b.x + dx / d * 10, z: b.z + dz / d * 10 };
  stepFlock(flock, 0.1, player, rnd);
  assert.equal(b.state, 'flee');
  const before = Math.hypot(player.x - b.x, player.z - b.z);
  for (let i = 0; i < 9; i++) stepFlock(flock, 0.1, player, rnd);
  assert.ok(Math.hypot(player.x - b.x, player.z - b.z) > before, 'the bird did not get away');
  player.x = b.x + 60; player.z = b.z;
  for (let i = 0; i < 70; i++) stepFlock(flock, 0.1, player, rnd);
  assert.notEqual(b.state, 'flee');
});

test('a bird driven into corner A stays inside the fence', () => {
  const flock = makeFlock(31), rnd = rng(11);
  const b = flock.birds[0];
  b.x = 2378; b.z = -323; b.state = 'stand'; b.timer = 0;
  const player = { x: 2390, z: -340 };
  for (let i = 0; i < 125; i++) stepFlock(flock, 0.016, player, rnd);   // 2 s
  assert.ok(inPaddock(b.x, b.z, -OSTRICH.inset + 0.01), `bird ${b.x},${b.z} left the paddock`);
  assert.ok(b.state === 'flee' || b.state === 'stand', b.state);
});

test('big dt cannot push a fleeing bird through the fence', () => {
  const flock = makeFlock(31), rnd = rng(13);
  const b = flock.birds[0];
  const player = { x: b.x + 5, z: b.z };
  for (let i = 0; i < 200; i++) {
    stepFlock(flock, 0.05, player, rnd);
    for (const bd of flock.birds) assert.ok(inPaddock(bd.x, bd.z, -OSTRICH.inset + 0.01), `bird ${bd.x},${bd.z} left the paddock at step ${i}`);
  }
});

test('walking swings the legs opposite, standing keeps them still', () => {
  const flock = makeFlock(3), rnd = rng(15);
  const walker = flock.birds[0];
  walker.state = 'walk'; walker.timer = 0;
  walker.target = inPaddock(walker.x + 10, walker.z, -3) ? [walker.x + 10, walker.z] : [walker.x - 10, walker.z];
  for (let i = 0; i < 32; i++) stepFlock(flock, 0.016, { x: 2380, z: -450 }, rnd);   // 0.5 s of walking
  assert.equal(walker.state, 'walk');
  assert.notEqual(walker.legL, 0);
  assert.ok(Math.abs(walker.legL + walker.legR) < 1e-9);
  const stayer = makeFlock(4).birds[0];
  assert.equal(stayer.state, 'stand');
  assert.equal(stayer.legL, 0);
});

test('landmarks.js carries the paddock entry, so J lists the farm (#846)', () => {
  const e = { name: 'Straussenfarm Sisseln', gemeinde: 'Sisseln', at: [2345, -318], look: [2385, -400] };   // landmarks.js is the single source of the J row
  const item = LANDMARK_INFO.find(l => l.name === e.name);
  assert.ok(item, 'Straussenfarm Sisseln is not in LANDMARK_INFO');
  assert.equal(item.gemeinde, e.gemeinde);
  assert.deepEqual(item.at, e.at);
  assert.deepEqual(item.look, e.look);
});
