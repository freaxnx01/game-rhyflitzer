// #735: the car radio's pure rules -- keys, playlist, volume, stored values, the SRF 3 watchdog, the display text
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SRF3_URL, STATIONS, TRACKS, MENU_TRACK, VOLUME, RADIO_KEYS, radioKeyAction, nextTrack, prevTrack, stepVolume, trackGain, menuGain,
  radioOnFrom, menuMusicOnFrom, stationFrom, volumeFrom, srfVerdict, displayFor } from '../radio.js';

const key = (code, o = {}) => ({ code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...o });

test('SRF3_URL_IsTheHttpsStream_NotTheShortLink', () => {
  assert.equal(SRF3_URL, 'https://stream.srg-ssr.ch/srgssr/srf3/mp3/128');
  assert.deepEqual(STATIONS, ['fm', 'srf3']);
});

test('TRACKS_AreTheFourCommittedFiles_WithLicences', () => {
  assert.deepEqual(TRACKS.map(t => t.id), ['cool-rider', 'neon-afterglow', 'california-snares-and-synths', 'menu-running-title']);
  for (const t of TRACKS) {
    assert.equal(t.src, `assets/music/${t.id}.mp3`);
    assert.ok(existsSync(new URL(`../${t.src}`, import.meta.url)), t.src);
    assert.ok(existsSync(new URL(`../assets/music/${t.id}.LICENSE.md`, import.meta.url)), t.id);
  }
  assert.equal(MENU_TRACK.id, 'menu-running-title');
  assert.equal(MENU_TRACK.artist, 'Rob Bery');
});

test('radioKeyAction_Digits5To0_AreTheRadioBank', () => {
  assert.deepEqual(RADIO_KEYS.map(c => radioKeyAction(key(c))), ['power', 'station', 'prev', 'next', 'down', 'up']);
  assert.deepEqual(RADIO_KEYS, ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
});

test('radioKeyAction_WithAModifier_IsNull', () => {
  for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) assert.equal(radioKeyAction(key('Digit0', { [m]: true })), null, m);
});

test('radioKeyAction_OtherKeys_AreNull', () => {
  for (const c of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyM', 'Numpad5']) assert.equal(radioKeyAction(key(c)), null, c);
});

test('radioKeyAction_Repeat_OnlyVolumeRepeats', () => {
  assert.equal(radioKeyAction(key('Digit9', { repeat: true })), 'down');
  assert.equal(radioKeyAction(key('Digit0', { repeat: true })), 'up');
  for (const c of ['Digit5', 'Digit6', 'Digit7', 'Digit8']) assert.equal(radioKeyAction(key(c, { repeat: true })), 'ignore', c);
});

test('nextTrack_prevTrack_Wrap', () => {
  assert.equal(nextTrack(0), 1);
  assert.equal(nextTrack(3), 0);
  assert.equal(prevTrack(0), 3);
  assert.equal(prevTrack(2), 1);
});

test('stepVolume_ClampsTo0And10', () => {
  assert.equal(stepVolume(6, 1), 7);
  assert.equal(stepVolume(10, 1), 10);
  assert.equal(stepVolume(0, -1), 0);
});

test('trackGain_ZeroAtZero_RisesWithVolume_HonoursGainDb', () => {
  assert.equal(trackGain(0), 0);
  assert.ok(trackGain(10) > trackGain(6) && trackGain(6) > trackGain(3));
  assert.ok(Math.abs(trackGain(10, -6) / trackGain(10) - 10 ** (-6 / 20)) < 1e-9);
  assert.ok(trackGain(10) <= 1);
});

test('menuGain_IsQuieterThanTheRadio', () => {
  assert.ok(menuGain(6) > 0 && menuGain(6) < 0.5 * trackGain(6));
});

test('storedValues_FallBackToDefaults', () => {
  assert.equal(radioOnFrom(null), true);
  assert.equal(radioOnFrom('0'), false);
  assert.equal(menuMusicOnFrom(null), true);
  assert.equal(menuMusicOnFrom('0'), false);
  assert.equal(stationFrom('srf3'), 'srf3');
  for (const bad of [null, '', 'radio1', 'SRF3']) assert.equal(stationFrom(bad), 'fm', String(bad));
  assert.equal(volumeFrom('3'), 3);
  assert.equal(volumeFrom('0'), 0);
  for (const bad of [null, '', '11', '-1', '2.5', 'loud']) assert.equal(volumeFrom(bad), VOLUME.start, String(bad));
});

test('srfVerdict_StartWatchdog', () => {
  const w = { since: 100, playing: false, waitingSince: null, error: false };
  assert.equal(srfVerdict(w, 105), 'wait');
  assert.equal(srfVerdict(w, 108.5), 'fail');
  assert.equal(srfVerdict({ ...w, error: true }, 100.1), 'fail');
  assert.equal(srfVerdict({ ...w, playing: true }, 200), 'ok');
});

test('srfVerdict_StallAfterStart_FailsAfter10S', () => {
  const w = { since: 100, playing: true, waitingSince: 150, error: false };
  assert.equal(srfVerdict(w, 159), 'ok');
  assert.equal(srfVerdict(w, 160.5), 'fail');
});

test('displayFor_OffSrfAndTrack', () => {
  assert.deepEqual(displayFor({ on: false, station: 'fm', track: 0 }), { key: 'radioOff', args: [] });
  assert.deepEqual(displayFor({ on: true, station: 'srf3', track: 2 }), { key: 'radioStationSrf', args: [] });
  assert.deepEqual(displayFor({ on: true, station: 'fm', track: 1 }), { key: 'radioTrack', args: ['Neon Afterglow', 'MemoryArcade'] });
});
