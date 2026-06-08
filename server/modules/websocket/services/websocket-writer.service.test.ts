import assert from 'node:assert/strict';
import test from 'node:test';

import type { RealtimeClientConnection } from '@/shared/types.js';
import { WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import { WebSocketWriter } from '@/modules/websocket/services/websocket-writer.service.js';

const CLOSED_STATE = 3; // WebSocket.CLOSED

type FakeSocket = RealtimeClientConnection & { sent: string[] };

function fakeSocket(readyState: number): FakeSocket {
  return {
    readyState,
    sent: [],
    send(data: string) {
      this.sent.push(data);
    },
  };
}

function received(socket: FakeSocket): unknown[] {
  return socket.sent.map((s) => JSON.parse(s));
}

test('replays a terminal event missed while the socket was closed', () => {
  const closed = fakeSocket(CLOSED_STATE);
  const writer = new WebSocketWriter(closed);

  // Run finishes while the client is disconnected — the terminal event is
  // dropped on the closed socket (this is the DEV-56 bug).
  writer.send({ kind: 'complete', exitCode: 0 });
  assert.deepEqual(closed.sent, [], 'closed socket should receive nothing live');

  // Client reconnects: the writer flushes the buffer to the new socket.
  const reopened = fakeSocket(WS_OPEN_STATE);
  writer.updateWebSocket(reopened);

  assert.deepEqual(received(reopened), [{ kind: 'complete', exitCode: 0 }]);
});

test('replays already-streamed events to a reconnecting socket', () => {
  const first = fakeSocket(WS_OPEN_STATE);
  const writer = new WebSocketWriter(first);

  writer.send({ kind: 'chunk', text: 'a' });
  writer.send({ kind: 'chunk', text: 'b' });
  assert.equal(first.sent.length, 2, 'live socket receives both chunks');

  const second = fakeSocket(WS_OPEN_STATE);
  writer.updateWebSocket(second);

  assert.deepEqual(received(second), [
    { kind: 'chunk', text: 'a' },
    { kind: 'chunk', text: 'b' },
  ]);
});

test('preserves the buffer when a reconnect lands on a not-open socket', () => {
  const closed = fakeSocket(CLOSED_STATE);
  const writer = new WebSocketWriter(closed);
  writer.send({ kind: 'complete', exitCode: 0 });

  // A reconnect attempt to a socket that is not OPEN must not send and must
  // not drain the buffer.
  const stillClosed = fakeSocket(CLOSED_STATE);
  writer.updateWebSocket(stillClosed);
  assert.deepEqual(stillClosed.sent, [], 'must not write to a not-open socket');

  // A later successful reconnect still flushes the missed event.
  const open = fakeSocket(WS_OPEN_STATE);
  writer.updateWebSocket(open);
  assert.deepEqual(received(open), [{ kind: 'complete', exitCode: 0 }]);
});

test('buffers live-delivered events so a later reconnect can replay them', () => {
  const first = fakeSocket(WS_OPEN_STATE);
  const writer = new WebSocketWriter(first);

  writer.send({ kind: 'chunk', text: 'live' });
  assert.equal(first.sent.length, 1, 'delivered live to the open socket');

  const second = fakeSocket(WS_OPEN_STATE);
  writer.updateWebSocket(second);
  assert.deepEqual(received(second), [{ kind: 'chunk', text: 'live' }]);
});

test('bounds the replay buffer and drops the oldest events', () => {
  const REPLAY_BUFFER_MAX = 2000; // documented contract
  const closed = fakeSocket(CLOSED_STATE);
  const writer = new WebSocketWriter(closed);

  const overflow = 5;
  for (let i = 0; i < REPLAY_BUFFER_MAX + overflow; i++) {
    writer.send({ kind: 'chunk', seq: i });
  }

  const open = fakeSocket(WS_OPEN_STATE);
  writer.updateWebSocket(open);
  const events = received(open) as Array<{ seq: number }>;

  assert.equal(events.length, REPLAY_BUFFER_MAX, 'buffer is capped at the max');
  assert.equal(events[0].seq, overflow, 'oldest events were dropped');
  assert.equal(events[events.length - 1].seq, REPLAY_BUFFER_MAX + overflow - 1);
});
