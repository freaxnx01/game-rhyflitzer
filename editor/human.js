// #169: the human check (#168). Only called when the player presses Build. A fresh invisible <altcha-widget> per attempt, removed afterwards.
import { challengeUrl } from './api.js';

const TIMEOUT_MS = 60000;   // ~1 s on a phone; a minute is a hung worker

export class HumanCheckError extends Error {
  constructor(message, httpStatus = 0, body = null) { super(message); this.httpStatus = httpStatus; this.body = body; }
}

async function fetchChallenge() {
  const res = await fetch(challengeUrl(), { credentials: 'omit' });   // a network failure throws a TypeError: the caller maps it to errServer
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new HumanCheckError('challenge refused', res.status, body);
  return body;
}

export async function solveHuman(host = document.getElementById('human')) {
  const challenge = await fetchChallenge();
  return new Promise((resolve, reject) => {
    const widget = document.createElement('altcha-widget');
    widget.setAttribute('display', 'invisible'); widget.setAttribute('auto', 'off');
    const finish = (settle, value) => { clearTimeout(timer); widget.remove(); settle(value); };
    const timer = setTimeout(() => finish(reject, new HumanCheckError('solving timed out')), TIMEOUT_MS);
    widget.addEventListener('load', () => { widget.configure({ challenge, credentials: 'omit', workers: Math.min(4, navigator.hardwareConcurrency || 2) }); widget.verify(); }, { once: true });
    widget.addEventListener('verified', (e) => finish(resolve, e.detail.payload));
    widget.addEventListener('statechange', (e) => { if (e.detail.state === 'error') finish(reject, new HumanCheckError('solving failed')); });
    host.appendChild(widget);
  });
}
