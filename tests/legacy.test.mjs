// #577: the game moved from prototype/ to the site root; every old /prototype/ link must keep reaching the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { legacyTarget } from '../legacy.js';

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
  assert.ok(html.includes("import { legacyTarget } from '/legacy.js'"));
  assert.ok(html.includes('location.replace(target)'));
});
