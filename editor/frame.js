// #169: the frame overlay. A DOM box above the Leaflet container (sibling of #map, so dragging it never pans the map) with a
// draggable body and four 44 px corner handles. Positions follow the projected LV95 corners on every map move.
import { GRID, snapRect, clampRect, moveRect, resizeRect, corners, fixedCornerAfterResize } from './geo.js';

export function createFrame(map, el, { toLv95, toLatLng, labels, onGhost, onCommit }) {
  let rect = null, drag = null;
  el.innerHTML = '';   // own static markup only, built once
  const body = document.createElement('div'); body.className = 'body'; body.tabIndex = 0; body.setAttribute('role', 'group'); el.appendChild(body);
  const handles = {};
  for (const c of ['nw', 'ne', 'se', 'sw']) {
    const h = document.createElement('button'); h.type = 'button'; h.className = `h ${c}`; h.dataset.corner = c; h.tabIndex = -1;
    el.appendChild(h); handles[c] = h;
  }

  function relabel() {   // labels are functions, so a language switch can re-read them
    body.setAttribute('aria-label', labels.body());
    for (const [c, h] of Object.entries(handles)) h.setAttribute('aria-label', labels.handle(c));
  }
  relabel();

  function refresh() {
    if (!rect) return;
    const pts = corners(rect).map((c) => map.latLngToContainerPoint(toLatLng(c)));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
    el.hidden = false; el.style.left = `${x0}px`; el.style.top = `${y0}px`; el.style.width = `${Math.max(...xs) - x0}px`; el.style.height = `${Math.max(...ys) - y0}px`;
    ['nw', 'ne', 'se', 'sw'].forEach((c, i) => { handles[c].style.left = `${pts[i].x - x0}px`; handles[c].style.top = `${pts[i].y - y0}px`; });
  }

  function lv95At(e) { const r = map.getContainer().getBoundingClientRect(); return toLv95(map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))); }

  function start(e, corner) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); e.target.setPointerCapture(e.pointerId);
    drag = { corner, from: lv95At(e), rect0: rect };
  }
  function move(e) {
    if (!drag) return;
    const [E, N] = lv95At(e), dE = E - drag.from[0], dN = N - drag.from[1];
    const r = drag.corner ? resizeRect(drag.rect0, drag.corner, dE, dN) : moveRect(drag.rect0, dE, dN);
    rect = drag.corner ? orient(r) : r; refresh(); onGhost(rect);
  }
  function end() {
    if (!drag) return;
    const fixed = drag.corner ? fixedCornerAfterResize(drag.rect0, drag.corner, rect) : 'sw'; drag = null;
    commit(clampRect(snapRect(rect), fixed));
  }
  const orient = ([a, b, c, d]) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];   // a corner dragged past its opposite
  function commit(r) { rect = r; refresh(); onCommit(r); }

  body.addEventListener('pointerdown', (e) => start(e, null));
  for (const h of Object.values(handles)) h.addEventListener('pointerdown', (e) => start(e, h.dataset.corner));
  for (const n of [body, ...Object.values(handles)]) { n.addEventListener('pointermove', move); n.addEventListener('pointerup', end); n.addEventListener('pointercancel', end); }

  body.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, GRID], ArrowDown: [0, -GRID] }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = e.shiftKey ? resizeRect(rect, 'ne', d[0], d[1]) : moveRect(rect, d[0], d[1]);   // Shift: the south-west corner stays
    commit(clampRect(snapRect(r), 'sw'));
  });

  map.on('move zoom viewreset resize', refresh);
  return { setRect(r) { rect = r; refresh(); }, refresh, relabel, element: el, focus: () => body.focus() };
}
