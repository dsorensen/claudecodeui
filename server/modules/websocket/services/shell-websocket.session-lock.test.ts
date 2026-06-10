import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRefuseClaudeShellResume } from '@/modules/websocket/services/shell-websocket.service.js';

const chatActive = () => true;
const chatIdle = () => false;

test('refuses a claude resume shell while the chat SDK is processing that session', () => {
  const refuse = shouldRefuseClaudeShellResume(
    { provider: 'claude', hasSession: true, sessionId: 's1', isPlainShell: false },
    chatActive
  );
  assert.equal(refuse, true);
});

test('allows a claude resume shell when the chat SDK is not active', () => {
  const refuse = shouldRefuseClaudeShellResume(
    { provider: 'claude', hasSession: true, sessionId: 's1', isPlainShell: false },
    chatIdle
  );
  assert.equal(refuse, false);
});

test('never blocks a plain shell, even if the chat SDK is active', () => {
  const refuse = shouldRefuseClaudeShellResume(
    { provider: 'claude', hasSession: true, sessionId: 's1', isPlainShell: true },
    chatActive
  );
  assert.equal(refuse, false);
});

test('never blocks a non-claude provider (out of DEV-57 scope)', () => {
  const refuse = shouldRefuseClaudeShellResume(
    { provider: 'cursor', hasSession: true, sessionId: 's1', isPlainShell: false },
    chatActive
  );
  assert.equal(refuse, false);
});

test('never blocks when there is no session to resume', () => {
  assert.equal(
    shouldRefuseClaudeShellResume(
      { provider: 'claude', hasSession: false, sessionId: null, isPlainShell: false },
      chatActive
    ),
    false
  );
  assert.equal(
    shouldRefuseClaudeShellResume(
      { provider: 'claude', hasSession: true, sessionId: '', isPlainShell: false },
      chatActive
    ),
    false
  );
});
