// legacy.js (#577): the game moved from prototype/ to the site root. Old links and bookmarks still point at
// /prototype/...; legacyTarget gives the new address (the prototype segment dropped, query and hash kept), or null
// when the path is not an old prototype path. Pure: no DOM, no window, so node --test can import it.
const PROTOTYPE = /\/prototype(?=\/|$)/;

export function legacyTarget(pathname, search, hash) {
  if (!PROTOTYPE.test(pathname)) return null;
  return (pathname.replace(PROTOTYPE, '') || '/') + search + hash;
}
