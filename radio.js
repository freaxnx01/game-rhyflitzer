// radio.js (#735, #845): the car radio (Rhyflitzer FM, SRF 3 live, Radio Argovia) and the start screen's menu music.
// Pure: no DOM, no audio -- node --test imports it; the RADIO IIFE in index.html plays what these rules say.

// NOT the short https://stream.srg-ssr.ch/m/drs3/mp3_128: it redirects to plain http://, blocked as mixed content
export const SRF3_URL = 'https://stream.srg-ssr.ch/srgssr/srf3/mp3/128';
// NOT the short https://stream.streambase.ch/argovia/mp3-192/ -- only this /direct/ URL was probed (302 to chmedia.streamabc.net, CORS * on both hops, 2026-11-10)
export const ARGOVIA_URL = 'https://stream.streambase.ch/argovia/mp3-192/direct/';
export const STATIONS = Object.freeze(['mix', 'rock', 'cruise', 'srf3', 'argovia']);   // key 6 cycles them; the first three are Rhyflitzer FM (#1016)
// the live stations: stream, the strings.js key of the radio display, the key of the "not reachable" toast. The FM stations are not live
export const LIVE = Object.freeze({
  srf3: Object.freeze({ url: SRF3_URL, nameKey: 'radioStationSrf', failKey: 'radioSrfFail' }),
  argovia: Object.freeze({ url: ARGOVIA_URL, nameKey: 'radioStationArgovia', failKey: 'radioArgoviaFail' }),
});
export const nextStation = (s) => STATIONS[(STATIONS.indexOf(s) + 1) % STATIONS.length];
// the thirteen tracks without Content ID; licences in assets/music/<id>.LICENSE.md. gainDb evens out the levels
// (ffmpeg volumedetect 2026-11-09: Cool Rider -10.1 dB mean, the others about -16 dB; the soft-rock pair,
// 2026-11-10, is -15.2 and -13.9 LUFS, level with the 0 dB tracks; Gritty Riffing, 2026-11-15, is -17.6 dB mean; the six later Suno tracks -16.2 to -18.2 dB)
export const TRACKS = Object.freeze([
  { id: 'cool-rider', title: 'Cool Rider', artist: 'Emmraan', src: 'assets/music/cool-rider.mp3', mood: 'rock', gainDb: -6 },
  { id: 'neon-afterglow', title: 'Neon Afterglow', artist: 'MemoryArcade', src: 'assets/music/neon-afterglow.mp3', mood: 'cruise', gainDb: 0 },
  { id: 'california-snares-and-synths', title: 'California Snares and Synths', artist: 'Eliza_music', src: 'assets/music/california-snares-and-synths.mp3', mood: 'cruise', gainDb: 0 },
  { id: 'menu-running-title', title: 'Menu / Running Title', artist: 'Rob Bery', src: 'assets/music/menu-running-title.mp3', mood: 'cruise', gainDb: 0 },
  { id: 'soft-rock-groove', title: 'The 1980s Soft Rock Groove', artist: 'Michael-Vault', src: 'assets/music/soft-rock-groove.mp3', mood: 'cruise', gainDb: 0 },
  { id: 'melrose-place-soft-rock', title: 'Melrose Place Soft Rock', artist: 'DigiCompo', src: 'assets/music/melrose-place-soft-rock.mp3', mood: 'cruise', gainDb: 0 },
  { id: 'gritty-riffing', title: 'Gritty Riffing', artist: 'freaxnx01', src: 'assets/music/gritty-riffing.mp3', mood: 'rock', gainDb: 0 },
  { id: 'fuzz-riff-breakdown', title: 'Fuzz Riff Breakdown', artist: 'freaxnx01', src: 'assets/music/fuzz-riff-breakdown.mp3', mood: 'rock', gainDb: 0 },
  { id: 'pulsing-arpeggio', title: 'Pulsing Arpeggio', artist: 'freaxnx01', src: 'assets/music/pulsing-arpeggio.mp3', mood: 'rock', gainDb: 0 },
  { id: 'pulsing-arpeggio-take-2', title: 'Pulsing Arpeggio (Take 2)', artist: 'freaxnx01', src: 'assets/music/pulsing-arpeggio-take-2.mp3', mood: 'rock', gainDb: 0 },
  { id: 'rising-tension', title: 'Rising Tension', artist: 'freaxnx01', src: 'assets/music/rising-tension.mp3', mood: 'rock', gainDb: 0 },
  { id: 'open-road', title: 'Open Road', artist: 'freaxnx01', src: 'assets/music/open-road.mp3', mood: 'cruise', gainDb: 0 },
  { id: 'night-drive', title: 'Night Drive', artist: 'freaxnx01', src: 'assets/music/night-drive.mp3', mood: 'cruise', gainDb: 0 },
]);
export const MENU_TRACK = TRACKS.find(t => t.id === 'pulsing-arpeggio');   // title and menu music; it also stays on FM Rock
// #1016 / #1023: the Rhyflitzer FM stations -- TRACKS indices by mood; the mix plays them all. The names are the same in en and de
const moodTracks = (mood) => Object.freeze(TRACKS.flatMap((t, i) => (t.mood === mood ? [i] : [])));
export const FM = Object.freeze({
  mix: Object.freeze({ name: 'Rhyflitzer FM Mix', tracks: Object.freeze(TRACKS.map((_, i) => i)) }),
  rock: Object.freeze({ name: 'Rhyflitzer FM Rock', tracks: moodTracks('rock') }),
  cruise: Object.freeze({ name: 'Rhyflitzer FM Cruise', tracks: moodTracks('cruise') }),
});
export const isFm = (station) => Object.hasOwn(FM, station);
export const VOLUME = Object.freeze({ min: 0, max: 10, start: 6 });
const RADIO_BASE = 0.8, MENU_SHARE = 0.35;   // full volume into the SFX master; the menu music plays at 35 % of the radio
export const SRF_TIMEOUT = Object.freeze({ start: 8, stall: 10 });   // seconds without 'playing' after play(), and in 'waiting'/'stalled'
export const RADIO_SHOW_S = 3;   // the radio display in #toast
export const RADIO_STORE = Object.freeze({ on: 'mm.radio', station: 'mm.radioStation', vol: 'mm.radioVol', menu: 'mm.menuMusic', shuffle: 'mm.radioShuffle' });

// the top-row digits 5-0: free in every run context (the lift pads take 0-9 only while open, and run first)
const KEY_ACTIONS = { Digit5: 'power', Digit6: 'station', Digit7: 'prev', Digit8: 'next', Digit9: 'down', Digit0: 'up' };
export const RADIO_KEYS = Object.freeze(Object.keys(KEY_ACTIONS));
const REPEATS = new Set(['down', 'up']);

// e = { code, shiftKey, ctrlKey, altKey, metaKey, repeat } → an action, 'ignore' (a held key, swallowed) or null (not ours).
// A modifier makes it not ours: Shift is the held nitro, and Shift+0 is '=' (minimap zoom) on a Swiss keyboard
export function radioKeyAction(e) {
  const action = KEY_ACTIONS[e.code];
  if (!action || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.repeat && !REPEATS.has(action)) return 'ignore';
  return action;
}

export const nextTrack = (i, n = TRACKS.length) => (i + 1) % n;
export const prevTrack = (i, n = TRACKS.length) => (i - 1 + n) % n;
// Rhyflitzer FM's play order: the list as it is, or (shuffle, the default) a random permutation that starts at first.
// nextTrack / prevTrack walk positions in this order, so 7 goes back to the track that really played before
export function playlistOrder(shuffle, n, first, rand = Math.random) {
  const order = Array.from({ length: n }, (_, i) => i);
  if (!shuffle) return order;
  const rest = order.filter(i => i !== first);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [first, ...rest];
}
// an FM station's play order as TRACKS indices: its list, or (shuffle) a random permutation of it that starts at first
export function stationOrder(station, shuffle, first, rand = Math.random) {
  const tracks = FM[station].tracks;
  return playlistOrder(shuffle, tracks.length, tracks.indexOf(first), rand).map(i => tracks[i]);
}
export const stepVolume = (vol, step) => Math.max(VOLUME.min, Math.min(VOLUME.max, vol + step));

// a square law, so the low steps stay usable
export const trackGain = (vol, gainDb = 0) => RADIO_BASE * (vol / VOLUME.max) ** 2 * 10 ** (gainDb / 20);
export const menuGain = (vol) => MENU_SHARE * trackGain(vol, MENU_TRACK.gainDb);

export const radioOnFrom = (stored) => stored !== '0';
export const menuMusicOnFrom = (stored) => stored !== '0';
export const shuffleOnFrom = (stored) => stored !== '0';
export const stationFrom = (stored) => (STATIONS.includes(stored) ? stored : 'mix');   // also the old single 'fm'
export function volumeFrom(stored) {
  if (stored === null || stored === undefined || stored === '') return VOLUME.start;
  const n = Number(stored);
  return Number.isInteger(n) && n >= VOLUME.min && n <= VOLUME.max ? n : VOLUME.start;
}

// #841: the menu music before the world is built. RADIO and the SFX graph do not exist until loading is far along, so a bare
// element starts here (autoplay tried at once, retried on every gesture) and RADIO adopts it with take(). Pure: audio and target injected.
export const EARLY_GESTURES = Object.freeze(['pointerdown', 'pointerup', 'keydown', 'touchend']);
export function createEarlyMenu({ menuOn, vol, makeAudio, target, src = MENU_TRACK.src }) {
  let el = null, gestured = false, listening = false;
  const tryPlay = () => { if (!el) return; const p = el.play(); if (p && p.catch) p.catch(() => { }); };   // a refused play() stays silent
  const onGesture = () => { gestured = true; tryPlay(); };
  const release = () => { if (listening) { listening = false; for (const g of EARLY_GESTURES) target.removeEventListener(g, onGesture, true); } const e = el; el = null; return e; };   // music off: no element, no listeners, nothing to remove
  if (menuOn) {
    el = makeAudio(); el.preload = 'none'; el.loop = true; el.src = src; el.volume = Math.min(1, menuGain(vol));
    listening = true;
    for (const g of EARLY_GESTURES) target.addEventListener(g, onGesture, { capture: true, passive: true });
    tryPlay();
  }
  return {
    gestured: () => gestured,
    take() { const e = release(); if (e) e.volume = 1; return e; },   // RADIO's gain node sets the level from here on
    drop() { const e = release(); if (e) e.pause(); },
  };
}

// watch = { since: play() asked at (s), playing: 'playing' fired, waitingSince: 'waiting'/'stalled' since (s) or null, error }
export function srfVerdict(watch, now) {
  if (watch.error) return 'fail';
  if (!watch.playing) return now - watch.since > SRF_TIMEOUT.start ? 'fail' : 'wait';
  if (watch.waitingSince !== null && now - watch.waitingSince > SRF_TIMEOUT.stall) return 'fail';
  return 'ok';
}

// the strings.js key and arguments the radio display shows for a state
export function displayFor(s) {
  if (!s.on) return { key: 'radioOff', args: [] };
  if (LIVE[s.station]) return { key: LIVE[s.station].nameKey, args: [] };
  const t = TRACKS[s.track];
  return { key: 'radioFmTrack', args: [FM[s.station].name, t.title, t.artist] };
}
