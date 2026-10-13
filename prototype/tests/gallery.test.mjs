// #170: the gallery list from the API. Pure: fetch is injected, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryUrl, cleanEntry, parseGallery, loadGallery } from '../gallery.js';

const ID = '0123456789ab';
const ok = (body) => async () => ({ ok: true, json: async () => body });

test('galleryUrl joins host and path', () => {
  assert.equal(galleryUrl('https://h.example'), 'https://h.example/api/gallery');
});

test('cleanEntry keeps good entries and strips control characters', () => {
  assert.deepEqual(cleanEntry({ id: ID, title: ' Rhein\x00felden ', description: 'Altstadt' }), { id: ID, title: 'Rheinfelden', description: 'Altstadt' });
  assert.equal(cleanEntry({ id: ID, title: 'T' }).description, '');
});

test('cleanEntry refuses bad ids, empty or over-long titles and non-strings', () => {
  for (const bad of [null, 5, 'x', {}, { id: 'XYZ', title: 'T' }, { id: '../etc/passwd', title: 'T' }, { id: ID, title: '' }, { id: ID, title: 'x'.repeat(81) },
    { id: ID, title: 'T', description: 'x'.repeat(301) }, { id: ID, title: 7 }, { id: ID, title: 'T', description: {} }]) assert.equal(cleanEntry(bad), null, JSON.stringify(bad));
});

test('parseGallery: arrays only, drops bad entries and duplicates, caps at 50', () => {
  assert.deepEqual(parseGallery({ not: 'an array' }), []);
  assert.deepEqual(parseGallery('x'), []);
  const many = Array.from({ length: 60 }, (_, i) => ({ id: i.toString(16).padStart(12, '0'), title: `W${i}` }));
  assert.equal(parseGallery(many).length, 50);
  const two = parseGallery([{ id: ID, title: 'A' }, { id: ID, title: 'B' }, { id: 'bad', title: 'C' }]);
  assert.deepEqual(two.map((e) => e.title), ['A']);
});

test('markup in a title is kept as plain text (the renderer uses textContent)', () => {
  assert.equal(cleanEntry({ id: ID, title: '<img src=x onerror=alert(1)>' }).title, '<img src=x onerror=alert(1)>');
});

test('loadGallery: good list, non-ok, network error and bad JSON all end in a list, never a throw', async () => {
  assert.equal((await loadGallery({ host: 'https://h', fetch: ok([{ id: ID, title: 'A' }]) })).length, 1);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => ({ ok: false, status: 500 }) }), []);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => { throw new Error('offline'); } }), []);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) }), []);
});
