// #6 / #126: vehicle helpers -- pure, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// `?vehicle=<id>` picks a table entry at startup; unknown ids are ignored (the picker UI is #7)
export function vehicleFromQuery(search, ids) {
  const id = new URLSearchParams(search).get('vehicle');
  return id !== null && ids.includes(id) ? id : null;
}
