// #169: the editor's side of the build API (phase 3, #168) and the swisstopo/geo.admin endpoints. Pure: node --test imports it.
// API_BASE is the game's WORLD_HOST (#167, worlds.js): the ONE place that knows the host, shared with the game.
import { formatBbox } from './geo.js';
import { WORLD_HOST, isWorldId } from '../worlds.js';

export { isWorldId };
export const API_BASE = WORLD_HOST;
export const GAME_URL = 'https://rhyflitzer.freaxnx01.ch/';
export const WMTS_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
export const WMTS_ATTRIBUTION = '© <a href="https://www.swisstopo.admin.ch/">swisstopo</a>';   // Leaflet's attribution control, own constant
export const STATUSES = ['queued', 'cutting', 'terrain', 'world', 'race', 'done', 'failed', 'expired'];   // the page's view of #168's state + step
export const STEPS = STATUSES.slice(0, 6);

function checkId(id) { if (!isWorldId(id)) throw new Error(`bad world id: ${String(id)}`); return id; }

export const jobsUrl = () => `${API_BASE}/api/jobs`;
export const challengeUrl = () => `${API_BASE}/api/challenge`;   // ALTCHA, requested only when Build is pressed
export const jobUrl = (id) => `${API_BASE}/api/jobs/${checkId(id)}`;   // progress: {state, step, position?, error, message, lv95}; /api/worlds/<id> is #167's tombstone
export const fileUrl = (id, name) => `${API_BASE}/worlds/${checkId(id)}/${name}`;   // world.json, terrain.mmh, meta.json; #168 has no zip route
export const metaUrl = (id) => fileUrl(id, 'meta.json');   // {name, race} for the done card
export const previewUrl = (rect) => `${API_BASE}/api/preview?bbox=${formatBbox(rect)}`;
export const shareUrl = (id) => `${GAME_URL}?world=${checkId(id)}`;
export const driveUrl = (id) => `../?world=${checkId(id)}`;

export function identifyUrl([E, N], year) {
  const u = new URL('https://api3.geo.admin.ch/rest/services/api/MapServer/identify');
  u.search = new URLSearchParams({ geometry: `${Math.round(E)},${Math.round(N)}`, geometryType: 'esriGeometryPoint', sr: '2056', tolerance: '0',
    layers: 'all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill', returnGeometry: 'false', timeInstant: String(year) }).toString();
  return u.toString();
}

const str = (v) => (typeof v === 'string' ? v : null);

// #168's preview: {id, exists, name, gemeinden, raceOk, reason?}; raceOk null = no road index yet; exists = built or queued, so no human check
// is needed. Wrong types become null / false / [], never rendered; `exists` needs a valid id. `gemeinden`: only strings survive (#197).
export const parsePreview = (json) => ({ name: str(json && json.name), raceOk: json && typeof json.raceOk === 'boolean' ? json.raceOk : null,
  id: json && isWorldId(json.id) ? json.id : null, exists: !!json && json.exists === true && isWorldId(json.id),
  gemeinden: json && Array.isArray(json.gemeinden) ? json.gemeinden.filter((g) => typeof g === 'string') : [] });

const BUILDING = new Map([['cutting', 'cutting'], ['terrain', 'terrain'], ['world', 'world'], ['places', 'race'], ['done', 'race']]);   // #168 step -> page status (the build never emits 'race')
const STATE = new Map([['queued', 'queued'], ['ready', 'done'], ['failed', 'failed'], ['expired', 'expired']]);

export class JobFormatError extends Error {}

// #168's job view {id, state, step, position?, error, message, lv95, files?} -> the page's status; throws on an unknown state.
export function parseJob(json) {
  if (!json || typeof json !== 'object') throw new JobFormatError('bad job: not an object');
  if (!isWorldId(json.id)) throw new JobFormatError('bad job: id');
  const status = json.state === 'building' ? (BUILDING.get(json.step) || 'cutting') : STATE.get(json.state);
  if (!status) throw new JobFormatError(`bad job: state ${String(json.state)}`);
  return { id: json.id, status, position: Number.isInteger(json.position) ? json.position : null, reason: str(json.error) };
}

// meta.json of a built world: the final name (A · B across a border) and whether it has a race (false: free driving only).
export const parseMeta = (json) => ({ name: str(json && json.name), race: json && typeof json.race === 'boolean' ? json.race : null });

export function errorKey(httpStatus, body) {   // #168 answers {error: "<code>", message}
  const code = body && typeof body.error === 'string' ? body.error : '';
  if (httpStatus === 400) return code === 'outside-ch' ? 'errOutsideCh' : 'errBadFrame';   // too-big, too-small, bad-bbox, bad-request (413 too-large falls to errServer)
  if (httpStatus === 403) return 'errHuman';   // human_check_failed
  if (httpStatus === 429) return code === 'one-at-a-time' ? 'errOneAtATime' : code === 'server-daily-limit' ? 'errServerDaily' : 'errRateLimit';   // daily-limit
  if (httpStatus === 503 && code === 'busy') return 'errBusy';   // human-check-unavailable is a server problem, not "busy"
  return 'errServer';
}

export function failKey(reason) {   // a failed job's error: build.py classify() gives too-complex, source-unreachable, build-failed, or a frame code
  if (reason === 'outside-ch') return 'errOutsideCh';
  if (reason === 'too-big' || reason === 'too-small' || reason === 'bad-bbox') return 'errBadFrame';
  if (reason === 'too-complex') return 'errTooComplex';
  if (reason === 'source-unreachable') return 'errSource';
  if (reason === 'expired') return 'errExpired';
  return 'errBuildFailed';
}

export const pollDelay = (elapsedMs) => (elapsedMs < 60000 ? 2000 : 5000);

export function gemeindeName(json) {
  const rows = json && Array.isArray(json.results) ? json.results : [];
  const hit = rows.find((r) => r && r.attributes && r.attributes.is_current_jahr) || rows[0];
  return hit && hit.attributes ? str(hit.attributes.gemname) : null;
}
