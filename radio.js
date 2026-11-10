// radio.js (#735): the car radio (Rhyflitzer FM, SRF 3 live) and the start screen's menu music.
// Pure: no DOM, no audio -- node --test imports it; the RADIO IIFE in index.html plays what these rules say.

// NOT the short https://stream.srg-ssr.ch/m/drs3/mp3_128: it redirects to plain http://, blocked as mixed content
export const SRF3_URL = 'https://stream.srg-ssr.ch/srgssr/srf3/mp3/128';
export const STATIONS = Object.freeze(['fm', 'srf3']);
// the six tracks without Content ID; licences in assets/music/<id>.LICENSE.md. gainDb evens out the levels
// (ffmpeg volumedetect 2026-11-09: Cool Rider -10.1 dB mean, the others about -16 dB; the soft-rock pair,
// 2026-11-10, is -15.2 and -13.9 LUFS, level with the 0 dB tracks)
export const TRACKS = Object.freeze([
  { id: 'cool-rider', title: 'Cool Rider', artist: 'Emmraan', src: 'assets/music/cool-rider.mp3', gainDb: -6 },
  { id: 'neon-afterglow', title: 'Neon Afterglow', artist: 'MemoryArcade', src: 'assets/music/neon-afterglow.mp3', gainDb: 0 },
  { id: 'california-snares-and-synths', title: 'California Snares and Synths', artist: 'Eliza_music', src: 'assets/music/california-snares-and-synths.mp3', gainDb: 0 },
  { id: 'menu-running-title', title: 'Menu / Running Title', artist: 'Rob Bery', src: 'assets/music/menu-running-title.mp3', gainDb: 0 },
  { id: 'soft-rock-groove', title: 'The 1980s Soft Rock Groove', artist: 'Michael-Vault', src: 'assets/music/soft-rock-groove.mp3', gainDb: 0 },
  { id: 'melrose-place-soft-rock', title: 'Melrose Place Soft Rock', artist: 'DigiCompo', src: 'assets/music/melrose-place-soft-rock.mp3', gainDb: 0 },
]);
export const MENU_TRACK = TRACKS[3];
export const VOLUME = Object.freeze({ min: 0, max: 10, start: 6 });
const RADIO_BASE = 0.8, MENU_SHARE = 0.35;   // full volume into the SFX master; the menu music plays at 35 % of the radio
export const SRF_TIMEOUT = Object.freeze({ start: 8, stall: 10 });   // seconds without 'playing' after play(), and in 'waiting'/'stalled'
export const RADIO_SHOW_S = 3;   // the radio display in #toast
export const RADIO_STORE = Object.freeze({ on: 'mm.radio', station: 'mm.radioStation', vol: 'mm.radioVol', menu: 'mm.menuMusic' });

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
export const stepVolume = (vol, step) => Math.max(VOLUME.min, Math.min(VOLUME.max, vol + step));

// a square law, so the low steps stay usable
export const trackGain = (vol, gainDb = 0) => RADIO_BASE * (vol / VOLUME.max) ** 2 * 10 ** (gainDb / 20);
export const menuGain = (vol) => MENU_SHARE * trackGain(vol, MENU_TRACK.gainDb);

export const radioOnFrom = (stored) => stored !== '0';
export const menuMusicOnFrom = (stored) => stored !== '0';
export const stationFrom = (stored) => (STATIONS.includes(stored) ? stored : 'fm');
export function volumeFrom(stored) {
  if (stored === null || stored === undefined || stored === '') return VOLUME.start;
  const n = Number(stored);
  return Number.isInteger(n) && n >= VOLUME.min && n <= VOLUME.max ? n : VOLUME.start;
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
  if (s.station === 'srf3') return { key: 'radioStationSrf', args: [] };
  const t = TRACKS[s.track];
  return { key: 'radioTrack', args: [t.title, t.artist] };
}
