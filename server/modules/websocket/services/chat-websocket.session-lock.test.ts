import assert from 'node:assert/strict';
import test from 'node:test';

import { WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';

type WsArg = Parameters<typeof handleChatConnection>[0];
type ReqArg = Parameters<typeof handleChatConnection>[1];
type DepsArg = Parameters<typeof handleChatConnection>[2];

function setup(opts: { ptyConflict: boolean }) {
  const messageHandlers: Array<(arg: unknown) => unknown> = [];
  const sentRaw: string[] = [];
  const queryCalls: Array<{ command: string; options: unknown }> = [];
  const findCalls: string[] = [];

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
    queryClaudeSDK: async (command: string, options: unknown) => {
      queryCalls.push({ command, options });
    },
    findPtyForSessionId: (sessionId: string) => {
      findCalls.push(sessionId);
      return opts.ptyConflict ? { key: 'pty-key' } : null;
    },
  } as unknown as DepsArg;

  handleChatConnection(ws, {} as ReqArg, dependencies);

  return {
    queryCalls,
    findCalls,
    get sent() {
      return sentRaw.map((s) => JSON.parse(s));
    },
    emit: async (payload: unknown) => {
      for (const handler of messageHandlers) await handler(JSON.stringify(payload));
    },
  };
}

test('refuses a chat resume when a shell PTY already owns the session', async () => {
  const h = setup({ ptyConflict: true });

  await h.emit({ type: 'claude-command', command: 'hi', options: { sessionId: 'sess-shell-owned' } });

  assert.equal(h.queryCalls.length, 0, 'must not start the SDK while a shell owns the session');
  assert.ok(
    h.sent.some((m) => JSON.stringify(m).includes('A shell is still active')),
    'sends a refusal error to the client'
  );
});

test('allows a chat resume when no shell owns the session', async () => {
  const h = setup({ ptyConflict: false });

  await h.emit({ type: 'claude-command', command: 'hi', options: { sessionId: 'sess-free' } });

  assert.equal(h.queryCalls.length, 1, 'SDK runs when there is no shell conflict');
  assert.deepEqual(h.findCalls, ['sess-free'], 'the lock is consulted for a resume');
});

test('does not consult the shell lock for a brand-new session', async () => {
  const h = setup({ ptyConflict: true });

  await h.emit({ type: 'claude-command', command: 'hi', options: {} });

  assert.equal(h.queryCalls.length, 1, 'a new session runs without a lock check');
  assert.deepEqual(h.findCalls, [], 'lock is not consulted without a resume sessionId');
});
