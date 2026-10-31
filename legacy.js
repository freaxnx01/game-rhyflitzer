// legacy.js (#577): the game moved from prototype/ to the site root. Old links and bookmarks still point at
// /prototype/...; legacyTarget gives the new address (the prototype segment dropped, query and hash kept), or null
// when the path is not an old prototype path. Pure: no DOM, no window, so node --test can import it.
const PROTOTYPE = /\/prototype(?=\/|$)/;
// a target starting with // or /\ is read as another host: collapse leading slashes so the jump stays on this site
const LEADING_SLASHES = /^[/\\]+/;

export function legacyTarget(pathname, search, hash) {
  if (!PROTOTYPE.test(pathname)) return null;
  return pathname.replace(PROTOTYPE, '').replace(LEADING_SLASHES, '/').replace(/^(?!\/)/, '/') + search + hash;
}
