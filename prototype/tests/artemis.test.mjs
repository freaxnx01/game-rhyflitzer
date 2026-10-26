// #488: the Artemis II stack and the Orion capsule -- pure. node --test prototype/tests/artemis.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTEMIS, rocketParts, capsuleParts, rocketTop } from '../artemis.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);
const onAxis = (p) => Math.abs(p.x) < 1e-9 && Math.abs(p.z) < 1e-9;

test('ARTEMIS_IsLifeSize_TheRealStackIs98mAndTheCoreAndBoostersHaveTheRealDiameters', () => {
  assert.equal(ARTEMIS.key, 'artemis'); near(ARTEMIS.h, 98.1, 1e-9);
  near(ARTEMIS.core.r * 2, 8.4, 1e-9, 'core diameter'); near(ARTEMIS.core.y1 - ARTEMIS.core.y0, 64.6, 1e-9, 'core length');
  near(ARTEMIS.srb.r * 2, 3.71, 1e-9, 'booster diameter'); near(ARTEMIS.srb.y1 + ARTEMIS.srb.nose - ARTEMIS.srb.y0, 53.9, 1e-9, 'booster length incl. nose');
  assert.ok(ARTEMIS.srb.off > ARTEMIS.core.r + ARTEMIS.srb.r, 'the boosters hang beside the core, not inside it');
  near(ARTEMIS.capsule.r * 2, 5.03, 1e-9, 'Orion is 5.03 m across'); near(ARTEMIS.capsule.h, 3.3, 1e-9);
});

test('rocketParts_StackEndsAtTheTip_PartsMeetWithoutGaps_OnlyTheTowerAboveTheOgive', () => {
  const parts = rocketParts(ARTEMIS);
  near(rocketTop(parts), ARTEMIS.h, 1e-9, 'the tip');
  for (const p of parts) { assert.ok(['cyl', 'cone'].includes(p.kind)); assert.ok(p.y1 > p.y0, `${p.kind} y`); assert.ok(p.r0 > 0 && p.r1 >= 0); assert.equal(typeof p.colour, 'number'); if (p.kind === 'cyl') assert.equal(p.r0, p.r1); }
  const stack = parts.filter(onAxis).filter(p => p.y1 > ARTEMIS.core.y0).sort((a, b) => a.y0 - b.y0);
  for (let i = 1; i < stack.length; i++) assert.ok(stack[i].y0 <= stack[i - 1].y1 + 1e-9, `gap under the part starting at ${stack[i].y0}`);
  for (const p of parts.filter(p => p.y1 > ARTEMIS.las.y0 + 1e-9)) assert.ok(onAxis(p) && p.r0 <= ARTEMIS.las.r + 1e-9, 'only the abort tower reaches above the ogive');
  const core = parts.find(p => p.kind === 'cyl' && Math.abs(p.r0 - ARTEMIS.core.r) < 1e-9 && p.y0 === ARTEMIS.core.y0);
  assert.ok(core && core.colour === ARTEMIS.colours.core, 'the core is the orange cylinder');
});

test('rocketParts_TwoBoostersAcrossTheRoom_WhiteWithNoseConesAndDarkSkirts', () => {
  const parts = rocketParts(ARTEMIS), srb = parts.filter(p => Math.abs(Math.abs(p.z) - ARTEMIS.srb.off) < 1e-9 && Math.abs(p.x) < 1e-9);
  const tubes = srb.filter(p => p.kind === 'cyl' && Math.abs(p.r0 - ARTEMIS.srb.r) < 1e-9), noses = srb.filter(p => p.kind === 'cone' && p.r1 < 0.2), skirts = srb.filter(p => p.kind === 'cone' && p.r0 > ARTEMIS.srb.r + 0.5);
  assert.equal(tubes.length, 2); assert.equal(noses.length, 2); assert.equal(skirts.length, 2);
  assert.deepEqual(tubes.map(p => Math.sign(p.z)).sort(), [-1, 1], 'one booster each side');
  for (const p of tubes) { assert.equal(p.colour, ARTEMIS.colours.white); near(p.y0, ARTEMIS.srb.y0, 1e-9); near(p.y1, ARTEMIS.srb.y1, 1e-9); }
  for (const p of noses) near(p.y1, ARTEMIS.srb.y1 + ARTEMIS.srb.nose, 1e-9, 'nose tip at 53.9');
  for (const p of skirts) { assert.equal(p.colour, ARTEMIS.colours.dark); near(p.y0, ARTEMIS.srb.y0, 1e-9); }
  assert.ok(Math.max(...srb.map(p => p.y1)) < ARTEMIS.core.y1, 'the boosters end below the core top');
});

test('rocketParts_FourNozzlesHangUnderTheCore_AboveTheDeck', () => {
  const nozzles = rocketParts(ARTEMIS).filter(p => p.colour === ARTEMIS.colours.nozzle && Math.hypot(p.x, p.z) > 1 && Math.hypot(p.x, p.z) < ARTEMIS.core.r);
  assert.equal(nozzles.length, ARTEMIS.core.nozzle.n);
  for (const p of nozzles) { near(p.y1, ARTEMIS.core.y0, 1e-9, 'hangs from the core bottom'); assert.ok(p.y0 >= 0, 'not into the deck'); }
  assert.equal(new Set(nozzles.map(p => `${Math.sign(p.x)},${Math.sign(p.z)}`)).size, 4, 'on a square');
});

test('capsuleParts_ATruncatedConeOnAStand_HeatShieldBelow_TunnelOnTop_StandingOnTheLawn', () => {
  const parts = capsuleParts(ARTEMIS), C = ARTEMIS.capsule;
  const cone = parts.find(p => p.kind === 'cone' && Math.abs(p.r0 - C.r) < 1e-9);
  assert.ok(cone, 'the crew module cone'); near(cone.r1, C.rTop, 1e-9); near(cone.y1 - cone.y0, C.h, 1e-9); near(cone.y0, C.stand.h, 1e-9, 'rests on the stand'); assert.equal(cone.colour, ARTEMIS.colours.shell);
  const shield = parts.find(p => p.colour === ARTEMIS.colours.shield); assert.ok(shield && shield.y1 <= cone.y0 + 1e-9 && shield.y0 >= cone.y0 - C.shield - 1e-9, 'the heat shield sits under the base, inside the stand height');
  const tunnel = parts.find(p => p.kind === 'cyl' && Math.abs(p.r0 - C.tunnel.r) < 1e-9); assert.ok(tunnel && Math.abs(tunnel.y0 - cone.y1) < 1e-9, 'the docking tunnel on top');
  const posts = parts.filter(p => p.colour === ARTEMIS.colours.stand && p.kind === 'cyl'); assert.ok(posts.length >= 4, 'posts'); for (const p of posts) { assert.equal(p.y0, 0); near(p.y1, C.stand.h, 1e-9); assert.ok(Math.hypot(p.x, p.z) < C.r, 'under the shield'); }
  assert.equal(Math.min(...parts.map(p => p.y0)), 0, 'stands on the lawn'); near(Math.max(...parts.map(p => p.y1)), C.stand.h + C.h + C.tunnel.h, 1e-9, 'top');
});