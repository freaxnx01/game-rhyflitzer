// #834: netlink.js with a fake RTCPeerConnection — a connection attempt that times out must give its guest slot back.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLink, MAX_GUESTS } from '../netlink.js';

class FakeChannel extends EventTarget { constructor(label) { super(); this.label = label; this.readyState = 'connecting'; } }
class FakePc extends EventTarget {
  constructor() { super(); this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.localDescription = { sdp: 'fake' }; }
  createDataChannel(label) { return new FakeChannel(label); }
  async createOffer() { return { type: 'offer', sdp: 'o' }; }
  async createAnswer() { return { type: 'answer', sdp: 'a' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() { this.connectionState = 'closed'; }
}
globalThis.RTCPeerConnection = FakePc;

test('hostAccept_neverConnects_timeoutFreesTheSlot', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const states = [];
    const link = createLink({ onPeerState: (id, s) => states.push([id, s]) });
    for (let i = 0; i < MAX_GUESTS; i++) {
      const { id } = await link.hostOffer();
      await link.hostAccept(id, 'answer');
    }
    assert.equal(await link.hostOffer(), null, 'star is full before the timeout');

    mock.timers.tick(20000);

    assert.deepEqual(link.peerIds(), [], 'timed-out peers are released');
    assert.deepEqual(states.filter(([, s]) => s === 'timeout').map(([id]) => id), [1, 2, 3]);
    assert.equal((await link.hostOffer()).id, 1, 'a new invite can use the freed slot');
  } finally { mock.timers.reset(); }
});

test('guestAnswer_neverConnects_timeoutDropsTheHostPeer', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const link = createLink();
    await link.guestAnswer('offer');
    assert.deepEqual(link.peerIds(), [0]);
    mock.timers.tick(20000);
    assert.deepEqual(link.peerIds(), []);
  } finally { mock.timers.reset(); }
});
