// legacy.js (#577): the game moved from prototype/ to the site root. Old links and bookmarks still point at
// /prototype/...; legacyTarget gives the new address (the prototype segment dropped, query and hash kept), or null
// when the path is not an old prototype path. Pure: no DOM, no window, so node --test can import it.
const PROTOTYPE = /\/prototype(?=\/|$)/;
// a target starting with // or /\ is read as another host: collapse leading slashes so the jump stays on this site
const LEADING_SLASHES = /^[/\\]+/;

// #663: location.replace makes the stub the referrer of the game page, so Umami would count the stub instead of the
// real source (reddit.com...). The stub and 404.html keep the external referrer here; analytics.js reads it once.
// prototype/index.html repeats the one-line stash inline (it must run before its meta refresh): keep the key in sync.
export const REFERRER_KEY = 'legacy-referrer';

export function externalReferrer(referrer, origin) {
  try { return new URL(referrer).origin !== origin ? referrer : ''; } catch (e) { return ''; }
}

export function stashReferrer(referrer, origin, storage) {
  try { const external = externalReferrer(referrer, origin); if (external) storage.setItem(REFERRER_KEY, external); } catch (e) { /* storage blocked: the stub stays the referrer */ }
}

export function takeReferrer(storage) {
  try { const value = storage.getItem(REFERRER_KEY) || ''; storage.removeItem(REFERRER_KEY); return value; } catch (e) { return ''; }
}

export function legacyTarget(pathname, search, hash) {
  if (!PROTOTYPE.test(pathname)) return null;
  return pathname.replace(PROTOTYPE, '').replace(LEADING_SLASHES, '/').replace(/^(?!\/)/, '/') + search + hash;
}
