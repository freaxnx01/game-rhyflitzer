// #113: pure rules for the photo key -- no DOM, no three.js. Unit-tested with `node --test prototype/tests/*.test.mjs`.

const pad = (n) => String(n).padStart(2, '0');

// the download name, from the player's local clock: rhyflitzer-YYYYMMDD-hhmmss.png
export function photoFileName(date) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `rhyflitzer-${day}-${time}.png`;
}

// a photo needs a visible scene: the start / result overlay hidden (the J/O search and key repeat are filtered upstream)
export function canPhoto(overlayHidden) {
  return overlayHidden;
}
