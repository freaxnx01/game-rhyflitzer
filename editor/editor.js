// #169: the region editor page. State machine edit → submitting → queued/building → done | failed; renders with textContent only.
import { DEFAULT_RECT, parseBbox, formatBbox, sizeKm, centre, lv95ToWgs, wgsToLv95, corners, rectInside } from './geo.js';
import { WMTS_URL, WMTS_ATTRIBUTION, STEPS, previewUrl, identifyUrl, gemeindeName, parsePreview,
  jobsUrl, jobUrl, fileUrl, metaUrl, shareUrl, driveUrl, parseJob, JobFormatError, parseMeta, errorKey, failKey, pollDelay } from './api.js';
import { translate, formatKm } from './strings.js';
import { createFrame } from './frame.js';
import { solveHuman, HumanCheckError } from './human.js';
import { frameData, track, trackPageview, createPreviewReporter } from './analytics.js';
import { packWorldZip } from '../worlds.js';   // #167

const $ = (id) => document.getElementById(id);
const t = (key, ...args) => translate(window.GG_LANG, key, ...args);
const CH_BOUNDS = [[45.6, 5.7], [47.95, 10.6]], OUTLINE_URL = '../pipeline/ch_outline.geojson';

const S = { state: 'loading', rect: parseBbox(location.search) || DEFAULT_RECT, fromUrl: !!parseBbox(location.search), outline: null, inside: null, name: undefined, race: null, exists: false, gemeinden: [], job: null, dlFailed: false, errKey: null };
const reporter = createPreviewReporter();

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

// Leaflet copies options.className onto the path only while creating it, so setStyle cannot change it afterwards.
function polyClass({ out = false, ghost = false }) {
  const el = poly.getElement(); if (!el) return;
  el.classList.toggle('out', out); el.classList.toggle('ghost', ghost);
}

function applyStaticStrings() {
  document.documentElement.lang = window.GG_LANG; document.title = t('docTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

function renderEdit() {
  const fmt = (v) => formatKm(v, window.GG_LANG, navigator.language);
  const { w, h } = sizeKm(S.rect);
  setText('size', t('sizeKm', fmt(w), fmt(h)));
  setText('name', S.name === undefined ? t('nameLoading') : S.name || t('nameNone'));
  show('chmsg', S.inside === false || S.outline === null); setText('chmsg', S.outline === null ? t('outlineLoading') : t('outsideCh'));
  $('chmsg').className = S.outline === null ? 'hint' : 'err';
  show('warn', S.race === false); setText('warn', t('freeDriving'));
  $('buildbtn').disabled = S.inside !== true || S.state !== 'edit';
  show('humanmsg', S.state === 'verifying'); setText('humanmsg', t('verifying'));
  poly.setLatLngs(corners(S.rect).map(toLatLng));
  polyClass({ out: S.inside === false });
  $('frame').classList.toggle('out', S.inside === false);
}

function renderProgress() {
  const job = S.job; if (!job) return;
  setText('pname', S.name || t('nameNone'));
  const ol = $('steps'); ol.textContent = '';
  const at = STEPS.indexOf(job.status);
  STEPS.forEach((step, i) => {
    const li = document.createElement('li');
    li.textContent = step === 'queued' && job.status === 'queued' && job.position !== null ? t('queuedAt', job.position) : t('step' + step[0].toUpperCase() + step.slice(1));
    li.className = i < at ? 'ok' : i === at ? 'on' : ''; ol.appendChild(li);
  });
}

function renderResult() {
  const job = S.job; if (!job) return;
  setText('rname', S.name || t('nameNone'));
  $('drivebtn').href = driveUrl(job.id); $('sharein').value = shareUrl(job.id);
  show('rwarn', S.race === false);
  show('dlmsg', S.dlFailed); if (S.dlFailed) setText('dlmsg', t('dlError'));
}

function renderFail() { setText('failmsg', t(S.errKey || 'errServer')); }

function render() {
  show('edit', ['loading', 'edit', 'verifying', 'submitting'].includes(S.state));
  show('progress', S.state === 'queued' || S.state === 'building');
  show('result', S.state === 'done'); show('fail', S.state === 'failed');
  renderEdit(); if (S.job) { renderProgress(); renderResult(); } if (S.state === 'failed') renderFail();
}

// ---- outline ----
async function loadOutline() {
  try { const r = await fetch(OUTLINE_URL); if (!r.ok) throw new Error(r.status); S.outline = await r.json(); }
  catch (e) { console.warn('outline failed', e); S.outline = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }; }   // nothing is inside an empty outline: Build stays disabled
  S.state = 'edit'; commit(S.rect);
}

// ---- the frame and its preview ----
const frame = createFrame(map, $('frame'), { toLv95: (ll) => wgsToLv95(ll.lat, ll.lng), toLatLng,
  labels: { body: () => t('frameLabel'), handle: (c) => t('handle', c.toUpperCase()) },
  onGhost: (r) => { poly.setLatLngs(corners(r).map(toLatLng)); polyClass({ out: S.inside === false, ghost: true }); },
  onCommit: (r) => commit(r) });
frame.setRect(S.rect);

let previewSeq = 0, previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer); const seq = ++previewSeq; S.name = undefined; S.race = null; S.exists = false; S.gemeinden = [];
  previewTimer = setTimeout(() => preview(seq), 400);
}
function cancelPreview() {   // outside Switzerland: nothing to name, nothing to ask the service
  clearTimeout(previewTimer); previewSeq++; S.name = null; S.race = null; S.exists = false; S.gemeinden = []; reporter.cancel();
}
async function preview(seq) {
  const rect = S.rect;
  const nameP = fetch(identifyUrl(centre(rect), new Date().getFullYear())).then((r) => (r.ok ? r.json() : null)).then(gemeindeName).catch(() => null);
  const previewP = fetch(previewUrl(rect)).then((r) => (r.ok ? r.json() : null)).then(parsePreview).catch(() => parsePreview(null));
  const [name, pv] = await Promise.all([nameP, previewP]);
  if (seq !== previewSeq) return;   // a newer commit happened
  S.name = name; S.race = pv.raceOk; S.exists = pv.exists;
  S.gemeinden = pv.gemeinden.length ? pv.gemeinden : name ? [name] : []; reporter.frame(frameData(rect, S.gemeinden));
  render();
}

function commit(rect) {
  S.rect = rect; frame.setRect(rect); S.inside = S.outline ? rectInside(rect, S.outline) : null;
  history.replaceState(null, '', `?bbox=${formatBbox(rect)}`);
  if (S.state === 'edit') { if (S.inside) schedulePreview(); else cancelPreview(); }
  render();
}

// ---- build, polling, done and failed ----
let pollTimer = 0, pollGen = 0;   // pollGen: one poll chain at a time; stopPolling() invalidates answers still in flight
function stopPolling() { clearTimeout(pollTimer); pollGen++; }

async function submit(withHuman) {   // the human check (only for a new world), then one POST
  let altcha = null;
  if (withHuman) { S.state = 'verifying'; render(); altcha = await solveHuman(); }
  S.state = 'submitting'; render();
  const body = altcha ? { lv95: S.rect, altcha } : { lv95: S.rect };
  const res = await fetch(jobsUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return [res, await res.json().catch(() => null)];
}

const refusedAsRobot = (res, body) => res.status === 403 && body && body.error === 'human_check_failed';

async function build() {
  if (S.state !== 'edit' || S.inside !== true) return;
  try {
    let [res, body] = await submit(S.exists !== true);   // the preview said the world exists: #168 wants no solution
    if (refusedAsRobot(res, body)) [res, body] = await submit(true);   // once more with a fresh challenge (also: the world expired meanwhile)
    if (!res.ok) return fail(errorKey(res.status, body));
    reporter.cancel(); track('editor-build-start', facts({ cached: S.exists === true }));
    applyJob(parseJob(body), 0);
  } catch (e) {
    if (e instanceof HumanCheckError) return fail(e.httpStatus ? errorKey(e.httpStatus, e.body) : 'errHuman');
    console.warn('build failed', e); fail('errServer');
  }
}

function applyJob(job, startedAt) {   // job.status 'failed' also arrives from the POST itself (a permanent too-complex failure: 202 + state failed)
  S.job = job;
  if (job.status === 'done') { S.state = 'done'; stopPolling(); track('editor-build-done', facts({ seconds: Math.round((Date.now() - (S.startedAt || Date.now())) / 5000) * 5, race: raceWord() })); loadMeta(job.id); return render(); }
  if (job.status === 'failed' || job.status === 'expired') return fail(failKey(job.reason || job.status));
  S.state = job.status === 'queued' ? 'queued' : 'building'; S.misses = 0; render();
  const t0 = startedAt || Date.now(); S.startedAt = t0;
  const gen = pollGen; pollTimer = setTimeout(() => poll(t0, gen), pollDelay(Date.now() - t0));
}

async function poll(t0, gen) {
  if (S.state !== 'queued' && S.state !== 'building') return;
  try {
    const r = await fetch(jobUrl(S.job.id)); if (gen !== pollGen) return;   // superseded, or the page left the build, while this was in flight
    if (r.status === 404) return fail('errServer');   // 'unknown': the job row is gone, so retrying cannot help
    if (!r.ok) throw new Error(String(r.status));
    const job = parseJob(await r.json());
    if (gen !== pollGen) return;
    S.misses = 0; show('lost', false); applyJob(job, t0);
  } catch (e) {
    if (gen !== pollGen) return;
    if (e instanceof JobFormatError) return fail('errServer');   // a malformed answer will not get better
    S.misses = (S.misses || 0) + 1; show('lost', S.misses >= 3);
    pollTimer = setTimeout(() => poll(t0, gen), pollDelay(Date.now() - t0));
  }
}

async function loadMeta(id) {   // the final name and the race from meta.json; the preview's guesses stay if it is not readable
  try {
    const r = await fetch(metaUrl(id)); if (!r.ok) return;
    const meta = parseMeta(await r.json());
    if (S.job && S.job.id === id) { S.name = meta.name || S.name; if (meta.race !== null) S.race = meta.race; render(); }
  } catch (e) { console.warn('meta.json not readable', e); }
}

async function fetchOk(url) { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r; }

async function downloadWorld(e) {   // #168 has no zip route: fetch the three files and pack them with #167's packWorldZip
  e.preventDefault(); const id = S.job && S.job.id; if (!id) return;
  try {
    const [worldText, metaText] = await Promise.all([fetchOk(fileUrl(id, 'world.json')).then((r) => r.text()), fetchOk(metaUrl(id)).then((r) => r.text())]);
    const terrain = await fetchOk(fileUrl(id, 'terrain.mmh')).then((r) => r.arrayBuffer());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([await packWorldZip({ worldText, terrain, metaText, meta: JSON.parse(metaText) })], { type: 'application/zip' }));
    a.download = `rhyflitzer-${id}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) { console.warn('download failed', err); S.dlFailed = true; render(); }
}

const facts = (extra) => ({ ...frameData(S.rect, S.gemeinden), ...extra });
const raceWord = () => (S.race === true ? 'yes' : S.race === false ? 'no' : 'unknown');
function fail(key) { track('editor-build-failed', facts({ reason: key })); S.state = 'failed'; S.errKey = key; stopPolling(); render(); }
function backToEdit() { S.state = 'edit'; S.job = null; S.errKey = null; S.dlFailed = false; S.startedAt = 0; stopPolling(); show('lost', false); commit(S.rect); }

$('buildbtn').addEventListener('click', build);
$('newbtn').addEventListener('click', backToEdit); $('changebtn').addEventListener('click', backToEdit);
$('dlbtn').addEventListener('click', downloadWorld);
$('dlbtn').addEventListener('keydown', (e) => { if (e.key === ' ') e.preventDefault(); });   // no page scroll; a button acts on keyup
$('dlbtn').addEventListener('keyup', (e) => { if (e.key === ' ') e.currentTarget.click(); });
$('copybtn').addEventListener('click', async () => {
  const input = $('sharein');
  try { await navigator.clipboard.writeText(input.value); } catch (e) { input.select(); document.execCommand && document.execCommand('copy'); }
  setText('copybtn', t('copied')); setTimeout(() => setText('copybtn', t('copy')), 1500);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && (S.state === 'queued' || S.state === 'building')) { stopPolling(); poll(S.startedAt, pollGen); } });

window.addEventListener('gg-langchange', () => { applyStaticStrings(); frame.relabel(); render(); });
applyStaticStrings(); render(); loadOutline(); trackPageview();
window.__ed = { rect: () => S.rect.slice(), state: () => S.state, setRect: (r) => commit(r), commit, map, centre: () => centre(S.rect),
  preview: () => ({ name: S.name, race: S.race, exists: S.exists }), job: () => S.job };
