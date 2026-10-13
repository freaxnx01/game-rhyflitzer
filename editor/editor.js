// #169: the region editor page. State machine edit → submitting → queued/building → done | failed; renders with textContent only.
import { DEFAULT_RECT, parseBbox, formatBbox, sizeKm, centre, lv95ToWgs, corners, rectInside } from './geo.js';
import { WMTS_URL, WMTS_ATTRIBUTION, STEPS } from './api.js';
import { translate } from './strings.js';

const $ = (id) => document.getElementById(id);
const t = (key, ...args) => translate(window.GG_LANG, key, ...args);
const CH_BOUNDS = [[45.6, 5.7], [47.95, 10.6]], OUTLINE_URL = '../pipeline/ch_outline.geojson';

const S = { state: 'loading', rect: parseBbox(location.search) || DEFAULT_RECT, fromUrl: !!parseBbox(location.search), outline: null, inside: null, name: undefined, race: null, exists: false, job: null, errKey: null };

// ---- map ----
const map = L.map('map', { zoomControl: true, attributionControl: true, maxBounds: CH_BOUNDS, maxBoundsViscosity: 0.8, minZoom: 7, maxZoom: 18 });
L.tileLayer(WMTS_URL, { attribution: WMTS_ATTRIBUTION, maxZoom: 18, crossOrigin: false }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);
const toLatLng = ([E, N]) => L.latLng(...lv95ToWgs(E, N));
const poly = L.polygon(corners(S.rect).map(toLatLng), { className: 'frame-poly', interactive: false }).addTo(map);
if (S.fromUrl) map.fitBounds(poly.getBounds().pad(0.6)); else map.fitBounds(CH_BOUNDS);

// ---- rendering ----
function setText(id, text) { $(id).textContent = text; }
function show(id, on) { $(id).hidden = !on; }

function applyStaticStrings() {
  document.documentElement.lang = window.GG_LANG;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}

function renderEdit() {
  const { w, h } = sizeKm(S.rect);
  setText('size', t('sizeKm', w, h));
  setText('name', S.name === undefined ? t('nameLoading') : S.name || t('nameNone'));
  show('chmsg', S.inside === false || S.outline === null); setText('chmsg', S.outline === null ? t('outlineLoading') : t('outsideCh'));
  $('chmsg').className = S.outline === null ? 'hint' : 'err';
  show('warn', S.race === false); setText('warn', t('freeDriving'));
  $('buildbtn').disabled = S.inside !== true || S.state !== 'edit';
  show('humanmsg', S.state === 'verifying'); setText('humanmsg', t('verifying'));
  poly.setLatLngs(corners(S.rect).map(toLatLng));
  poly.setStyle({ className: 'frame-poly' + (S.inside === false ? ' out' : '') });
  $('frame').classList.toggle('out', S.inside === false);
}

function render() {
  show('edit', ['loading', 'edit', 'verifying', 'submitting'].includes(S.state));
  show('progress', S.state === 'queued' || S.state === 'building');
  show('result', S.state === 'done'); show('fail', S.state === 'failed');
  renderEdit();
}

// ---- outline ----
async function loadOutline() {
  try { const r = await fetch(OUTLINE_URL); if (!r.ok) throw new Error(r.status); S.outline = await r.json(); }
  catch (e) { console.warn('outline failed', e); S.outline = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }; }   // nothing is inside an empty outline: Build stays disabled
  S.state = 'edit'; commit(S.rect);
}

function commit(rect) {   // Task 5 completes this (frame, URL, preview)
  S.rect = rect; S.inside = S.outline ? rectInside(rect, S.outline) : null;
  history.replaceState(null, '', `?bbox=${formatBbox(rect)}`);
  render();
}

window.addEventListener('gg-langchange', () => { applyStaticStrings(); render(); });
applyStaticStrings(); render(); loadOutline();
window.__ed = { rect: () => S.rect.slice(), state: () => S.state, setRect: (r) => commit(r), commit, map, centre: () => centre(S.rect) };
