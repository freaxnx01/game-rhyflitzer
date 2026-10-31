// #251: the Testhub target list. Unit-tested with `node --test tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARK_INFO, LANDMARK_INFO_EHRENDINGEN } from '../landmarks.js';
import { TARGET_ID_RE, slugify, jumpTargets, spotTargets, buildTargets } from '../testhub-targets.js';

const asEntries = (info) => info.map(i => ({ n: i.name, g: i.gemeinde, x: 0, z: 0 }));

test('slugify: umlauts become ae/oe/ue, punctuation collapses to one dash', () => {
  assert.equal(slugify('Reservoir Hübel'), 'reservoir-huebel');
  assert.equal(slugify('Südspange Sisslerfeld'), 'suedspange-sisslerfeld');
  assert.equal(slugify('Schloss Schönau (Trompeterschloss)'), 'schloss-schoenau-trompeterschloss');
  assert.equal(slugify('Bahnhof Stein-Säckingen'), 'bahnhof-stein-saeckingen');
  assert.equal(slugify('Bodenackerstrasse 10B'), 'bodenackerstrasse-10b');
});

test('slugify: a name with no usable characters still yields a valid slug', () => {
  assert.equal(slugify('???'), 'x');
});

test('jumpTargets: every J entry of both regions becomes a j.<slug> target with a valid, unique id', () => {
  for (const info of [LANDMARK_INFO, LANDMARK_INFO_EHRENDINGEN]) {
    const entries = asEntries(info);
    const targets = jumpTargets(entries);
    assert.equal(targets.length, entries.length);
    const ids = targets.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    targets.forEach((t, i) => {
      assert.match(t.id, TARGET_ID_RE);
      assert.ok(t.id.startsWith('j.'), t.id);
      assert.equal(t.kind, 'jump');
      assert.equal(t.label, entries[i].n);
      assert.equal(t.entry, entries[i]);
    });
  }
});

test('jumpTargets: known ids are stable (test-todo.md tags rely on them)', () => {
  const ids = jumpTargets(asEntries(LANDMARK_INFO)).map(t => t.id);
  assert.ok(ids.includes('j.reservoir-huebel'));
  assert.ok(ids.includes('j.suedspange-sisslerfeld'));
});

test('jumpTargets: two names with the same slug get -2, -3 in list order', () => {
  const e = (n) => ({ n, g: null, x: 0, z: 0 });
  const ids = jumpTargets([e('Bahnhof'), e('bahnhof'), e('BAHNHOF')]).map(t => t.id);
  assert.deepEqual(ids, ['j.bahnhof', 'j.bahnhof-2', 'j.bahnhof-3']);
});

test('spotTargets: both wrecks, placed 8 m east of the wreck facing it (west)', () => {
  const t = spotTargets({ underwater: { wreck: [100, 5], wreckCar: [130, 6] }, hideout: null });
  assert.deepEqual(t.map(x => x.id), ['uw.boat', 'uw.car']);
  assert.deepEqual(t[0].spot, { x: 108, z: 5, th: Math.PI });
  assert.deepEqual(t[1].spot, { x: 138, z: 6, th: Math.PI });
  t.forEach(x => { assert.equal(x.kind, 'spot'); assert.match(x.id, TARGET_ID_RE); });
});

const HIDEOUT_CTX = { mouth: [0, 0], heading: 0, tower: { x: 10, z: 20, th: 1.5 } };

test('spotTargets: hideout gate is 12 m back from the mouth, facing along the tunnel axis', () => {
  const t = spotTargets({ underwater: null, hideout: HIDEOUT_CTX });
  const gate = t.find(x => x.id === 'hideout.gate');
  assert.deepEqual(gate.spot, { x: -12, z: 0, th: 0 });
});

test('spotTargets: hideout tower is a spot in the Eiffel room, at the given pose', () => {
  const t = spotTargets({ underwater: null, hideout: HIDEOUT_CTX });
  const tower = t.find(x => x.id === 'hideout.tower');
  assert.equal(tower.label, 'Hideout: Eiffel room, facing the tower'); assert.equal(tower.kind, 'spot');
  assert.deepEqual(tower.spot, { x: 10, z: 20, th: 1.5, room: 'eiffel' });
});

test('spotTargets: no underwater / no hideout -> no spots (hand layout, other region)', () => {
  assert.deepEqual(spotTargets({ underwater: null, hideout: null }), []);
});

test('buildTargets: J entries first, then the four hidden spots; all ids valid and unique', () => {
  const entries = asEntries(LANDMARK_INFO);
  const targets = buildTargets({
    entries,
    underwater: { wreck: [0, 0], wreckCar: [30, 0] },
    hideout: { mouth: [0, 0], heading: 1.6, tower: { x: 0, z: 100, th: 0 } },
  });
  const ids = targets.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.match(id, TARGET_ID_RE));
  assert.equal(ids.filter(id => id.startsWith('j.')).length, entries.length);
  assert.deepEqual(ids.slice(entries.length), ['uw.boat', 'uw.car', 'hideout.gate', 'hideout.tower']);
});
