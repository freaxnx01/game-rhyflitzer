// #834: netlink.js with a fake RTCPeerConnection — a connection attempt that times out must give its guest slot back.
// #835: the `pose` channel's routing (attachChannel) and sendPose.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLink, MAX_GUESTS } from '../netlink.js';

const CHANNELS = [];   // every channel the fakes created, so a test can reach the ones netlink opened behind its Maps
class FakeChannel extends EventTarget {
  constructor(label) { super(); this.label = label; this.readyState = 'connecting'; this.sent = []; CHANNELS.push(this); }
  send(data) { this.sent.push(data); }
}
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

// #835: strings are lobby text on whichever channel they arrive; binary is a pose record, but only on `pose`.
test('attachChannel_stringAnyChannel_binaryOnlyFromPoseChannel', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });   // hostOffer arms the code-TTL slot reclaim: keep it off the real clock
  try {
    CHANNELS.length = 0;
    const got = { msg: [], pose: [] };
    const link = createLink({ onMessage: (id, d) => got.msg.push([id, d]), onPose: (id, d) => got.pose.push([id, d]) });
    const { id } = await link.hostOffer();
    const ev = CHANNELS.find((c) => c.label === 'ev'), pose = CHANNELS.find((c) => c.label === 'pose');
    const ping = '{"type":"ping","a":1}', record = new ArrayBuffer(36);

    ev.dispatchEvent(new MessageEvent('message', { data: ping }));
    pose.dispatchEvent(new MessageEvent('message', { data: ping }));   // a string on the pose channel is lobby text too
    ev.dispatchEvent(new MessageEvent('message', { data: record }));    // binary has no business on `ev`: dropped
    pose.dispatchEvent(new MessageEvent('message', { data: record }));

    assert.deepEqual(got.msg, [[id, ping], [id, ping]], 'strings land in onMessage from either channel');
    assert.equal(got.pose.length, 1, 'binary reaches onPose from the pose channel alone');
    assert.ok(got.pose[0][0] === id && got.pose[0][1] === record, 'the raw ArrayBuffer arrives untouched, with its peer id');
  } finally { mock.timers.reset(); }
});

// #835: sendPose puts the buffer on the unreliable channel once it is open, and stays silent until then.
test('sendPose_openPoseChannel_sendsTheRecordOtherwiseSilentlySkips', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    CHANNELS.length = 0;
    const link = createLink();
    const { id } = await link.hostOffer();
    const pose = CHANNELS.find((c) => c.label === 'pose');
    const record = new ArrayBuffer(36);

    link.sendPose(id, record);              // the channel is still 'connecting': silently skipped
    assert.deepEqual(pose.sent, []);
    pose.readyState = 'open';
    link.sendPose(id, record);
    assert.equal(pose.sent.length, 1, 'the record goes out on the pose channel');
    assert.ok(pose.sent[0] === record, 'untouched, exactly the buffer handed in');
    link.sendPose(99, record);              // a peer that is not there: no throw, nothing sent anywhere
    assert.equal(pose.sent.length, 1);
  } finally { mock.timers.reset(); }
});
