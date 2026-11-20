// #735: the car radio's pure rules -- keys, playlist, volume, stored values, the SRF 3 watchdog, the display text
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SRF3_URL, ARGOVIA_URL, STATIONS, LIVE, FM, isFm, stationOrder, nextStation, TRACKS, MENU_TRACK, VOLUME, RADIO_KEYS, radioKeyAction, RADIO_STORE, nextTrack, prevTrack, shuffleOnFrom, playlistOrder, stepVolume, trackGain, menuGain,
  radioOnFrom, menuMusicOnFrom, stationFrom, volumeFrom, srfVerdict, displayFor, stationName, createEarlyMenu, EARLY_GESTURES } from '../radio.js';

const key = (code, o = {}) => ({ code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...o });

test('SRF3_URL_IsTheHttpsStream_NotTheShortLink', () => {
  assert.equal(SRF3_URL, 'https://stream.srg-ssr.ch/srgssr/srf3/mp3/128');
  assert.deepEqual(STATIONS, ['mix', 'rock', 'cruise', 'srf3', 'argovia']);
});

test('TRACKS_AreTheEighteenCommittedFiles_WithLicences', () => {
  assert.deepEqual(TRACKS.map(t => t.id), ['cool-rider', 'neon-afterglow', 'california-snares-and-synths', 'menu-running-title',
    'soft-rock-groove', 'melrose-place-soft-rock', 'gritty-riffing',
    'fuzz-riff-breakdown', 'pulsing-arpeggio', 'pulsing-arpeggio-take-2', 'rising-tension', 'open-road', 'night-drive',
    'hurricane-bloom', 'celtic-jig-of-iron', 'stadium-scale', 'unison-riff', 'motores-relentless']);
  for (const t of TRACKS) {
    assert.equal(t.src, `assets/music/${t.id}.mp3`);
    assert.ok(existsSync(new URL(`../${t.src}`, import.meta.url)), t.src);
    assert.ok(existsSync(new URL(`../assets/music/${t.id}.LICENSE.md`, import.meta.url)), t.id);
  }
  assert.equal(MENU_TRACK.id, 'pulsing-arpeggio');
  assert.equal(MENU_TRACK.artist, 'freaxnx01');
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
  assert.equal(nextTrack(3), 4);   // the soft-rock pair follows the menu track
  assert.equal(nextTrack(TRACKS.length - 1), 0);
  assert.equal(prevTrack(0), TRACKS.length - 1);
  assert.equal(prevTrack(2), 1);
});

test('shuffleOnFrom_OnUnlessStoredOff', () => {
  assert.equal(shuffleOnFrom(null), true);   // the default: random order
  assert.equal(shuffleOnFrom('1'), true);
  assert.equal(shuffleOnFrom('0'), false);
  assert.equal(RADIO_STORE.shuffle, 'mm.radioShuffle');
});

test('playlistOrder_ShuffleOff_IsTheListOrder', () => {
  assert.deepEqual(playlistOrder(false, 5, 0), [0, 1, 2, 3, 4]);
});

test('playlistOrder_ShuffleOn_IsAPermutationStartingAtFirst', () => {
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const first of [0, 3, 6]) {
    const o = playlistOrder(true, 7, first, rand);
    assert.equal(o[0], first);
    assert.deepEqual([...o].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
  }
  const orders = new Set(Array.from({ length: 20 }, () => playlistOrder(true, 7, 0, rand).join()));
  assert.ok(orders.size > 1, 'the order is random, not fixed');
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
  assert.equal(stationFrom('argovia'), 'argovia');
  assert.equal(stationFrom('rock'), 'rock');
  assert.equal(stationFrom('fm'), 'mix');   // #1016: the one Rhyflitzer FM of before is the mix now
  for (const bad of [null, '', 'radio1', 'SRF3', 'Argovia']) assert.equal(stationFrom(bad), 'mix', String(bad));
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

test('stationName_FmByName_LiveByString', () => {
  const tr = (k) => `<${k}>`;
  assert.deepEqual(STATIONS.map(s => stationName(s, tr)),
    ['Rhyflitzer FM Mix', 'Rhyflitzer FM Rock', 'Rhyflitzer FM Cruise', '<radioStationSrf>', '<radioStationArgovia>']);
});

test('displayFor_OffSrfAndTrack', () => {
  assert.deepEqual(displayFor({ on: false, station: 'mix', track: 0 }), { key: 'radioOff', args: [] });
  assert.deepEqual(displayFor({ on: true, station: 'srf3', track: 2 }), { key: 'radioStationSrf', args: [] });
  assert.deepEqual(displayFor({ on: true, station: 'mix', track: 1 }), { key: 'radioFmTrack', args: ['Rhyflitzer FM Mix', 'Neon Afterglow', 'MemoryArcade'] });
  assert.deepEqual(displayFor({ on: true, station: 'rock', track: 0 }), { key: 'radioFmTrack', args: ['Rhyflitzer FM Rock', 'Cool Rider', 'Emmraan'] });
});

test('ARGOVIA_URL_IsTheProbedHttpsStream', () => {
  assert.equal(ARGOVIA_URL, 'https://stream.streambase.ch/argovia/mp3-192/direct/');
  assert.equal(LIVE.argovia.url, ARGOVIA_URL);
  assert.equal(LIVE.srf3.url, SRF3_URL);
});

test('LIVE_HasExactlyTheLiveStations_WithStringKeys', () => {
  assert.deepEqual(Object.keys(LIVE), STATIONS.filter(s => !isFm(s)));
  for (const l of Object.values(LIVE)) assert.ok(l.url.startsWith('https://') && l.nameKey && l.failKey);
});

test('nextStation_CyclesMixRockCruiseSrf3ArgoviaMix', () => {
  assert.equal(nextStation('mix'), 'rock');
  assert.equal(nextStation('rock'), 'cruise');
  assert.equal(nextStation('cruise'), 'srf3');
  assert.equal(nextStation('srf3'), 'argovia');
  assert.equal(nextStation('argovia'), 'mix');
});

const ids = (station) => FM[station].tracks.map(i => TRACKS[i].id);

test('FM_RockAndCruise_SplitTheTracks_MixHasThemAll', () => {
  assert.deepEqual(Object.keys(FM), ['mix', 'rock', 'cruise']);
  assert.deepEqual(ids('rock'), ['cool-rider', 'gritty-riffing', 'fuzz-riff-breakdown', 'pulsing-arpeggio', 'pulsing-arpeggio-take-2', 'rising-tension',
    'hurricane-bloom', 'celtic-jig-of-iron', 'stadium-scale', 'unison-riff', 'motores-relentless']);
  assert.deepEqual(ids('cruise'), ['neon-afterglow', 'california-snares-and-synths', 'menu-running-title', 'soft-rock-groove', 'melrose-place-soft-rock',
    'open-road', 'night-drive']);
  assert.deepEqual(FM.mix.tracks, TRACKS.map((_, i) => i));
  assert.equal(FM.rock.tracks.length + FM.cruise.tracks.length, TRACKS.length);
  assert.deepEqual(Object.values(FM).map(f => f.name), ['Rhyflitzer FM Mix', 'Rhyflitzer FM Rock', 'Rhyflitzer FM Cruise']);
  for (const s of STATIONS) assert.equal(isFm(s), s in FM, s);
});

test('stationOrder_ShuffleOff_IsTheStationList', () => {
  assert.deepEqual(stationOrder('rock', false, FM.rock.tracks[0]), FM.rock.tracks);
});

test('stationOrder_ShuffleOn_StaysInTheStation_StartsAtFirst', () => {
  let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const first = FM.cruise.tracks[4], o = stationOrder('cruise', true, first, rand);
  assert.equal(o[0], first);
  assert.deepEqual([...o].sort((a, b) => a - b), [...FM.cruise.tracks].sort((a, b) => a - b));
});

test('stationFrom_AStoredArgovia_Survives', () => {
  assert.equal(stationFrom('argovia'), 'argovia');
  assert.equal(stationFrom('Argovia'), 'mix');
});

test('displayFor_Argovia_IsTheStationString', () => {
  assert.deepEqual(displayFor({ on: true, station: 'argovia', track: 0 }), { key: 'radioStationArgovia', args: [] });
});

// #841: the menu music's early start, before RADIO and the SFX graph exist. Audio and target are injected, so these run under node.
const fakeEl = () => ({ plays: 0, paused: false, rejects: false, play() { this.plays++; return this.rejects ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }, pause() { this.paused = true; } });
const fakeTarget = () => { const l = {}; return { l, addEventListener(t, f) { (l[t] ||= []).push(f); }, removeEventListener(t, f) { l[t] = (l[t] || []).filter(x => x !== f); }, fire(t) { (l[t] || []).slice().forEach(f => f()); } }; };

test('createEarlyMenu_MusicOff_MakesNothing', () => {
  const t = fakeTarget(); let made = 0;
  const e = createEarlyMenu({ menuOn: false, vol: 6, makeAudio: () => { made++; return fakeEl(); }, target: t });
  assert.equal(made, 0); assert.equal(e.take(), null); assert.equal(e.gestured(), false);
  assert.deepEqual(Object.keys(t.l), []);
});
test('createEarlyMenu_On_SetsUpTheMenuTrackAndTriesToPlayAtOnce', () => {
  const el = fakeEl();
  createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: fakeTarget() });
  assert.equal(el.src, MENU_TRACK.src); assert.equal(el.loop, true); assert.equal(el.preload, 'none');
  assert.equal(el.volume, Math.min(1, menuGain(6))); assert.equal(el.plays, 1);
});
test('createEarlyMenu_RefusedPlay_DoesNotThrowAndAGestureRetries', async () => {
  const el = fakeEl(), t = fakeTarget(); el.rejects = true;
  const e = createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: t });
  assert.equal(e.gestured(), false);
  for (const g of EARLY_GESTURES) assert.ok(t.l[g].length === 1, g);
  t.fire('keydown'); await Promise.resolve();
  assert.equal(el.plays, 2); assert.equal(e.gestured(), true);
});
test('createEarlyMenu_Take_HandsOverOnceAndStopsListening', () => {
  const el = fakeEl(), t = fakeTarget();
  const e = createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: t });
  assert.equal(e.take(), el); assert.equal(el.volume, 1); assert.equal(e.take(), null);
  t.fire('keydown'); assert.equal(el.plays, 1);
  for (const g of EARLY_GESTURES) assert.equal((t.l[g] || []).length, 0, g);
});
test('createEarlyMenu_Drop_PausesAnUntakenElement', () => {
  const el = fakeEl();
  const e = createEarlyMenu({ menuOn: true, vol: 6, makeAudio: () => el, target: fakeTarget() });
  e.drop(); assert.equal(el.paused, true); assert.equal(e.take(), null);
});
