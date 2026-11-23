// joinhandoff.js (#1111): an invite link clicked while the game already runs in another tab hands its join code to
// that tab over a BroadcastChannel, so the second tab need not load a whole game of its own. Three messages --
// offer, ready, go -- make sure exactly one of several open tabs takes the code. The channel is injected, so the
// module stays pure and node --test can drive it without a browser.
import { CODE_MAX } from './netcodec.js';   // netcodec's own bound: readJoinHash hands a #join= fragment on unread and decodeCode refuses anything longer, so every code up to CODE_MAX is legitimate here
export const WAIT_MS = 500;

// parseHandoff(msg) — the message if it has a valid handoff shape, else null; nothing from the channel is trusted
export function parseHandoff(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (!['offer', 'ready', 'go'].includes(msg.type) || typeof msg.nonce !== 'string') return null;
  if (msg.type !== 'go') return typeof msg.from === 'string' ? msg : null;
  if (typeof msg.to !== 'string' || typeof msg.code !== 'string' || !msg.code.length || msg.code.length > CODE_MAX) return null;
  return msg;
}

function randomId() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }

// offerJoin(code, {open, wait, id}) — true when another tab took the code, false when none answered in wait ms
export function offerJoin(code, { open, wait = WAIT_MS, id = randomId() } = {}) {
  return new Promise((resolve) => {
    if (typeof code !== 'string' || !code.length || code.length > CODE_MAX) { resolve(false); return; }   // a code parseHandoff would drop unread on the other side: no tab may be told it took one, the caller joins here
    let ch = null;
    try { ch = open && open(); } catch (e) { ch = null; }   // no BroadcastChannel (or it throws): the old behaviour, join here
    if (!ch) { resolve(false); return; }
    const nonce = randomId();
    let done = false;
    const finish = (took) => { if (done) return; done = true; clearTimeout(timer); try { ch.close(); } catch (e) { /* already gone */ } resolve(took); };
    const timer = setTimeout(() => finish(false), wait);
    ch.addEventListener('message', (ev) => {
      const msg = parseHandoff(ev.data);
      if (!msg || msg.type !== 'ready' || msg.nonce !== nonce || done) return;   // the first tab to say ready gets the code; a late ready, after the wait closed the channel, finds nothing to answer
      ch.postMessage({ type: 'go', nonce, to: msg.from, code });
      finish(true);
    });
    ch.postMessage({ type: 'offer', nonce, from: id });
  });
}

// listenForJoin({open, canAccept, onJoin, id, hold}) — a close function; the open tab answers offers and, on go, gets the code
export function listenForJoin({ open, canAccept = () => true, onJoin, id = randomId(), hold = WAIT_MS * 2 } = {}) {
  let ch = null;
  try { ch = open && open(); } catch (e) { ch = null; }
  if (!ch || typeof onJoin !== 'function') return () => {};
  let pending = null, expiry = null;   // one handoff at a time: a second offer inside the window gets no ready and joins in its own tab
  const release = () => { clearTimeout(expiry); pending = null; };
  ch.addEventListener('message', (ev) => {
    const msg = parseHandoff(ev.data);
    if (!msg) return;
    if (msg.type === 'offer') {
      if (msg.from === id || pending || !canAccept()) return;   // own tab, a handoff already open, or busy: hosting, a guest, or a generated region never answers
      pending = msg.nonce;
      expiry = setTimeout(release, hold);   // the offering tab may close before its go: do not stay deaf
      ch.postMessage({ type: 'ready', nonce: msg.nonce, from: id });
    } else if (msg.type === 'go') {
      if (msg.to !== id || msg.nonce !== pending) return;
      release();
      if (!canAccept()) return;   // only the go naming this tab, for a nonce it offered to take, and only while it still can: the tab may have turned busy inside the handoff window -- hosting, a guest, or a generated region
      onJoin(msg.code);
    }
  });
  return () => { try { ch.close(); } catch (e) { /* already gone */ } };
}
