// #508: the viewpoint hunt's pure rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW, VIEWPOINT_DEFS, viewpointsFor, resolveViewpoints, standsAt, standingAt, aimError, shotPoints, maxPoints, ALBUM, parseAlbum, albumWith, thumbSize, viewNoticeStep, NOTICE } from '../viewpoints.js';

const RAD = Math.PI / 180;
const vp = { id: 'a', n: 'A', subjectN: 'S', x: 0, z: 0, r: 10, minY: -Infinity, sx: 100, sz: 0 };
const facing = (deg, extra = {}) => ({ x: 0, y: 0, z: 0, dx: Math.cos(deg * RAD), dz: Math.sin(deg * RAD), ...extra });

test('VIEWPOINT_DEFS: Hochrhein has the four hand-picked viewpoints, Rheinblick at the issue coordinates', () => {
  assert.deepEqual(VIEWPOINT_DEFS.hochrhein.map(d => d.id), ['rheinblick', 'plattform', 'fridolinsbruecke', 'muensterplatz']);
  assert.deepEqual(VIEWPOINT_DEFS.hochrhein[0].at, { x: -1515.1, z: 870.4 });
  assert.equal(VIEWPOINT_DEFS.hochrhein[1].at, 'plattform');
});

test('viewpointsFor: only built-in regions with a list have viewpoints', () => {
  assert.equal(viewpointsFor({ id: 'hochrhein', generated: false }).length, 4);
  assert.deepEqual(viewpointsFor({ id: 'ehrendingen', generated: false }), []);
  assert.deepEqual(viewpointsFor({ id: 'hochrhein', generated: true }), []);
});

test('resolveViewpoints: landmark keys and fixed points resolve, a missing landmark drops the viewpoint', () => {
  const defs = [
    { id: 'one', n: 'One', at: 'a', r: 5, aboveGround: 5, subject: 's', subjectN: 'S' },
    { id: 'two', n: 'Two', at: { x: 7, z: 8 }, r: 3, subject: { x: 9, z: 10 }, subjectN: 'T' },
    { id: 'three', n: 'Three', at: 'a', r: 3, subject: 'missing', subjectN: 'M' },
  ];
  const got = resolveViewpoints(defs, { a: { x: 1, z: 2 }, s: { x: 5, z: 6 } }, () => 10);
  assert.deepEqual(got, [
    { id: 'one', n: 'One', subjectN: 'S', x: 1, z: 2, r: 5, minY: 15, sx: 5, sz: 6 },
    { id: 'two', n: 'Two', subjectN: 'T', x: 7, z: 8, r: 3, minY: -Infinity, sx: 9, sz: 10 },
  ]);
  assert.deepEqual(resolveViewpoints(defs, undefined, () => 0).map(v => v.id), ['two']);
});

test('standsAt: inside the radius and high enough', () => {
  assert.equal(standsAt(vp, facing(0, { x: 9.9 })), true);
  assert.equal(standsAt(vp, facing(0, { x: 10.1 })), false);
  const deck = { ...vp, minY: 5 };
  assert.equal(standsAt(deck, facing(0, { y: 5.7 })), true);
  assert.equal(standsAt(deck, facing(0, { y: 0.2 })), false);
});

test('standingAt: the first open viewpoint the pose stands at, else -1', () => {
  const b = { ...vp, id: 'b', x: 500 };
  assert.equal(standingAt([b, vp], [false, false], facing(0)), 1);
  assert.equal(standingAt([b, vp], [false, true], facing(0)), -1);
});

test('aimError: degrees between the camera and the subject, across the +-180 seam', () => {
  assert.equal(Math.round(aimError(vp, facing(0))), 0);
  assert.equal(Math.round(aimError(vp, facing(90))), 90);
  const behind = { ...vp, sx: -100, sz: 1 };   // subject at about 179.4 deg
  assert.ok(aimError(behind, facing(-179)) < 2);
});

test('shotPoints: 150 dead on, less when off, 0 past the aim limit or away from the spot', () => {
  assert.equal(shotPoints(vp, facing(0)), 150);
  assert.equal(shotPoints(vp, facing(15)), 125);
  assert.equal(shotPoints(vp, facing(VIEW.aimDeg - 0.5)), 101);   // just inside the limit (exactly 30 deg is float-fragile)
  assert.equal(shotPoints(vp, facing(VIEW.aimDeg + 1)), 0);
  assert.equal(shotPoints(vp, facing(0, { x: 50 })), 0);
});

test('maxPoints: 150 per viewpoint', () => {
  assert.equal(maxPoints([vp, vp, vp, vp]), 600);
});

const IDS = ['rheinblick', 'plattform'];
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('parseAlbum: keeps valid entries of known viewpoints, drops everything else', () => {
  assert.deepEqual(parseAlbum(null, IDS), {});
  assert.deepEqual(parseAlbum('{broken', IDS), {});
  assert.deepEqual(parseAlbum('[1,2]', IDS), {});
  const raw = JSON.stringify({
    rheinblick: { img: JPEG, pts: 140, at: 1 },
    plattform: { img: 'data:image/png;base64,AAAA', pts: 120, at: 2 },
    stranger: { img: JPEG, pts: 150, at: 3 },
  });
  assert.deepEqual(parseAlbum(raw, IDS), { rheinblick: { img: JPEG, pts: 140, at: 1 } });
});

test('parseAlbum: rejects script URLs, markup, oversize images and non-numbers', () => {
  const bad = (e) => parseAlbum(JSON.stringify({ rheinblick: e }), IDS);
  assert.deepEqual(bad({ img: 'javascript:alert(1)', pts: 1, at: 1 }), {});
  assert.deepEqual(bad({ img: JPEG + '"><img src=x>', pts: 1, at: 1 }), {});
  assert.deepEqual(bad({ img: JPEG.slice(0, 23) + 'A'.repeat(ALBUM.maxLen), pts: 1, at: 1 }), {});
  assert.deepEqual(bad({ img: JPEG, pts: '1', at: 1 }), {});
});

test('albumWith: a better or equal photo replaces, a worse one does not', () => {
  const a = { rheinblick: { img: JPEG, pts: 130, at: 1 } };
  assert.equal(albumWith(a, 'rheinblick', { img: JPEG, pts: 120, at: 2 }), a);
  assert.equal(albumWith(a, 'rheinblick', { img: JPEG, pts: 130, at: 2 }).rheinblick.at, 2);
  assert.equal(albumWith(a, 'plattform', { img: JPEG, pts: 101, at: 3 }).plattform.pts, 101);
});

test('thumbSize: 320 px wide at most, aspect kept', () => {
  assert.deepEqual(thumbSize(1280, 720), { w: 320, h: 180 });
  assert.deepEqual(thumbSize(200, 100), { w: 200, h: 100 });
});

test('viewNoticeStep: arriving at an open viewpoint announces it once', () => {
  let r = viewNoticeStep({ at: -1, cool: [] }, 1, [false, false], 0.016);
  assert.deepEqual(r.event, { kind: 'arrive', i: 1 });
  r = viewNoticeStep(r.st, 1, [false, false], 0.016);
  assert.equal(r.event, null);
});
test('viewNoticeStep: leaving without a photo reminds, leaving after a scored photo does not', () => {
  const st = { at: 0, cool: [0, 0] };
  assert.deepEqual(viewNoticeStep(st, -1, [false, false], 0.016).event, { kind: 'leave', i: 0 });
  assert.equal(viewNoticeStep(st, -1, [true, false], 0.016).event, null);
});
test('viewNoticeStep: edge flicker is silenced by the cooldown, then works again', () => {
  let r = viewNoticeStep({ at: -1, cool: [] }, 0, [false], 0.016);   // arrive
  r = viewNoticeStep(r.st, -1, [false], 0.016);                      // leave inside cooldown
  assert.equal(r.event, null);
  r = viewNoticeStep(r.st, 0, [false], NOTICE.cooldownS + 1);         // back after the cooldown
  assert.deepEqual(r.event, { kind: 'arrive', i: 0 });
});
