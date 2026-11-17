// #859: the rally hall and its three cars -- pure. node --test tests/rallyhall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RALLYHALL, boardLayout } from '../rallyhall.js';
import { RALLY } from '../rally.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('RALLYHALL_ThreeCarsOfTheirRealSizes_EvansNeuvilleMcCrae', () => {
  assert.equal(RALLYHALL.key, 'rallyhall'); near(RALLYHALL.h, 14.8, 1e-9);
  assert.deepEqual(RALLYHALL.cars.map(c => c.id), ['neuville', 'evans', 'mccrae']);
  for (const c of RALLYHALL.cars) { assert.ok(c.len >= 4.0 && c.len <= 4.4, `${c.id} length`); assert.ok(c.wid >= 1.75 && c.wid <= 1.9, `${c.id} width`); assert.ok(c.hgt >= 1.35 && c.hgt <= 1.45, `${c.id} height`); }
  near(RALLYHALL.hall.roof.y0 + RALLYHALL.hall.roof.t, RALLYHALL.h, 1e-9, 'the roof top is the hall height');
});

test('RALLYHALL_EveryCarIsTheRhyRally_ThreeDifferentLiveryTints', () => {
  for (const c of RALLYHALL.cars) assert.equal(c.vehicle, 'rally', `${c.id} is the game's rally car`);
  assert.ok(RALLY.gltf, 'the Rhy Rally is a glTF vehicle');
  assert.equal(new Set(RALLYHALL.cars.map(c => c.tint)).size, 3, 'three different looks');
  for (const c of RALLYHALL.cars) assert.ok(c.tint === null || (Number.isInteger(c.tint) && c.tint >= 0 && c.tint <= 0xffffff), `${c.id} tint`);
});

import { rallyhallPlacement } from '../rallyhall.js';

const room = { centre: [1000, -2000], frame: { f: [0, 1], v: [-1, 0] }, y: -600 };   // the far wall lies along +z; v = f turned +90°
const loc = (a, b) => [room.centre[0] + room.frame.f[0] * a + room.frame.v[0] * b, room.centre[1] + room.frame.f[1] * a + room.frame.v[1] * b];
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };

test('rallyhallPlacement_HallAtTheCentre_CarsOnTheirPodiumsNosesToTheOpenFront', () => {
  const P = rallyhallPlacement(room, RALLYHALL), th = Math.atan2(room.frame.f[1], room.frame.f[0]);
  assert.deepEqual([P.hall.x, P.hall.z], room.centre); near(P.hall.th, th, 1e-9);
  assert.equal(P.cars.length, 3);
  RALLYHALL.cars.forEach((c, i) => {
    assert.equal(P.cars[i].id, c.id); assert.deepEqual([P.cars[i].x, P.cars[i].z], loc(...c.at)); near(P.cars[i].th, th + c.th, 1e-9);
    assert.ok(Math.cos(c.th) < 0, `${c.id}: nose towards the portal side (-a)`);
  });
});

test('rallyhallPlacement_NineColliders_AllLow_WallsToTheRoofTop_RoofIsABridge_CarsSolidAbove2m4', () => {
  const P = rallyhallPlacement(room, RALLYHALL), Y = room.y;
  assert.equal(P.colliders.length, 9); assert.ok(P.colliders.every(o => o.low === true && Number.isFinite(o.x) && o.hw > 0 && o.hd > 0));
  const bridges = P.colliders.filter(o => o.bridge); assert.equal(bridges.length, 1);
  near(bridges[0].y0, Y + 14.0, 1e-9, 'roof deck'); near(bridges[0].h, Y + 14.8, 1e-9, 'roof top');
  const solid = P.colliders.filter(o => !o.bridge && o.h >= Y + 14.8 - 1e-9); assert.equal(solid.length, 5, 'back wall, two side walls, two posts');
  const cars = P.colliders.filter(o => !o.bridge && o.h < Y + 14); assert.equal(cars.length, 3); for (const o of cars) assert.ok(o.h >= Y + 2.4);
});

test('rallyhallPlacement_BlocksTheCarAtWallsPostsAndPodiums_LeavesFloorUnderRoofApronAndLoopFree', () => {
  const P = rallyhallPlacement(room, RALLYHALL), CAR_R = 2.6;
  const blocked = (a, b, r = CAR_R) => P.colliders.some(o => !o.bridge && inside(o, ...loc(a, b), r));
  for (const [a, b] of [[19.7, 0], [0, 35.7], [0, -35.7], [-19.5, 35.5], [-19.5, -35.5], [4, -22], [4, 0], [4, 22]]) assert.ok(blocked(a, b, 0), `solid at ${a},${b}`);
  for (const [a, b] of [[-5, -11], [-5, 11], [4, -11], [4, 11], [12, 0], [-22, 0], [-23, 20], [-95, 0], [0, -95], [95, 0]]) assert.ok(!blocked(a, b), `free at ${a},${b}`);
  const [from, to] = P.apron; assert.deepEqual(from, loc(-95, 0)); assert.deepEqual(to, loc(-24, 0));
});

test('boardLayout_TextIsTheHonour_MainLineReadableAt3m_ThirdLineSmaller', () => {
  const B = boardLayout(RALLYHALL);
  assert.deepEqual(B.lines.map(l => l.text), ['Elfyn Evans', 'WRC World Champion 2026', '& Scott Martin']);
  assert.ok(B.lines[0].size * B.h >= 0.4, 'main line letters are at least 0.4 m');
  assert.ok(B.lines[2].size < B.lines[0].size && B.lines[1].size < B.lines[0].size);
});

test('boardLayout_OnTheBackWallBehindEvans_BelowTheGlassBand_NoCollider_FreeFloorAt3m', () => {
  const B = boardLayout(RALLYHALL), H = RALLYHALL.hall, wallFace = H.d / 2 - H.wall;
  assert.ok(B.a <= wallFace && wallFace - B.a <= 0.1, 'hangs within 10 cm of the wall face');
  assert.ok(B.b - B.w / 2 >= -(H.w / 2 - H.wall) && B.b + B.w / 2 <= H.w / 2 - H.wall, 'inside the wall width');
  assert.ok(B.y0 >= H.floor && B.y0 + B.h <= H.glass.y0, 'between floor and the glass band');
  const evans = RALLYHALL.cars.find(c => c.id === 'evans'); near(B.b, evans.at[1], 1e-9, 'behind the Evans car');
  assert.ok(evans.at[0] + RALLYHALL.podium.hw < B.a - 3, 'a 3 m viewing spot lies beyond the podium collider');
  assert.equal(rallyhallPlacement(room, RALLYHALL).colliders.length, 9);
});

import { flagLayout } from '../rallyhall.js';

test('flagLayout_WalesThenTheUnionJack_FiveByThree_SvgFilesUnderAssetsFlags', () => {
  const F = flagLayout(RALLYHALL);
  assert.deepEqual(F.map(f => f.id), ['wales', 'uk']);
  for (const f of F) { near(f.w / f.h, 5 / 3, 1e-9, `${f.id} is 5:3`); assert.match(f.src, /^\.\/assets\/flags\/[a-z]+\.svg$/); }
});

test('flagLayout_OnTheGlassBandAboveTheBoard_CentredOverIt_WalesOnTheLeftSeenFromTheFront_NoCollider', () => {
  const F = flagLayout(RALLYHALL), B = boardLayout(RALLYHALL), H = RALLYHALL.hall, glassFront = H.d / 2 - H.wall - 0.1;
  for (const f of F) {
    assert.ok(f.a < glassFront && glassFront - f.a <= 0.1, `${f.id} hangs within 10 cm in front of the glass band`);
    assert.ok(f.y0 >= H.glass.y0 && f.y0 > B.y0 + B.h && f.y0 + f.h <= H.glass.y1, `${f.id} on the glass band, above the board`);
    assert.ok(Math.abs(f.b) + f.w / 2 <= H.w / 2 - H.wall, `${f.id} inside the wall width`);
  }
  near((F[0].b + F[1].b) / 2, B.b, 1e-9, 'centred over the board');
  assert.ok(F[1].b - F[0].b >= F[0].w, 'side by side, not overlapping');
  assert.ok(F[0].b < F[1].b, 'Wales on -b: the left as seen from the open front (looking +a, +b is to the right)');
  assert.equal(rallyhallPlacement(room, RALLYHALL).colliders.length, 9);
});

import { videoLayout, videoEmbedUrl, videoShown } from '../rallyhall.js';

test('videoLayout_PortraitShortOnTheGlassBand_LeftOfTheFlags_ClearOfThem', () => {
  const V = videoLayout(RALLYHALL), H = RALLYHALL.hall, F = flagLayout(RALLYHALL), glassFront = H.d / 2 - H.wall - 0.1;
  near(V.w / V.h, 9 / 16, 1e-9, 'a Short is 9:16');
  assert.ok(V.a < glassFront && glassFront - V.a <= 0.1, 'within 10 cm in front of the glass band');
  assert.ok(V.y0 >= H.glass.y0 && V.y0 + V.h <= H.glass.y1, 'on the glass band');
  assert.ok(V.b + V.w / 2 < Math.min(...F.map(f => f.b - f.w / 2)) - 1, 'left of the flags with a metre between');
  assert.ok(V.b - V.w / 2 >= -(H.w / 2 - H.wall), 'inside the wall width');
});

test('videoEmbedUrl_NoCookieEmbed_MutedAutoplayLoopingThatOneVideo', () => {
  const u = new URL(videoEmbedUrl(RALLYHALL.video.id));
  assert.equal(u.origin, 'https://www.youtube-nocookie.com');
  assert.equal(u.pathname, '/embed/cZxfLJdhWk8');
  for (const [k, v] of [['autoplay', '1'], ['mute', '1'], ['loop', '1'], ['playlist', 'cZxfLJdhWk8'], ['playsinline', '1'], ['rel', '0']]) assert.equal(u.searchParams.get(k), v, k);
});

test('videoShown_OnlyFromTheHallFloorAndApronInFrontOfTheWall', () => {
  assert.equal(videoShown(-80, 0, 1.5), true, 'on the apron');
  assert.equal(videoShown(10, -13, 1.5), true, 'in the hall');
  assert.equal(videoShown(19.5, 0, 1.5), false, 'at or behind the wall');
  assert.equal(videoShown(-120, 0, 1.5), false, 'beyond the apron');
  assert.equal(videoShown(0, 50, 1.5), false, 'beside the hall');
  assert.equal(videoShown(0, 0, -5), false, 'below the floor');
  assert.equal(videoShown(0, 0, 40), false, 'above the roof');
});
