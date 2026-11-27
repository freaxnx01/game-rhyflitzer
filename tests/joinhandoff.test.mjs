// #1111: the join-link handoff between tabs. Pure module, the channel is injected, so node --test can import it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerJoin, listenForJoin, parseHandoff } from '../joinhandoff.js';
import { CODE_MAX } from '../netcodec.js';
function makeBus() {
  const chans = new Set();
  return () => {
    const ls = new Set();
    const ch = { postMessage(d) { for (const o of chans) if (o !== ch) queueMicrotask(() => o._get(structuredClone(d))); }, addEventListener(_, f) { ls.add(f); }, _get(d) { for (const f of ls) f({ data: d }); }, close() { chans.delete(ch); } };
    chans.add(ch); return ch;
  };
}
test('offerJoin_noOtherTab_resolvesFalseAfterWait', async () => { assert.equal(await offerJoin('CODE', { open: makeBus(), wait: 20, id: 'n1' }), false); });
test('offerJoin_openTabAccepts_resolvesTrueAndTabGetsCode', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'A' });
  assert.equal(await offerJoin('CODE', { open, wait: 50, id: 'N' }), true);
  assert.deepEqual(got, ['CODE']);
});
test('offerJoin_twoOpenTabs_onlyOneGetsTheCode', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push('a' + c), id: 'A' });
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push('b' + c), id: 'B' });
  assert.equal(await offerJoin('X', { open, wait: 50, id: 'n1' }), true);
  assert.equal(got.length, 1);
});
test('offerJoin_openTabBusy_resolvesFalseAndNothingReceived', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => false, onJoin: (c) => got.push(c), id: 'A' });
  assert.equal(await offerJoin('X', { open, wait: 20, id: 'n1' }), false);
  assert.deepEqual(got, []);
});
test('listenForJoin_ownOffer_ignored', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'SAME' });   // the offering tab's own listener
  assert.equal(await offerJoin('X', { open, wait: 20, id: 'SAME' }), false);   // same tab id: the offer carries from:'SAME', the listener skips it
  assert.deepEqual(got, []);
});
test('parseHandoff_badShapes_null', () => {
  for (const m of [null, 'x', {}, { type: 'go' }, { type: 'offer', nonce: 1, from: 'A' }, { type: 'go', nonce: 'n', to: 'A', code: 5 }, { type: 'go', nonce: 'n', to: 'A', code: 'x'.repeat(CODE_MAX + 1) }]) assert.equal(parseHandoff(m), null);
  assert.ok(parseHandoff({ type: 'offer', nonce: 'n', from: 'A' }));
  assert.ok(parseHandoff({ type: 'go', nonce: 'n', to: 'A', code: 'x'.repeat(4001) }));   // a code past the old 4000 bound is legitimate: readJoinHash hands #join= fragments up to netcodec's CODE_MAX on unread
});
test('offerJoin_longButLegitimateCode_reachesTheOpenTab', async () => {
  const open = makeBus(); const got = []; const code = 'R5G.' + 'x'.repeat(5000);   // inside 4001..CODE_MAX: silent drop was the bug
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'A' });
  assert.equal(await offerJoin(code, { open, wait: 50, id: 'N' }), true);
  assert.deepEqual(got, [code]);
});
test('offerJoin_codeNoTabCouldTake_resolvesFalseOffersNothing', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'A' });
  assert.equal(await offerJoin('x'.repeat(CODE_MAX + 1), { open, wait: 50, id: 'N' }), false);   // parseHandoff drops the go unread: nobody may be told the code was taken
  assert.equal(await offerJoin('', { open, wait: 50, id: 'N' }), false);
  assert.equal(await offerJoin(null, { open, wait: 50, id: 'N' }), false);
  assert.deepEqual(got, []);
});
test('listenForJoin_tabTurnedBusyBeforeTheGo_takesNoCode', async () => {
  const open = makeBus(); const got = [];
  let accept = true;   // flips busy right after the offer: the tab started hosting inside the handoff window
  listenForJoin({ open, canAccept: () => { const ok = accept; accept = false; return ok; }, onJoin: (c) => got.push(c), id: 'A' });
  assert.equal(await offerJoin('X', { open, wait: 50, id: 'N' }), true);   // the offering tab saw a ready, it cannot know
  assert.deepEqual(got, []);   // but this one does not take a code it can no longer take
});
test('offerJoin_twoConcurrentOffersToOneTab_onlyOneIsTold', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'A' });
  const both = await Promise.all([offerJoin('X', { open, wait: 50, id: 'N1' }), offerJoin('Y', { open, wait: 50, id: 'N2' })]);   // two links inside one handoff window
  assert.deepEqual(both.filter(Boolean).length, 1);   // the other tab joins itself instead of a false "joined in your other tab"
  assert.equal(got.length, 1);
});
test('listenForJoin_goNeverCame_answersAgainLater', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'A', hold: 30 });
  const ch = open(); ch.postMessage({ type: 'offer', nonce: 'lost', from: 'Z' });   // an offering tab that died before its go
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(await offerJoin('X', { open, wait: 50, id: 'N' }), true);
  assert.deepEqual(got, ['X']);
});
