// #811: the Space Shuttle Enterprise in launch position -- pure. node --test tests/shuttle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHUTTLE, stackParts, stackTop, wingOutline, tailOutline, orbiterExtent, shuttlePlacement, stackFrame, stackBase, padLayout } from '../shuttle.js';
import { roomLayout, RINGS, ROOM2_Y } from '../rooms.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);
const onAxis = (p) => Math.abs(p.x) < 1e-9 && Math.abs(p.z) < 1e-9;

test('SHUTTLE_IsLifeSize_StackTankBoostersAndOrbiterHaveTheRealMeasures', () => {
  assert.equal(SHUTTLE.key, 'shuttle'); near(SHUTTLE.h, 56.1, 1e-9);
  near(SHUTTLE.et.r * 2, 8.4, 1e-9, 'tank diameter'); near(SHUTTLE.et.y1 - SHUTTLE.et.y0, 46.9, 1e-9, 'tank length');
  near(SHUTTLE.srb.r * 2, 3.71, 1e-9, 'booster diameter'); near(SHUTTLE.srb.y1 + SHUTTLE.srb.nose - SHUTTLE.srb.y0, 45.46, 1e-9, 'booster length incl. nose');
  near(SHUTTLE.orbiter.length, 37.24, 1e-9, 'orbiter length'); near(SHUTTLE.orbiter.span, 23.79, 1e-9, 'wingspan');
  assert.ok(SHUTTLE.srb.off > SHUTTLE.et.r + SHUTTLE.srb.r, 'the boosters hang beside the tank, not inside it');
});

test('stackParts_TankOnTheAxisEndsAtTheTip_PartsMeetWithoutGaps', () => {
  const parts = stackParts(SHUTTLE);
  near(stackTop(parts), SHUTTLE.h, 1e-9, 'the tip');
  for (const p of parts) { assert.ok(['cyl', 'cone'].includes(p.kind)); assert.ok(p.y1 > p.y0); assert.ok(p.r0 >= 0 && p.r1 >= 0); assert.equal(typeof p.colour, 'number'); if (p.kind === 'cyl') assert.equal(p.r0, p.r1); }
  const tank = parts.filter(onAxis).sort((a, b) => a.y0 - b.y0);
  near(tank[0].y0, SHUTTLE.et.y0, 1e-9, 'the aft dome'); near(tank[tank.length - 1].y1, SHUTTLE.h, 1e-9, 'the nose spike');
  for (let i = 1; i < tank.length; i++) near(tank[i].y0, tank[i - 1].y1, 1e-9, `gap under the tank part at ${tank[i].y0}`);
  for (const p of tank) assert.ok(Math.max(p.r0, p.r1) <= SHUTTLE.et.r + 1e-9, 'nothing wider than the tank');
});

test('stackParts_TwoBoostersAlongTheRoomAxis_StandingOnTheDeck_BelowTheTankTip', () => {
  const srb = stackParts(SHUTTLE).filter(p => Math.abs(Math.abs(p.x) - SHUTTLE.srb.off) < 1e-9 && Math.abs(p.z) < 1e-9);
  const tubes = srb.filter(p => p.kind === 'cyl' && Math.abs(p.r0 - SHUTTLE.srb.r) < 1e-9);
  assert.equal(tubes.length, 2); assert.deepEqual(tubes.map(p => Math.sign(p.x)).sort(), [-1, 1], 'one booster each side along f');
  assert.equal(Math.min(...srb.map(p => p.y0)), 0, 'standing on the deck');
  near(Math.max(...srb.map(p => p.y1)), SHUTTLE.srb.y1 + SHUTTLE.srb.nose, 1e-9, 'nose tip'); assert.ok(Math.max(...srb.map(p => p.y1)) < SHUTTLE.h);
});

test('wingOutline_DoubleDeltaBothSides_SpansTheRealWingspan_RootsInsideTheFuselage', () => {
  const pts = wingOutline(SHUTTLE), O = SHUTTLE.orbiter;
  near(Math.max(...pts.map(p => p[1])), O.span / 2, 1e-9, 'right tip'); near(Math.min(...pts.map(p => p[1])), -O.span / 2, 1e-9, 'left tip');
  for (const [u] of pts) assert.ok(u >= O.body.u0 - 1e-9 && u <= O.body.u1, 'between the aft end and the nose');
  const roots = pts.filter(p => Math.abs(p[1]) <= O.body.w / 2 + 1e-9); assert.ok(roots.length >= 2, 'the roots sit in the fuselage');
});

test('orbiterExtent_BellyClearsTheTank_WingsClearTheBoosters_NoseUnderTheTankTip', () => {
  const E = orbiterExtent(SHUTTLE), O = SHUTTLE.orbiter;
  assert.ok(E.z0 > SHUTTLE.et.r + 0.5, `belly ${E.z0} off the tank skin`);
  assert.ok(E.z0 > SHUTTLE.srb.r, 'the wings pass in front of the boosters');
  near(E.y1 - E.y0, O.length, 1e-9, 'engine exits to nose'); assert.ok(E.y0 >= SHUTTLE.srb.skirt.h, 'engines above the booster skirts');
  assert.ok(E.y1 < SHUTTLE.et.y1 - 5, 'the tank nose stands well over the orbiter');
  near(E.x1, O.span / 2, 1e-9); const tail = tailOutline(SHUTTLE); near(E.z1, O.off + O.body.d / 2 + Math.max(...tail.map(p => p[1])), 1e-9, 'the fin top');
});

const ring2 = RINGS.find(g => g.id === 'ring2'), R = roomLayout(7, ring2.rooms[7], ring2);
const S = shuttlePlacement({ centre: R.centre, frame: R.frame, y: ROOM2_Y }, SHUTTLE);

test('shuttlePlacement_StackOnTheRoomCentre_Turned45Degrees_TheOrbiterFacesThePortalThreeQuarterOn', () => {
  assert.deepEqual([S.stack.x, S.stack.z], R.centre); near(SHUTTLE.turn, Math.PI / 4, 1e-9);
  const { x: X, z: Z } = stackFrame(R.frame.f, R.frame.v, SHUTTLE.turn), dot = (p, q) => p[0] * q[0] + p[1] * q[1];
  near(S.stack.th, Math.atan2(X[1], X[0]), 1e-9); near(dot(X, Z), 0, 1e-9, 'square'); near(Math.hypot(...X), 1, 1e-9);
  near(dot(X, R.frame.f), Math.SQRT1_2, 1e-9, 'the boosters line 45° off the room axis');
  const toPortal = [R.portal.c[0] - R.centre[0], R.portal.c[1] - R.centre[1]], n = Math.hypot(...toPortal);
  near(dot(Z, toPortal) / n, Math.SQRT1_2, 1e-9, 'the orbiter side half turned to the portal');
});

test('padLayout_Pad39A_HardstandWithTheTrench_TheTowerAndServiceStructureBesideThePlatform', () => {
  const L = padLayout(SHUTTLE), P = SHUTTLE.pad, base = stackBase(SHUTTLE);
  near(base, P.hard.h + P.pedestal.h + SHUTTLE.deck.h, 1e-9, 'the deck top'); near(L.deck.y1, base, 1e-9); near(L.deck.y0, P.hard.h + P.pedestal.h, 1e-9);
  near(L.trench.x[1] - L.trench.x[0], P.trench.w, 1e-9); assert.ok(P.trench.w / 2 > SHUTTLE.srb.off + SHUTTLE.srb.r, 'the boosters fire into the trench');
  for (const H of L.hard) { assert.ok(H.top.x[1] - H.top.x[0] > 0 && H.top.z[1] - H.top.z[0] > 0); assert.ok(H.foot.x[0] <= H.top.x[0] && H.foot.x[1] >= H.top.x[1], 'leans in'); }
  for (const p of L.pedestals) assert.ok(Math.abs(p.x) - p.s / 2 > L.trench.x[1], 'the mounts stand on the hardstand, not over the trench');
  const inTop = (x, z) => L.hard.some(H => x >= H.top.x[0] && x <= H.top.x[1] && z >= H.top.z[0] && z <= H.top.z[1]);
  const F = L.fss; assert.ok(inTop(F.x - F.w / 2, F.z - F.w / 2) && inTop(F.x + F.w / 2, F.z + F.w / 2), 'the tower on the hardstand');
  assert.ok(F.x + F.w / 2 < -SHUTTLE.deck.w / 2, 'the tower beside the platform'); near(F.mastTop, P.hard.h + 105.8, 0.2, '347 ft to the mast tip');
  assert.ok(L.rss.z + L.rss.d / 2 < -SHUTTLE.deck.d / 2, 'the service structure swung clear of the platform'); near(L.rss.y1 - P.hard.h, 57.6, 1e-9);
  assert.ok(Math.hypot(L.water.x, L.water.z) - L.water.spread > Math.hypot(P.hard.w, P.hard.d) / 2, 'the water tower off the hardstand');
});

test('padLayout_TheArmsReachTheOrbiterHatchAndTheTankTip_FromTheTowerFace', () => {
  const L = padLayout(SHUTTLE), F = L.fss, base = stackBase(SHUTTLE), O = SHUTTLE.orbiter, E = SHUTTLE.et;
  for (const a of [L.arm, L.vent]) { near(a.x[0], F.x + F.w / 2, 1e-9, 'from the tower face'); assert.ok(a.z >= F.z - F.w / 2 && a.z <= F.z + F.w / 2, 'out of the tower'); assert.ok(a.y > F.y0 && a.y < F.y1, 'below the tower top'); }
  near(L.arm.x[1], -O.body.w / 2, 1e-9, 'at the fuselage side'); near(L.arm.z, O.off, 1e-9);
  assert.ok(L.arm.y - base > O.y0 + Math.max(...O.wing.map(p => p[0])), 'above the wing'); assert.ok(L.arm.y - base < O.y0 + O.body.u1, 'at the crew cabin, below the nose');
  const C = L.vent.cap; assert.ok(C.y0 - base < E.y1 && C.y1 - base > E.y1 - E.spike.h, 'the hood over the tank tip'); near(L.vent.x[1], -C.r, 1e-9);
});

test('shuttlePlacement_ElevenLowColliders_TheStackABridgeOverTheTrench', () => {
  assert.equal(S.colliders.length, 11); for (const c of S.colliders) { assert.equal(c.low, true); assert.ok(c.h > ROOM2_Y + 1); }
  const by = (k) => S.colliders.filter(c => c.shuttle === k), deckTop = ROOM2_Y + stackBase(SHUTTLE), L = padLayout(SHUTTLE);
  const hard = by('hardstand'), [mount] = by('mount'), [et] = by('tank'), srb = by('srb'), [body] = by('fuselage'), [wings] = by('wings');
  assert.ok(hard.length === 2 && mount && et && body && wings && srb.length === 2 && by('fss').length === 1 && by('rss').length === 1 && by('water').length === 1);
  for (const H of hard) { near(H.h, ROOM2_Y + SHUTTLE.pad.hard.h, 1e-9); assert.equal(H.bridge, undefined); }
  near(mount.h, deckTop, 1e-9, 'the platform'); near(mount.hw, SHUTTLE.deck.w / 2, 1e-9); near(mount.hd, SHUTTLE.deck.d / 2, 1e-9);
  assert.ok(mount.bridge && Math.abs(mount.y0 - (ROOM2_Y + L.deck.y0)) < 1e-9, 'the platform spans the trench');
  for (const o of [et, ...srb, body, wings]) assert.ok(o.bridge && Math.abs(o.y0 - deckTop) < 1e-9, 'the stack stands over the trench');
  assert.ok(et.h >= deckTop + SHUTTLE.h);
  const { x: X, z: Z } = stackFrame(R.frame.f, R.frame.v, SHUTTLE.turn);
  const toLocal = (x, z) => { const dx = x - R.centre[0], dz = z - R.centre[1]; return [dx * X[0] + dz * X[1], dx * Z[0] + dz * Z[1]]; };
  for (const o of S.colliders) { near(o.c, X[0], 1e-9); near(o.s, X[1], 1e-9); }
  for (const s of srb) { const [a, b] = toLocal(s.x, s.z); near(Math.abs(a), SHUTTLE.srb.off, 1e-6); near(b, 0, 1e-6); }
  const E = orbiterExtent(SHUTTLE);
  for (const o of [body, wings]) { const [a, b] = toLocal(o.x, o.z); near(a, 0, 1e-6); assert.ok(b - o.hd >= E.z0 - 1e-6 && b + o.hd <= E.z1 + 1e-6, 'within the orbiter'); }
  near(wings.hw, SHUTTLE.orbiter.span / 2, 1e-9); assert.ok(mount.hw >= wings.hw && mount.hd >= E.z1, 'the platform is under the whole stack');
  const [fss] = by('fss'), [a, b] = toLocal(fss.x, fss.z); near(a, L.fss.x, 1e-6); near(b, L.fss.z, 1e-6); near(fss.h, ROOM2_Y + L.fss.crane, 1e-9);
});
