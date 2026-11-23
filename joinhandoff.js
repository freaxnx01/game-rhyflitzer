// joinhandoff.js (#1111): an invite link clicked while the game already runs in another tab hands its join code to
// that tab over a BroadcastChannel, so the second tab need not load a whole game of its own. Three messages --
// offer, ready, go -- make sure exactly one of several open tabs takes the code. The channel is injected, so the
// module stays pure and node --test can drive it without a browser.
export const WAIT_MS = 500;
export const MAX_CODE = 4000;

// parseHandoff(msg) — the message if it has a valid handoff shape, else null; nothing from the channel is trusted
export function parseHandoff(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (!['offer', 'ready', 'go'].includes(msg.type) || typeof msg.nonce !== 'string') return null;
  if (msg.type !== 'go') return typeof msg.from === 'string' ? msg : null;
  if (typeof msg.to !== 'string' || typeof msg.code !== 'string' || !msg.code.length || msg.code.length > MAX_CODE) return null;
  return msg;
}

function randomId() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }

// offerJoin(code, {open, wait, id}) — true when another tab took the code, false when none answered in wait ms
export function offerJoin(code, { open, wait = WAIT_MS, id = randomId() } = {}) {
  return new Promise((resolve) => {
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

// listenForJoin({open, canAccept, onJoin, id}) — a close function; the open tab answers offers and, on go, gets the code
export function listenForJoin({ open, canAccept = () => true, onJoin, id = randomId() } = {}) {
  let ch = null;
  try { ch = open && open(); } catch (e) { ch = null; }
  if (!ch || typeof onJoin !== 'function') return () => {};
  const seen = new Set();
  ch.addEventListener('message', (ev) => {
    const msg = parseHandoff(ev.data);
    if (!msg) return;
    if (msg.type === 'offer') {
      if (msg.from === id || !canAccept()) return;   // own tab, or busy: hosting, a guest, or a generated region never answers
      seen.add(msg.nonce);
      ch.postMessage({ type: 'ready', nonce: msg.nonce, from: id });
    } else if (msg.type === 'go') {
      if (msg.to !== id || !seen.has(msg.nonce)) return;   // only the go naming this tab, for a nonce it offered to take
      seen.delete(msg.nonce);   // one go, one onJoin, even if the message shows up twice
      onJoin(msg.code);
    }
  });
  return () => { try { ch.close(); } catch (e) { /* already gone */ } };
}
