// #538: what the game tells Umami (self-hosted, stats.freaxnx01.ch). Never breaks the game: blocked, offline or missing umami = silent no-op.
// Coarse by design: ids of public things (vehicle, mode, region, house, landmark label), times rounded to 5 s. Never a position, the world id, the query string or anything typed.
import { takeReferrer } from './legacy.js';
export const MAX_TEXT =60, STEP_S = 5, SETTLE_MS = 2000, MAX_QUEUE = 50, MAX_CHANGES = 200;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'], OUTCOMES = ['finished', 'timeup', 'abandoned'];

const text = (v) => String(v ?? '').trim().slice(0, MAX_TEXT);

// g.js is a deferred classic script and the game a deferred module that runs first: events wait here until umami exists.
// settle() (window load) flushes them if it is there and drops them if not; after that a missing umami is a plain no-op.
export function createTracker({ getUmami = () => globalThis.umami, maxQueue = MAX_QUEUE } = {}) {
  const queue = []; let settled = false;
  const live = () => { const u = getUmami(); return u && typeof u.track === 'function' ? u : null; };
  const deliver = (u, [method, args]) => { try { if (typeof u[method] === 'function') u[method](...args); } catch (e) { /* analytics must never break the game */ } };
  const drain = (u) => { for (const call of queue.splice(0)) deliver(u, call); };
  function send(method, args) {
    try {
      const u = live();
      if (u) { drain(u); deliver(u, [method, args]); } else if (!settled && queue.length < maxQueue) queue.push([method, args]);
    } catch (e) { /* see above */ }
  }
  function settle() {
    settled = true;
    try { const u = live(); if (u) drain(u); else queue.length = 0; } catch (e) { /* see above */ }
  }
  return { track: (...args) => send('track', args), identify: (data) => send('identify', [data]), settle };
}

// Path plus the three campaign tags only: ?world= (a share link maps to a person), ?vehicle=, ?dev= never leave the page.
export function pageUrl(loc) {
  const from = new URLSearchParams(loc.search ?? ''), keep = new URLSearchParams();
  for (const key of UTM_KEYS) { const value = text(from.get(key)); if (value) keep.set(key, value); }
  const query = keep.toString();
  return `${loc.pathname}${query ? `?${query}` : ''}`;
}
// #663: an old /prototype/ link arrives via a redirect; legacy.js keeps its real external referrer for this one pageview.
export const pageviewProps = (props) => ({ ...props, url: pageUrl(globalThis.location), referrer: takeReferrer(globalThis.sessionStorage) || props.referrer });
// The campaign tag sits on the pageview only; events after it carry none. Stored as session data (umami.identify) so a
// segment on the session property `source` also shows the events of those visitors, e.g. readers of the NFZ article.
export const campaignSource = (search) => text(new URLSearchParams(search ?? '').get('utm_source'));

const shared = createTracker();
export const track = shared.track, settle = shared.settle;
export const trackPageview = () => track(pageviewProps);   // Umami's callback form; auto-tracking is off in index.html
export const identifySource = () => { const source = campaignSource(globalThis.location?.search); if (source) shared.identify({ source }); };   // never an `id` key: that would set a distinct id

export const roundSeconds = (t, step = STEP_S) => (Number.isFinite(t) && t >= 0 ? Math.round(t / step) * step : 0);
export const regionId = (region) => (region?.generated ? 'world' : text(region?.id) || 'unknown');   // a generated world's id is never sent

export function vehicleSource(search, stored, ids) {
  const match = /[?&]vehicle=([^&]*)/.exec(search ?? '');
  if (match && ids.includes(match[1])) return 'query';
  return stored ? 'stored' : 'default';
}
export const vehicleData = (value, previous) => ({ vehicle: text(value), previous: text(previous) || 'none' });
export const jumpData = (name) => ({ target: text(name) || 'unknown' });

// how the player moves right now; a building carries its id after the colon
export function activityOf({ train, level, indoors, house, foot, fly }) {
  if (train) return 'train';
  if (level && level !== 'surface') return 'hideout';
  if (indoors) return `building:${text(house)}`;
  if (foot) return 'foot';
  if (fly) return 'heli';
  return 'car';
}
export function activityData(value, previous) {
  const [kind, place] = String(value).split(':'), [from] = String(previous ?? 'car').split(':');
  return place ? { activity: kind, from, place: text(place) } : { activity: kind, from };
}

// generic over the MODES list of startscreen.js: a mode added there (Cruising, #551) is counted with no change here
export const modeData = (mode, modes, previous) => ({ mode: modes.includes(mode) ? mode : 'unknown', previous: modes.includes(previous) ? previous : 'none' });
export const modeEndData = ({ mode, outcome, seconds }, modes) => ({ mode: modes.includes(mode) ? mode : 'unknown', outcome: OUTCOMES.includes(outcome) ? outcome : 'unknown', seconds: roundSeconds(seconds) });

// Driven by the caller's clock (no timers): a value that holds for settleMs and differs from the last sent one is sent once.
export function createChangeReporter({ send = track, name, initial = null, settleMs = SETTLE_MS, max = MAX_CHANGES, shape = (value, previous) => ({ value, previous }) } = {}) {
  let sent = initial, pending = null, count = 0;
  function emit(value) {
    if (count >= max) return;
    count++; const previous = sent; sent = value; send(name, shape(value, previous));
  }
  function update(value, nowMs) {
    if (value === sent) { pending = null; return; }
    if (!pending || pending.value !== value) pending = { value, since: nowMs };
    if (nowMs - pending.since >= settleMs) { const { value: v } = pending; pending = null; emit(v); }
  }
  function flush() {
    if (!pending) return;
    const { value } = pending; pending = null; emit(value);
  }
  return { update, flush };
}
