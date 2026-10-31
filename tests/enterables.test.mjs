// #409: the enterable-buildings register -- pure helpers. node --test tests/enterables.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS, GLOW_RANGE, PROMPT_RANGE, ENTERABLE_INFO, enterableEntries, visibleEnterables,
  enterableName, nearestEntrance, enterPrompt, glowStrength, glowAnchor, GLOW_OUT, exitSpot, EXIT_OUT, jumpRowsFor,
} from '../enterables.js';
import { STRINGS } from '../strings.js';

const ANCHORS = { plattform: { x: 10, z: 20 } };
const BUILDINGS = [{ id: 171822634, ring: [[0, 0], [10, 0], [10, 10], [0, 10]] }];
const ROOMS = { eiffel: [0, 0], atomium: [500, 0] };
const resolved = () => enterableEntries(ENTERABLE_INFO, ANCHORS, BUILDINGS, ROOMS);

const JUMP_ROWS = [   // the J landmark rows these entries belong to, in J order (Münchwilen before Sisseln)
  { n: 'Plattform Sisslerfeld', g: 'Münchwilen', x: 10, z: 20, j: [78.1, 861.4] },
  { n: 'Reservoir Hübel', g: 'Münchwilen', x: -712.8, z: 1528.2, j: [-703.3, 1419.1], look: [-703.7, 1423.6] },
  { n: 'Bodenackerstrasse 6c', g: 'Sisseln', x: 5, z: 5 },
];

const mk = (over = {}) => ({
  id: 't', kind: 'building', name: { de: 'T', en: 'T' }, gemeinde: 'Sisseln', landmark: 'T',
  at: [0, 0], level: 'surface', ready: true, secret: false, x: 0, z: 0, entrances: [{ x: 0, z: 30, th: 0, w: 2 }], ...over,
});

test('enterableInfo_Entries_HaveTheContractFields', () => {
  assert.ok(ENTERABLE_INFO.length >= 4);
  const ids = new Set();
  for (const e of ENTERABLE_INFO) {
    assert.ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id), e.id);
    ids.add(e.id);
    assert.ok(KINDS.includes(e.kind), e.kind);
    assert.ok(e.name.de && e.name.en);
    assert.ok(e.gemeinde && e.landmark && e.level);
    assert.equal(typeof e.ready, 'boolean');
    assert.equal(typeof e.secret, 'boolean');
    assert.ok(Array.isArray(e.entrances));
    const refs = ['building', 'anchor', 'at', 'room'].filter(k => k in e);
    assert.equal(refs.length, 1, `${e.id} has ${refs.join(',')}`);
  }
  assert.equal(ids.size, ENTERABLE_INFO.length, 'ids are unique');
});

test('enterableEntries_ShippedEntries_ReadyAsBuilt', () => {
  const es = resolved();
  assert.equal(es.length, 4);
  assert.deepEqual(es.map(e => e.id), ['bodenackerstrasse-6c', 'plattform-sisslerfeld', 'eiffel', 'atomium']);
  assert.deepEqual(es.filter(e => !e.ready).map(e => e.id), ['eiffel', 'atomium'], 'everything but 6c (#411) and the Plattform (#413)');
  assert.deepEqual(es.filter(e => e.secret).map(e => e.id), ['eiffel', 'atomium']);
  const six = es.find(e => e.id === 'bodenackerstrasse-6c');
  assert.equal(six.ready, true);
  assert.deepEqual([six.x, six.z], [5, 5], 'the building ring mean');
  const plat = es.find(e => e.id === 'plattform-sisslerfeld');
  assert.equal(plat.ready, true);
  assert.deepEqual([plat.x, plat.z], [10, 20]);
});

test('enterableEntries_UnresolvableReference_IsDropped', () => {
  const es = enterableEntries(ENTERABLE_INFO, {}, BUILDINGS, ROOMS);
  assert.deepEqual(es.map(e => e.id), ['bodenackerstrasse-6c', 'eiffel', 'atomium']);
});

test('enterableEntries_RelEntrance_BecomesAbsolute', () => {
  const [e] = enterableEntries([{ ...mk(), at: [100, 200], entrances: [{ rel: [3, 0], th: 0, w: 2 }] }], {}, [], {});
  assert.deepEqual(e.entrances, [{ x: 103, z: 200, th: 0, w: 2 }]);
  const [e2] = enterableEntries([{ ...mk(), at: [100, 200], entrances: [{ x: 1, z: 2, th: 1, w: 1 }] }], {}, [], {});
  assert.deepEqual(e2.entrances, [{ x: 1, z: 2, th: 1, w: 1 }], 'an absolute entrance passes through unchanged');
});

test('visibleEnterables_SecretUnrevealed_Hidden', () => {
  const es = resolved();
  assert.deepEqual(visibleEnterables(es, false).map(e => e.id), ['bodenackerstrasse-6c', 'plattform-sisslerfeld']);
  assert.equal(visibleEnterables(es, true).length, 4);
});

test('enterableName_German_UsesDe', () => {
  const eiffel = resolved().find(e => e.id === 'eiffel');
  assert.equal(enterableName(eiffel, 'de'), 'Eiffelturm');
  assert.equal(enterableName(eiffel, 'en'), 'Eiffel Tower');
  assert.equal(enterableName(eiffel, 'fr'), 'Eiffel Tower');
});

test('nearestEntrance_ReadyEntranceInRange_ReturnsItWithDistance', () => {
  const near = nearestEntrance([mk()], 'surface', 0, 20, 15);
  assert.equal(near.entry.id, 't');
  assert.deepEqual(near.entrance, { x: 0, z: 30, th: 0, w: 2 });
  assert.equal(near.d, 10);
});

test('nearestEntrance_NotReady_IsIgnored', () => {
  assert.equal(nearestEntrance([mk({ ready: false })], 'surface', 0, 20, 15), null);
});

test('nearestEntrance_OtherLevel_IsIgnored', () => {
  assert.equal(nearestEntrance([mk({ level: 'eiffel' })], 'surface', 0, 20, 15), null);
});

test('nearestEntrance_OutOfRange_ReturnsNull', () => {
  assert.equal(nearestEntrance([mk()], 'surface', 0, 14, 15), null);
});

test('nearestEntrance_TwoEntrances_PicksTheCloser', () => {
  const e = mk({ entrances: [{ x: 0, z: 0, th: 0, w: 2 }, { x: 0, z: 40, th: 0, w: 2 }] });
  const near = nearestEntrance([e], 'surface', 0, 35, 15);
  assert.deepEqual([near.entrance.x, near.entrance.z], [0, 40]);
  assert.equal(near.d, 5);
});

test('enterPrompt_WithinPromptRange_AsksForKeyE', () => {
  const near = nearestEntrance([mk()], 'surface', 0, 32, 15);
  assert.deepEqual(enterPrompt(near), { id: 't', key: 'KeyE' });
  assert.equal(enterPrompt({ ...near, d: 3 }), null);
  assert.equal(enterPrompt(null), null);
});

test('glowAnchor_DoorWithHeading_StandsGlowOutMetresOutsideTheDoor', () => {
  const a = glowAnchor({ x: 10, z: 20, th: Math.PI / 2 });          // walking in = +z, so outside = -z
  assert.ok(Math.abs(a.x - 10) < 1e-9 && Math.abs(a.z - (20 - GLOW_OUT)) < 1e-9, JSON.stringify(a));
  assert.ok(GLOW_OUT >= 0.4, 'clear of the door leaf and the porch glass');
});

test('exitSpot_DoorWithHeading_StandsExitOutMetresOutsideFacingAway', () => {   // #474
  const s = exitSpot({ x: 10, z: 20, th: Math.PI / 2 });           // walking in = +z: outside = -z, facing -z
  assert.ok(Math.abs(s.x - 10) < 1e-9 && Math.abs(s.z - (20 - EXIT_OUT)) < 1e-9, JSON.stringify(s));
  assert.ok(Math.abs(Math.cos(s.th)) < 1e-9 && Math.abs(Math.sin(s.th) + 1) < 1e-9, JSON.stringify(s));
  assert.ok(EXIT_OUT > GLOW_OUT, 'clear of the door leaf, past the glow');
});

test('glowAnchor_NoHeading_AtTheDoor', () => {
  assert.deepEqual(glowAnchor({ x: 1, z: 2 }), { x: 1, z: 2 });
});

test('glowStrength_FarEdgeZero_NearOne_MonotoneBetween', () => {
  assert.equal(GLOW_RANGE, 15);
  assert.equal(PROMPT_RANGE, 2.5);
  for (const d of [15, 15.1, 40]) assert.equal(glowStrength(d), 0, `d=${d}`);
  for (const d of [2.5, 2, 0, -1]) assert.equal(glowStrength(d), 1, `d=${d}`);
  let prev = 1;
  for (let d = PROMPT_RANGE + 0.01; d < GLOW_RANGE; d += 0.01) {
    const k = glowStrength(d);
    assert.ok(k < prev, `not increasing towards the door at d=${d}`);
    assert.ok(k < 1 && k > 0, k);
    prev = k;
  }
});

test('jumpRowsFor_FilterOff_ReturnsJumpEntriesFiltered', () => {
  const rows = jumpRowsFor(JUMP_ROWS, resolved(), { q: '', g: null, enterable: false }, false);
  assert.deepEqual(rows, JUMP_ROWS);
  for (let i = 0; i < rows.length; i++) assert.ok(rows[i] === JUMP_ROWS[i], 'the same objects, not copies');
  const rows2 = jumpRowsFor(JUMP_ROWS, resolved(), { q: 'hübel', g: null, enterable: false }, false);
  assert.deepEqual(rows2, [JUMP_ROWS[1]]);
});

test('jumpRowsFor_EnterableOn_ReturnsLandmarkRowsOfVisibleEntries', () => {
  const rows = jumpRowsFor(JUMP_ROWS, resolved(), { q: '', g: null, enterable: true }, false);
  assert.deepEqual(rows.map(r => r.n), ['Plattform Sisslerfeld', 'Reservoir Hübel', 'Bodenackerstrasse 6c'], 'J order');
  assert.deepEqual(rows.map(r => r.soon), [undefined, undefined, undefined], 'no dimmed row: 6c (#411) and the Plattform (#413) are ready');
  assert.deepEqual([rows[0].x, rows[0].z, rows[0].j], [10, 20, [78.1, 861.4]], 'the J row, jumpable as before');
  assert.deepEqual([rows[1].x, rows[1].z], [-712.8, 1528.2], 'the hideout landmark row, once');
});

test('jumpRowsFor_HideoutUnrevealed_OnlyReservoirRow', () => {
  const es = resolved();
  const unrevealed = jumpRowsFor(JUMP_ROWS, es, { q: '', g: null, enterable: true }, false);
  assert.deepEqual(unrevealed.map(r => r.n), ['Plattform Sisslerfeld', 'Reservoir Hübel', 'Bodenackerstrasse 6c']);
  const revealed = jumpRowsFor(JUMP_ROWS, es, { q: '', g: null, enterable: true, lang: 'de' }, true);
  assert.deepEqual(revealed.map(r => r.n), ['Plattform Sisslerfeld', 'Eiffelturm', 'Atomium', 'Bodenackerstrasse 6c']);
  for (const r of revealed.filter(r => r.n === 'Eiffelturm' || r.n === 'Atomium')) {
    assert.deepEqual([r.x, r.z, r.j, r.look], [-712.8, 1528.2, [-703.3, 1419.1], [-703.7, 1423.6]], 'the Hübel jump point');
    assert.equal(r.g, 'Münchwilen');
  }
  const revealedEn = jumpRowsFor(JUMP_ROWS, es, { q: '', g: null, enterable: true }, true);
  assert.deepEqual(revealedEn.map(r => r.n), ['Plattform Sisslerfeld', 'Eiffel Tower', 'Atomium', 'Bodenackerstrasse 6c']);
});

test('jumpRowsFor_GemeindeAndQuery_Compose', () => {
  const rows = jumpRowsFor(JUMP_ROWS, resolved(), { q: '', g: 'Sisseln', enterable: true }, false);
  assert.deepEqual(rows.map(r => r.n), ['Bodenackerstrasse 6c']);
  const rows2 = jumpRowsFor(JUMP_ROWS, resolved(), { q: 'platt', g: null, enterable: true }, false);
  assert.deepEqual(rows2.map(r => r.n), ['Plattform Sisslerfeld']);
});

test('strings_EnterKeys_ExistInBothLanguages', () => {
  for (const k of ['enterPrompt', 'enterSoon', 'chipEnterable', 'enterableSoon', 'keyEnter']) {
    const en = STRINGS.en[k], de = STRINGS.de[k];
    assert.equal(typeof en, 'string', `en ${k}`); assert.ok(en.length > 0, `en ${k}`);
    assert.equal(typeof de, 'string', `de ${k}`); assert.ok(de.length > 0, `de ${k}`);
  }
  assert.ok(STRINGS.en.enterPrompt.startsWith('E · '), STRINGS.en.enterPrompt);
  assert.ok(STRINGS.de.enterPrompt.startsWith('E · '), STRINGS.de.enterPrompt);
  assert.ok(!STRINGS.de.enterableSoon.includes('ß'), 'Swiss spelling');
});

test('enterables_Text_NamesNoFlatFloorOrSide', () => {
  const forbidden = /wohnung|flat|stock|floor|etage|links|rechts|left|right|seite|side/i;
  assert.ok(!forbidden.test(JSON.stringify(ENTERABLE_INFO)), 'the register names only the public address');
  for (const lang of ['en', 'de']) {
    const texts = ['enterPrompt', 'enterSoon', 'chipEnterable', 'enterableSoon', 'keyEnter']
      .map(k => STRINGS[lang][k]).filter(t => typeof t === 'string');
    assert.equal(texts.length, 5, `the ${lang} strings exist for the check`);
    for (const t of texts) assert.ok(!forbidden.test(t), `${lang} "${t}"`);
  }
});

test('strings_PlattformOpen_ExistsInBothLanguages', () => {
  assert.equal(typeof STRINGS.en.plattformOpen, 'string');
  assert.ok(STRINGS.en.plattformOpen.length > 0);
  assert.equal(typeof STRINGS.de.plattformOpen, 'string');
  assert.ok(STRINGS.de.plattformOpen.length > 0);
});

test('ENTERABLE_INFO_BodenackerstrasseSixC_IsReadyAndStillNamesOnlyTheAddress', () => {
  const e = ENTERABLE_INFO.find(x => x.id === 'bodenackerstrasse-6c');
  assert.equal(e.ready, true);
  assert.equal(e.secret, false);
  assert.equal(e.kind, 'building');
  assert.deepEqual(e.name, { de: 'Bodenackerstrasse 6c', en: 'Bodenackerstrasse 6c' });
});
