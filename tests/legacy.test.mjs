// #577: the game moved from prototype/ to the site root; every old /prototype/ link must keep reaching the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { legacyTarget, externalReferrer, stashReferrer, takeReferrer } from '../legacy.js';

test('legacyTarget: /prototype/ goes to the root and keeps the query and the hash', () => {
  assert.equal(legacyTarget('/prototype/', '?region=ehrendingen&vehicle=bus', '#x'), '/?region=ehrendingen&vehicle=bus#x');
  assert.equal(legacyTarget('/prototype', '', ''), '/');
});

test('legacyTarget: deeper old paths drop only the prototype segment', () => {
  assert.equal(legacyTarget('/prototype/index.html', '?world=0123456789ab', ''), '/index.html?world=0123456789ab');
  assert.equal(legacyTarget('/prototype/assets/bus.glb', '', ''), '/assets/bus.glb');
});

test('legacyTarget: a site under a base path keeps the base', () => {
  assert.equal(legacyTarget('/game-rhyflitzer/prototype/', '?debug', ''), '/game-rhyflitzer/?debug');
});

test('legacyTarget: never leaves the site (no open redirect through //host or /\\host)', () => {
  for (const path of ['/prototype//evil.example', '/prototype///evil.example/x', '/prototype/\\evil.example', '/prototype/\\/evil.example']) {
    const target = legacyTarget(path, '', '');
    assert.equal(new URL(target, 'https://rhyflitzer.freaxnx01.ch/').host, 'rhyflitzer.freaxnx01.ch', `${path} -> ${target}`);
    assert.match(target, /^\/[^/\\]/, `${path} -> ${target}`);
  }
});

test('legacyTarget: anything that is not an old prototype path is left alone', () => {
  for (const path of ['/', '/index.html', '/missing.html', '/prototypes/', '/my-prototype/x', '/docs/prototype.md']) {
    assert.equal(legacyTarget(path, '?a', '#b'), null, path);
  }
});

test('prototype/index.html stays and forwards with the query and the hash', () => {
  const url = new URL('../prototype/index.html', import.meta.url);
  assert.ok(existsSync(url), 'prototype/index.html must not be deleted: old links and bookmarks point at it');
  const html = readFileSync(url, 'utf8');
  assert.ok(html.includes('location.replace("../" + location.search + location.hash)'));
  assert.ok(html.includes('<meta http-equiv="refresh" content="0; url=../">'));
});

test('404.html forwards old prototype links through legacyTarget', () => {
  const html = readFileSync(new URL('../404.html', import.meta.url), 'utf8');
  assert.ok(html.includes("import { legacyTarget, stashReferrer } from '/legacy.js'"));
  assert.ok(html.includes('location.replace(target)'));
});

// #663: the stub forwards with location.replace, so the page after it would see the stub as referrer; the real,
// external one travels in sessionStorage and analytics.js sends it instead.
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('externalReferrer: another origin passes, same origin, empty and garbage give an empty string', () => {
  assert.equal(externalReferrer('https://www.reddit.com/r/x/', 'https://github.freaxnx01.ch'), 'https://www.reddit.com/r/x/');
  assert.equal(externalReferrer('https://github.freaxnx01.ch/some/page', 'https://github.freaxnx01.ch'), '');
  assert.equal(externalReferrer('', 'https://github.freaxnx01.ch'), '');
  assert.equal(externalReferrer('not a url', 'https://github.freaxnx01.ch'), '');
});

test('stashReferrer + takeReferrer: stored once, read once, then gone', () => {
  const s = memory();
  stashReferrer('https://www.reddit.com/', 'https://github.freaxnx01.ch', s);
  assert.equal(takeReferrer(s), 'https://www.reddit.com/');
  assert.equal(takeReferrer(s), '');
});

test('stashReferrer: an internal referrer stores nothing and does not wipe an earlier one', () => {
  const s = memory();
  stashReferrer('https://www.reddit.com/', 'https://github.freaxnx01.ch', s);
  stashReferrer('https://github.freaxnx01.ch/prototype/', 'https://github.freaxnx01.ch', s);
  assert.equal(takeReferrer(s), 'https://www.reddit.com/');
});

test('referrer storage: a missing or throwing sessionStorage never escapes', () => {
  const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  assert.doesNotThrow(() => stashReferrer('https://a.example/', 'https://b.example', boom));
  assert.equal(takeReferrer(boom), '');
  assert.equal(takeReferrer(undefined), '');
  assert.doesNotThrow(() => stashReferrer('https://a.example/', 'https://b.example', undefined));
});

test('the stub and 404.html both keep the referrer before they forward', () => {
  const stub = readFileSync(new URL('../prototype/index.html', import.meta.url), 'utf8');
  assert.ok(stub.indexOf('legacy-referrer') > -1 && stub.indexOf('legacy-referrer') < stub.indexOf('location.replace'));
  const notFound = readFileSync(new URL('../404.html', import.meta.url), 'utf8');
  assert.ok(notFound.includes('stashReferrer(document.referrer, location.origin, sessionStorage)'));
});
