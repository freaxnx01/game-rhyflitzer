// #176: esc() HTML-escapes data-derived text (OSM names, vehicle ids) before it reaches innerHTML. Pure module, so node --test can import it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../escape.js';

test('esc: escapes & < > " and apostrophe', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});

test('esc: & goes first, so nothing is double escaped', () => {
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('esc: plain text, umlauts and slashes pass unchanged', () => {
  assert.equal(esc('Bad Säckingen / Rheinfelden (Baden)'), 'Bad Säckingen / Rheinfelden (Baden)');
});

test('esc: numbers become strings, null and undefined become empty', () => {
  assert.equal(esc(42), '42');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});
