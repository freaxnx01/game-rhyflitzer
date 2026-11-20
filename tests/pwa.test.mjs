// #1076: the web app manifest, its icons and the head tags that make rhyflitzer.ch installable. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { STRINGS } from '../strings.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const pngSize = (path) => { const b = readFileSync(new URL(`../${path}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('index.html links the manifest, the theme colour and the apple-touch-icon, and registers no service worker', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#1c1f26">/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon-180\.png">/);
  assert.doesNotMatch(html, /serviceWorker/);
  assert.deepEqual(pngSize('assets/icons/apple-touch-icon-180.png'), [180, 180]);
});

test('manifest: Rhyflitzer, fullscreen, scope /, charcoal colours, three icons that exist at the declared size', () => {
  assert.equal(manifest.name, 'Rhyflitzer'); assert.equal(manifest.short_name, 'Rhyflitzer');
  assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'fullscreen'); assert.equal(manifest.orientation, undefined);
  assert.equal(manifest.theme_color, '#1c1f26'); assert.equal(manifest.background_color, '#1c1f26');
  assert.equal(manifest.prefer_related_applications, undefined);
  assert.deepEqual(manifest.icons.map((i) => [i.src, i.sizes, i.purpose]), [
    ['assets/icons/icon-192.png', '192x192', 'any'], ['assets/icons/icon-512.png', '512x512', 'any'],
    ['assets/icons/icon-512-maskable.png', '512x512', 'maskable']]);
  for (const i of manifest.icons) {
    assert.ok(existsSync(new URL(`../${i.src}`, import.meta.url)), i.src); assert.equal(i.type, 'image/png');
    assert.deepEqual(pngSize(i.src), i.sizes.split('x').map(Number), i.src);
  }
});

test('reload control: de/en label, buttons on the start screen and in the pause menu, hidden unless installed', () => {
  assert.equal(STRINGS.en.reloadBtn, 'Reload'); assert.equal(STRINGS.de.reloadBtn, 'Neu laden');
  assert.match(html, /<button id="reloadbtn" class="btn small" type="button" data-i18n="reloadBtn" style="text-transform:none">Reload<\/button>\s*<\/div>/);
  assert.match(html, /id="pausemenu"[^\n]*\n\s*<button id="pausereload" class="btn" type="button" data-i18n="reloadBtn">Reload<\/button>/);
  assert.match(html, /html:not\(\.installed\) #reloadbtn, ?html:not\(\.installed\) #pausereload ?\{ ?display: ?none ?\}/);
  assert.match(html, /display-mode: fullscreen/); assert.match(html, /navigator\.standalone === true/);
  assert.match(html, /\$\('reloadbtn'\)\.onclick = \(\) => location\.reload\(\)/);
  assert.match(html, /\$\('pausereload'\)\.onclick = \(\) => location\.reload\(\)/);
});
