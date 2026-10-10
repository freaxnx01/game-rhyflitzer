// #176: toast() sets textContent, so a string with our own markup (<br>, a span, an entity) shown through it would
// appear to the player as raw tags. Every key toasted with toast(tr(...)) must be plain text in both languages;
// strings that carry markup go through toastHtml().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, translate } from '../strings.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const MARKUP = /<[a-z/]|&[a-z#0-9]+;/i;

function textToastKeys() {
  const keys = new Set();
  for (const m of HTML.matchAll(/\btoast\(tr\(([^;]*?)\)\s*[,)]/g)) for (const k of m[1].matchAll(/'(\w+)'/g)) keys.add(k[1]);
  const auto = HTML.match(/const AUTO_TOASTS = \{([^}]*)\}/);
  for (const k of auto[1].matchAll(/:\s*'(\w+)'/g)) keys.add(k[1]);
  return [...keys];
}

test('toast: every key shown as text exists and carries no markup in en or de', () => {
  const keys = textToastKeys();
  assert.ok(keys.length > 20, `found only ${keys.length} toast keys: the call-site pattern changed`);
  for (const key of keys) {
    assert.ok(key in STRINGS.en, `toast key ${key} is not in strings.js`);
    for (const lang of ['en', 'de']) {
      const text = String(translate(lang, key, 'X', 'Y', 'Z'));
      assert.doesNotMatch(text, MARKUP, `${lang}.${key} carries markup but is shown with toast(): use toastHtml()`);
    }
  }
});
