// #513: the Ferris wheel of star room 6 -- pure. node --test tests/ferris.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERRIS, gondolaAngles, wheelAngle, legSegments } from '../ferris.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('FERRIS_IsRecordSize_A250mWheelOnAHighHub_NoGondolaNearTheFloor', () => {   // #588
  assert.equal(FERRIS.key, 'ferris'); near(FERRIS.rim * 2, 250, 1e-9, 'diameter');
  const G = FERRIS.gondola, lowest = FERRIS.hub.y - FERRIS.rim - G.drop - G.h / 2;
  assert.ok(lowest >= 5, `the lowest gondola bottom is ${lowest} m over the floor`);
  near(FERRIS.hub.y + FERRIS.rim + G.drop + G.h / 2, FERRIS.h, 1e-9, 'the highest roof is h');
  assert.ok(FERRIS.h < 420, 'inside the helicopter ceiling');
});

test('gondolaAngles_48EvenlySpacedFromZero', () => {
  const a = gondolaAngles(FERRIS); assert.equal(a.length, 48); assert.equal(a[0], 0);
  for (let i = 1; i < a.length; i++) near(a[i] - a[i - 1], 2 * Math.PI / 48, 1e-12, 'step');
});

test('wheelAngle_StartsAtZeroGrowsLinearlyAndWrapsAtATurn', () => {
  assert.equal(wheelAngle(0), 0); near(wheelAngle(10), 0.1, 1e-12, '10 s');
  near(wheelAngle(2 * Math.PI / FERRIS.spin + 5), 5 * FERRIS.spin, 1e-9, 'wraps'); assert.ok(wheelAngle(1e6) < 2 * Math.PI);
});

test('legSegments_FourLegsFromTheFeetUpToTheAxleEnds_TwoFramesEitherSideOfTheWheel', () => {
  const legs = legSegments(FERRIS), F = FERRIS.frame; assert.equal(legs.length, 4);
  for (const l of legs) { assert.equal(l.a[1], 0); near(l.b[1], FERRIS.hub.y, 1e-9); near(l.b[2], 0, 1e-9, 'meet on the axle line'); near(Math.abs(l.a[0]), F.a, 1e-9); near(Math.abs(l.a[2]), F.b, 1e-9); assert.equal(l.r, F.r); }
  assert.deepEqual(new Set(legs.map(l => Math.sign(l.a[0]) + ',' + Math.sign(l.a[2]))).size, 4);
});

import { ferrisPlacement } from '../ferris.js';
import { roomLayout, ROOM_Y } from '../rooms.js';

const R6 = roomLayout(6), P = ferrisPlacement({ centre: R6.centre, frame: R6.frame, portal: R6.portal, y: ROOM_Y }, FERRIS);
const toLocal = (R, x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * R.frame.f[0] + dz * R.frame.f[1], dx * R.frame.v[0] + dz * R.frame.v[1]]; };

test('ferrisPlacement_WheelOnTheRoomCentre_AxleAlongTheRoomFrame', () => {
  assert.deepEqual([P.wheel.x, P.wheel.z], R6.centre); near(P.wheel.th, Math.atan2(R6.frame.f[1], R6.frame.f[0]), 1e-9, 'turned to the room frame');
});

test('ferrisPlacement_FourLowFootCollidersAtTheFrameCorners_SolidToTheHub', () => {
  assert.equal(P.colliders.length, 4);
  for (const c of P.colliders) { assert.equal(c.low, true); assert.equal(c.ferris, 'foot'); near(c.hw, FERRIS.collider.hw, 1e-9); near(c.h, ROOM_Y + FERRIS.hub.y + FERRIS.collider.over, 1e-9); }
  const spots = P.colliders.map(c => toLocal(R6, c.x, c.z).map(Math.round).join(','));
  const A = FERRIS.frame.a, B = FERRIS.frame.b;
  assert.deepEqual(spots.sort(), [[-A, -B], [-A, B], [A, -B], [A, B]].map(p => p.join(',')).sort());
});
test('FERRIS_FeetStayInsideTheGravelLoopAndClearOfTheRoomCentre', () => {   // #588
  assert.ok(FERRIS.frame.b + FERRIS.collider.hw < 95, 'inside the 95 m loop'); assert.ok(FERRIS.frame.b - FERRIS.collider.hw > 10, 'clear of the centre');
  assert.equal(FERRIS.collider.hw, FERRIS.frame.foot.hw);
});

import { ledLayout, ledColour, patternAt, PATTERNS, salvoAt, burstsLive, particle, DUSK_LOOK } from '../ferris.js';

test('ledLayout_BothRimRingsAndTheSpokes_BetweenFifteenAndTwentyFiveHundredOnTheWheel', () => {
  const L = ledLayout(FERRIS); assert.ok(L.length >= 1500 && L.length <= 2500, `${L.length} LEDs`);
  const rim = L.filter(l => l.kind === 'rim'), spoke = L.filter(l => l.kind === 'spoke');
  assert.ok(rim.length > 600 && spoke.length > 600);
  for (const l of rim) { near(Math.hypot(l.pos[1], l.pos[2]), FERRIS.rim, 1e-6, 'on the rim'); near(Math.abs(l.pos[0]), 3, 1e-9, 'on a ring'); assert.ok(l.u >= 0 && l.u < 1); }
  assert.equal(new Set(rim.map(l => l.ring)).size, 2);
  for (const l of spoke) { const r = Math.hypot(l.pos[1], l.pos[2]); assert.ok(r > FERRIS.hub.r && r < FERRIS.rim, 'between hub and rim'); assert.ok(l.s > 0 && l.s < 1); }
  assert.deepEqual(L.map(l => l.i), L.map((_, i) => i));
});

test('ledColour_SameInputsSameOutput_EveryChannelInZeroToOne', () => {
  const L = ledLayout(FERRIS), a = [0, 0, 0], b = [0, 0, 0];
  for (const t of [0, 3.3, 17.9, 18.5, 40, 71.9, 500.25]) for (const l of L.filter((_, i) => i % 37 === 0)) {
    ledColour(l, t, a); ledColour(l, t, b); assert.deepEqual(a, b);
    for (const c of a) assert.ok(c >= 0 && c <= 1, `channel ${c} at t=${t}`);
  }
});

test('patternAt_CyclesThroughAllFourWithACrossfadeAtTheEnd', () => {
  assert.deepEqual(PATTERNS, ['chase', 'pulse', 'sparkle', 'fade']);
  const seen = new Set(); for (let t = 0; t < 72; t += 1) { const p = patternAt(t); seen.add(p.a); assert.ok(p.mix >= 0 && p.mix <= 1); }
  assert.equal(seen.size, 4);
  assert.equal(patternAt(5).mix, 0); assert.equal(patternAt(5).a, 'chase');
  const x = patternAt(17.25); assert.equal(x.a, 'chase'); assert.equal(x.b, 'pulse'); near(x.mix, 0.5, 1e-9, 'halfway');
  assert.equal(patternAt(72 + 5).a, 'chase');
});

test('ledColour_ChasePatternMovesAroundTheRim_ColourChangesInHalfASecond', () => {
  const rim = ledLayout(FERRIS).find(l => l.kind === 'rim'), a = [0, 0, 0], b = [0, 0, 0];
  ledColour(rim, 1, a); ledColour(rim, 1.5, b); assert.notDeepEqual(a, b);
});

test('salvoAt_Deterministic_ThreeToFiveBurstsInRange', () => {   // #588
  const FW = FERRIS.fireworks;
  for (let n = 0; n < 60; n++) {
    const s = salvoAt(n, FERRIS); assert.deepEqual(s, salvoAt(n, FERRIS));
    assert.ok(s.length >= 3 && s.length <= 5, `${s.length} bursts`);
    for (const b of s) {
      assert.ok(b.t0 >= n * FW.every && b.t0 <= n * FW.every + 2, 't0'); assert.ok(b.centre[1] >= FERRIS.h + 10 && b.centre[1] <= 400, 'y');
      assert.ok(Math.abs(b.centre[0]) <= 150 && Math.abs(b.centre[2]) <= 150, 'x z'); assert.ok(b.speed >= FW.speed[0] && b.speed <= FW.speed[1]); assert.ok(FW.colours.includes(b.colour));
    }
  }
});

test('burstsLive_OnlyBurstsWhoseAgeIsInsideTheirLife', () => {
  const FW = FERRIS.fireworks; let any = false;
  for (let t = 0; t < 60; t += 0.37) for (const b of burstsLive(t, FERRIS)) { any = true; assert.ok(t - b.t0 >= 0 && t - b.t0 < FW.life); }
  assert.ok(any); assert.equal(burstsLive(9.9, FERRIS).filter(b => 9.9 - b.t0 > FW.life).length, 0);
  assert.equal(burstsLive(FW.every * 3 + 8, FERRIS).length, 0, 'quiet gap late in a period');
});

test('particle_RisesThenFallsAndFadesFromOneToZero', () => {
  const FW = FERRIS.fireworks, b = salvoAt(1, FERRIS)[0], o = [0, 0, 0, 0], p = [0, 0, 0, 0];
  particle(b, 0, 0, o); near(o[3], 1, 1e-12, 'fade at 0'); near(o[0], b.centre[0], 1e-9, 'starts at the centre'); near(o[1], b.centre[1], 1e-9);
  particle(b, 0, FW.life, o); near(o[3], 0, 1e-12, 'fade at life');
  let apex = -Infinity, last = 0;
  for (let a = 0; a < FW.life; a += 0.05) { particle(b, 5, a, p); if (p[1] > apex) apex = p[1]; last = p[1]; }
  assert.ok(apex > b.centre[1] - 1e-9); assert.ok(last < apex + 1e-9);
  for (let j = 0; j < FW.particles; j += 7) { particle(b, j, 2.2, p); particle(b, j, 1.2, o); assert.ok(p[3] < o[3]); }
  // gravity: a sideways-flung particle (equator of the sphere) only falls
  particle(b, FW.particles / 2, 0.5, o); particle(b, FW.particles / 2, 2, p); assert.ok(p[1] < o[1] && p[1] < b.centre[1]);
});

test('DUSK_LOOK_HasTheSameShapeAsRoomLook', () => {
  for (const k of ['fog', 'density', 'skyTop', 'skyHor', 'hemiSky', 'hemiGround', 'hemi', 'sun']) assert.ok(k in DUSK_LOOK, k);
  assert.equal(DUSK_LOOK.skyHor, '#f0875a');
});

test('ferrisPlacement_BoardingPad_CentredUnderTheHubTurnedToTheRoomFrame', () => {   // #516
  assert.deepEqual(P.pad, { x: R6.centre[0], z: R6.centre[1], th: P.wheel.th, hw: FERRIS.pad.hw, hd: FERRIS.pad.hd });
  assert.equal(FERRIS.pad.hw, 5);
  assert.equal(FERRIS.pad.hd, 20);   // #588: scaled with the 250 m wheel -- it must cover the bottom window's exit at rim·sin(0.15) = 18.7 m
  assert.equal(roomLayout(6).paths.length, 2);   // the pad is no third path (A8)
  for (const k of [0, 1, 2, 3, 4, 5, 7]) assert.equal(roomLayout(k).ferris, null);   // no other room has a pad
});

import { manualSalvo, nextPatternShift, FERRIS_KEYS, PATTERN_LEN } from '../ferris.js';

test('burstsLive_WithoutExtraSalvos_IsUnchanged', () => {
  for (const t of [0.5, 3, 12.2, 31]) assert.deepEqual(burstsLive(t, FERRIS, []), burstsLive(t, FERRIS));
});

test('manualSalvo_StartsAtThePressAndIsDeterministic', () => {
  const a = manualSalvo(100.5, FERRIS), b = manualSalvo(100.5, FERRIS), FW = FERRIS.fireworks;
  assert.deepEqual(a, b); assert.ok(a.length >= FW.perSalvo[0] && a.length <= FW.perSalvo[1]);
  for (const x of a) { assert.ok(x.t0 >= 100.5 && x.t0 < 102.5, 'bursts start within 2 s of the press'); assert.equal(x.centre.length, 3); }
  assert.notDeepEqual(manualSalvo(100.5, FERRIS).map(x => x.centre), manualSalvo(107.25, FERRIS).map(x => x.centre), 'a different press makes a different salvo');
});

test('burstsLive_ExtraSalvo_FiresImmediatelyOnTopOfTheAutomaticOne', () => {
  const FW = FERRIS.fireworks, t = FW.every * 3 + 8;   // a quiet gap late in a period
  assert.equal(burstsLive(t, FERRIS).length, 0);
  const live = burstsLive(t + 1.5, FERRIS, [t]);
  assert.ok(live.length > 0, 'the manual salvo is alive');
  for (const b of live) { const age = t + 1.5 - b.t0; assert.ok(age >= 0 && age < FW.life); }
  assert.equal(burstsLive(t - 0.01, FERRIS, [t]).length, 0, 'nothing before the press');
  const late = t + 2 + FW.life + 0.1; assert.deepEqual(burstsLive(late, FERRIS, [t]), burstsLive(late, FERRIS), 'gone after the life');
  const auto = burstsLive(FW.every + 0.8, FERRIS).length;
  assert.ok(burstsLive(FW.every + 0.8, FERRIS, [FW.every + 0.5]).length >= auto, 'adds to the automatic salvo');
});

test('nextPatternShift_JumpsToTheStartOfTheNextPattern_AndCycles', () => {
  let shift = 0, t = 5.3; const seen = [];
  for (let i = 0; i < PATTERNS.length; i++) {
    shift = nextPatternShift(t, shift);
    const p = patternAt(t + shift); assert.equal(p.mix, 0); near(((t + shift) % PATTERN_LEN + PATTERN_LEN) % PATTERN_LEN, 0, 1e-9, 'at the start of a pattern');
    seen.push(p.a); t += 0.7;
  }
  assert.deepEqual(seen, [PATTERNS[1], PATTERNS[2], PATTERNS[3], PATTERNS[0]], 'cycles through the four patterns in order');
});

test('FERRIS_KEYS_AreTheFreeDigits3And4', () => {
  assert.deepEqual(FERRIS_KEYS, { fireworks: 'Digit3', show: 'Digit4' });
});

test('ferrisPlacement_Sign_JustInsideThePortalBesideTheLane_FacingTheWayIn_AndSolid', () => {
  const S = P.sign, [px, pz] = R6.portal.c, { f, v } = R6.frame, c = FERRIS.sign;
  near((S.x - px) * f[0] + (S.z - pz) * f[1], c.a, 1e-9, 'a into the room'); near((S.x - px) * v[0] + (S.z - pz) * v[1], c.b, 1e-9, 'b to the side');
  assert.ok(Math.abs(c.b) > 4 + c.w / 2, 'clear of the 8 m wide drive-in lane'); assert.ok(c.a < 100, 'near the portal, before the wheel');
  near(S.face, Math.atan2(-f[1], -f[0]), 1e-9, 'front towards the portal');
  assert.equal(S.colliders.length, 1); near(S.colliders[0].hd, c.w / 2, 1e-9); assert.ok(S.colliders[0].h > ROOM_Y + c.lift);
  assert.equal(P.colliders.length, 4, 'the sign does not change the foot colliders');
  assert.ok(R6.colliders.includes(R6.ferris.sign.colliders[0]), 'roomLayout adds the sign collider');
});
