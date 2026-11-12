// #749: pure rules for the video recording. Unit-tested with `node --test tests/record.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRecordFormat, recordFileName, recordBitrate, recordKeyAction, recordNext, recordElapsed, formatClock, FORMATS, MAX_SECONDS, RECORD_KEY } from '../record.js';

test('pickRecordFormat: mp4 before webm, null when nothing', () => {
  assert.deepEqual(pickRecordFormat(() => true), { mime: FORMATS[0], ext: 'mp4' });
  assert.deepEqual(pickRecordFormat(m => m.startsWith('video/webm')), { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' });
  assert.equal(pickRecordFormat(() => false), null);
});

test('recordFileName: local timestamp, zero-padded, given extension', () => {
  assert.equal(recordFileName(new Date(2026, 9, 9, 7, 5, 3), 'mp4'), 'rhyflitzer-20261009-070503.mp4');
  assert.equal(recordFileName(new Date(2026, 11, 31, 23, 59, 59), 'webm'), 'rhyflitzer-20261231-235959.webm');
});

test('recordBitrate: 12 Mbit/s up to 1080p, 20 above', () => {
  assert.equal(recordBitrate(1920, 1080), 12_000_000);
  assert.equal(recordBitrate(2560, 1230), 20_000_000);
});

test('recordKeyAction: Backquote only, no modifiers, held key ignored', () => {
  assert.equal(recordKeyAction({ code: 'Backquote', repeat: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }), 'toggle');
  assert.equal(recordKeyAction({ code: 'Backquote', repeat: true, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }), 'ignore');
  assert.equal(recordKeyAction({ code: 'Backquote', repeat: false, shiftKey: true, ctrlKey: false, altKey: false, metaKey: false }), null);
  assert.equal(recordKeyAction({ code: 'Backquote', repeat: false, shiftKey: false, ctrlKey: true, altKey: false, metaKey: false }), null);
  assert.equal(recordKeyAction({ code: 'KeyX', repeat: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }), null);
  assert.equal(RECORD_KEY, 'Backquote');
});

test('recordNext: the state machine, invalid events change nothing', () => {
  assert.equal(recordNext('idle', 'start'), 'recording');
  assert.equal(recordNext('recording', 'pause'), 'paused');
  assert.equal(recordNext('paused', 'resume'), 'recording');
  assert.equal(recordNext('paused', 'stop'), 'stopping');
  assert.equal(recordNext('stopping', 'stopped'), 'idle');
  assert.equal(recordNext('recording', 'fail'), 'idle');
  assert.equal(recordNext('idle', 'stop'), 'idle');
  assert.equal(recordNext('idle', 'pause'), 'idle');
  assert.equal(recordNext('recording', 'resume'), 'recording');
  assert.equal(recordNext('idle', 'started'), 'idle');
});

test('recordElapsed: paused time does not count', () => {
  assert.equal(recordElapsed({ startedAt: 1000, pausedAt: null, pausedTotal: 2000 }, 8000), 5);
  assert.equal(recordElapsed({ startedAt: 1000, pausedAt: 4000, pausedTotal: 0 }, 9000), 3);
});

test('formatClock: m:ss', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(65), '1:05');
  assert.equal(formatClock(3600), '60:00');
});

test('MAX_SECONDS: 10 minutes', () => {
  assert.equal(MAX_SECONDS, 600);
});

test('pickRecordFormat: H.264 + Opus in mp4 before AAC -- the AAC encoder start drops the music (#891)', () => {
  assert.equal(FORMATS[0], 'video/mp4;codecs=avc1,opus');
  assert.ok(FORMATS.indexOf('video/mp4;codecs=avc1,opus') < FORMATS.indexOf('video/mp4;codecs=avc1,mp4a.40.2'));
  const chrome = new Set(['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus']);
  assert.deepEqual(pickRecordFormat(m => chrome.has(m)), { mime: 'video/mp4;codecs=avc1,opus', ext: 'mp4' });
  const noOpusInMp4 = new Set(['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']);
  assert.deepEqual(pickRecordFormat(m => noOpusInMp4.has(m)), { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' });
});