// netlink.js — #834: the WebRTC host star of the multiplayer race. Browser only (RTCPeerConnection): the node tests
// cover netcodec.js and netrace.js, and this file against a fake RTCPeerConnection (tests/netlink.test.mjs); the real
// handshake is exercised by tests/test_multiplayer_lobby.py.
// No signaling server, no PeerJS, no Firebase, no TURN: the players exchange the codes themselves (netcodec.js).
// The host keeps one connection per guest (guest ids 1..3) and relays; a guest has exactly one connection, to the host (peer 0).

import { CODE_TTL } from './netcodec.js';

export const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
export const HOST_ID = 0;
export const MAX_GUESTS = 3;
const GATHER_MS = 5000;     // ICE is gathered to 'complete', but a candidate that never arrives must not hang the code
const CONNECT_MS = 20000;   // the host's deadline after hostAccept: no connection this long after the answer is the NAT/Wi-Fi error

// gatherIce(pc) — the local description once ICE gathering is complete, or whatever it has after GATHER_MS
function gatherIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, GATHER_MS);
    pc.addEventListener('icegatheringstatechange', check);
    check();
  });
}

// createLink({ iceServers, onMessage, onPose, onPeerState }) — one object per page; the page is either a host or a guest, never both.
// onMessage(peerId, rawText) gets the untouched channel text: the caller validates it with parseMessage.
// onPose(peerId, buf) gets raw ArrayBuffers from the `pose` channel: the caller validates them with parsePose (#835).
// peerId is the only trustworthy fact about the sender; the id inside the record is peer-supplied and must be
// cross-checked against peerId by the consumer (see parsePose) — a guest may forge another player's id.
// onPeerState(peerId, state) gets the connection state, plus 'timeout' when a peer never connects.
export function createLink({ iceServers = STUN, onMessage = () => {}, onPose = () => {}, onPeerState = () => {} } = {}) {
  const peers = new Map();   // peerId -> { pc, ev, pose, timers: [] }

  function wire(peerId, entry) {
    const { pc } = entry;
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') clearTimers(entry);
      onPeerState(peerId, pc.connectionState);
    });
  }

  function clearTimers(entry) { entry.timers.forEach(clearTimeout); entry.timers = []; }

  // armConnectDeadline(peerId, entry) — still not connected CONNECT_MS after the answer: report the trouble and drop the
  // peer. The drop matters as much as the message: a host slot an unreachable guest never freed would stay taken for the
  // rest of the session, and three such attempts would leave the host unable to invite anybody.
  function armConnectDeadline(peerId, entry) {
    entry.timers.push(setTimeout(() => {
      if (entry.pc.connectionState === 'connected') return;
      onPeerState(peerId, 'timeout');
      close(peerId);
    }, CONNECT_MS));
  }

  // armAnswerLifetime(entry) — no 20 s deadline: the answer travels by hand. The host's slot lives CODE_TTL s; after that an
  // untaken answer is dead; once ICE runs (not 'new') the host has it.
  function armAnswerLifetime(entry) {
    entry.timers.push(setTimeout(() => {
      if (entry.pc.connectionState !== 'new') return;
      onPeerState(HOST_ID, 'timeout');
      close(HOST_ID);
    }, CODE_TTL * 1000));
  }

  function attachChannel(peerId, entry, channel) {
    entry[channel.label] = channel;
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('message', (e) => {
      if (typeof e.data === 'string') onMessage(peerId, e.data);
      else if (channel.label === 'pose' && e.data instanceof ArrayBuffer) onPose(peerId, e.data);
    });
  }

  function openPeer(peerId) {
    const entry = { pc: new RTCPeerConnection({ iceServers }), ev: null, pose: null, timers: [] };
    peers.set(peerId, entry);
    wire(peerId, entry);
    return entry;
  }

  // hostOffer() — { id, sdp } for the next free guest slot, or null when the star is full.
  // Both channels are opened here: `ev` reliable for the lobby and race events, `pose` unreliable for the pose stream (#835).
  async function hostOffer() {
    const id = [...Array(MAX_GUESTS).keys()].map((i) => i + 1).find((i) => !peers.has(i));
    if (id === undefined) return null;

    const entry = openPeer(id);
    attachChannel(id, entry, entry.pc.createDataChannel('ev'));
    attachChannel(id, entry, entry.pc.createDataChannel('pose', { ordered: false, maxRetransmits: 0 }));
    entry.ev.addEventListener('open', () => onPeerState(id, 'open'));

    await entry.pc.setLocalDescription(await entry.pc.createOffer());
    await gatherIce(entry.pc);
    // a slot nobody answers within the code's lifetime is given back, so the host can offer it to someone else
    entry.timers.push(setTimeout(() => { if (entry.pc.connectionState !== 'connected') close(id); }, CODE_TTL * 1000));
    return { id, sdp: entry.pc.localDescription.sdp };
  }

  // hostAccept(id, sdp) — the guest's answer for that slot; from here the 20 s connection deadline runs
  async function hostAccept(id, sdp) {
    const entry = peers.get(id);
    if (!entry) return false;
    await entry.pc.setRemoteDescription({ type: 'answer', sdp });
    clearTimers(entry);
    armConnectDeadline(id, entry);
    return true;
  }

  // guestAnswer(sdp) — the host's offer in, the answer code's SDP out. The host created both channels, so they arrive here.
  async function guestAnswer(sdp) {
    const entry = openPeer(HOST_ID);
    entry.pc.addEventListener('datachannel', (e) => {
      attachChannel(HOST_ID, entry, e.channel);
      if (e.channel.label === 'ev') e.channel.addEventListener('open', () => onPeerState(HOST_ID, 'open'));
    });

    await entry.pc.setRemoteDescription({ type: 'offer', sdp });
    await entry.pc.setLocalDescription(await entry.pc.createAnswer());
    await gatherIce(entry.pc);
    armAnswerLifetime(entry);
    return entry.pc.localDescription.sdp;
  }

  // send(peerId, msg) — one JSON message on the reliable channel; silently skipped while the channel is not open yet
  function send(peerId, msg) {
    const channel = peers.get(peerId)?.ev;
    if (channel?.readyState !== 'open') return;
    channel.send(JSON.stringify(msg));
  }

  function broadcast(msg) { for (const peerId of peers.keys()) send(peerId, msg); }

  // sendPose(peerId, buf) — one binary pose record on the unreliable channel; silently skipped while it is not open
  function sendPose(peerId, buf) {
    const channel = peers.get(peerId)?.pose;
    if (channel?.readyState !== 'open') return;
    channel.send(buf);
  }

  function close(peerId) {
    const entry = peers.get(peerId);
    if (!entry) return;
    clearTimers(entry);
    peers.delete(peerId);
    try { entry.pc.close(); } catch (e) { /* already gone */ }
  }

  function closeAll() { for (const peerId of [...peers.keys()]) close(peerId); }

  const peerIds = () => [...peers.keys()];

  return { hostOffer, hostAccept, guestAnswer, send, sendPose, broadcast, close, closeAll, peerIds };
}
