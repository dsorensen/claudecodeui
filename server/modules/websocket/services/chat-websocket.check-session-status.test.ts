import assert from 'node:assert/strict';
import test from 'node:test';

import { WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';

type WsArg = Parameters<typeof handleChatConnection>[0];
type ReqArg = Parameters<typeof handleChatConnection>[1];
type DepsArg = Parameters<typeof handleChatConnection>[2];

type Harness = {
  sent: unknown[];
  reconnectCalls: Array<{ sessionId: string; ws: unknown }>;
  emitMessage: (payload: unknown) => Promise<void>;
};

function setupHandler(isActive: boolean): Harness {
  const messageHandlers: Array<(arg: unknown) => unknown> = [];
  const sentRaw: string[] = [];
  const reconnectCalls: Array<{ sessionId: string; ws: unknown }> = [];

  const ws = {
    readyState: WS_OPEN_STATE,
    send(data: string) {
      sentRaw.push(data);
    },
    on(event: string, cb: (arg: unknown) => unknown) {
      if (event === 'message') messageHandlers.push(cb);
    },
  } as unknown as WsArg;

  const dependencies = {
    isClaudeSDKSessionActive: () => isActive,
    reconnectSessionWriter: (sessionId: string, sock: unknown) => {
      reconnectCalls.push({ sessionId, ws: sock });
      return true;
    },
  } as unknown as DepsArg;

  handleChatConnection(ws, {} as ReqArg, dependencies);

  return {
    get sent() {
      return sentRaw.map((s) => JSON.parse(s));
    },
    reconnectCalls,
    emitMessage: async (payload: unknown) => {
      for (const handler of messageHandlers) {
        await handler(typeof payload === 'string' ? payload : JSON.stringify(payload));
      }
    },
  };
}

test('check-session-status reconnects the writer even when the session already completed', async () => {
  const h = setupHandler(false);

  await h.emitMessage({ type: 'check-session-status', provider: 'claude', sessionId: 'sess-done' });

  // The session finished while the client was away — but the writer is kept
  // alive in a grace period, so reconnect must still run to flush the replay
  // buffer (the missed terminal event).
  assert.equal(h.reconnectCalls.length, 1, 'reconnect runs regardless of active state');
  assert.equal(h.reconnectCalls[0].sessionId, 'sess-done');

  const statusEvent = h.sent.find(
    (m): m is { type: string; isProcessing: boolean } =>
      typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'session-status'
  );
  assert.ok(statusEvent, 'a session-status reply is sent');
  assert.equal(statusEvent.isProcessing, false, 'still reports the real processing state');
});

test('check-session-status reconnects and reports active for a still-processing session', async () => {
  const h = setupHandler(true);

  await h.emitMessage({ type: 'check-session-status', provider: 'claude', sessionId: 'sess-live' });

  assert.equal(h.reconnectCalls.length, 1);
  assert.equal(h.reconnectCalls[0].sessionId, 'sess-live');

  const statusEvent = h.sent.find(
    (m): m is { type: string; isProcessing: boolean } =>
      typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'session-status'
  );
  assert.ok(statusEvent);
  assert.equal(statusEvent.isProcessing, true);
});
